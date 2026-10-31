import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import unzipper from 'unzipper';
import { SaxesParser } from 'saxes';
import { StringDecoder } from 'node:string_decoder';

// Some 1C exports use SharedStrings.xml instead of sharedStrings.xml.
// ExcelJS skips that spelling. Read its string table without expanding cells.
async function loadNonstandardStrings(reader, filePath) {
  const directory = await unzipper.Open.file(filePath);
  const entry = directory.files.find(file => file.path.toLowerCase() === 'xl/sharedstrings.xml');
  if (!entry || entry.path === 'xl/sharedStrings.xml') return;
  const strings = [];
  const parser = new SaxesParser({ xmlns: true });
  const decoder = new StringDecoder('utf8');
  let text = '', inText = false, phoneticDepth = 0;
  parser.on('opentag', node => {
    if (node.local === 'si') text = '';
    if (node.local === 'rPh') phoneticDepth++;
    if (node.local === 't' && !phoneticDepth) inText = true;
  });
  parser.on('text', value => { if (inText) text += value; });
  parser.on('closetag', node => {
    if (node.local === 't') inText = false;
    if (node.local === 'rPh') phoneticDepth--;
    if (node.local === 'si') strings.push(text);
  });
  for await (const chunk of entry.stream()) parser.write(decoder.write(chunk));
  parser.write(decoder.end()).close();
  reader.sharedStrings = strings;
}

const cellValue = value => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('result' in value) return value.result;
    if (value.richText) return value.richText.map(part => part.text).join('');
    if ('text' in value) return value.text;
    throw new Error('Unsupported Excel cell value');
  }
  return value ?? null;
};

export async function* laskaWorkbookRows(filePath) {
  if (/\.xlsx$/i.test(filePath)) {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
      sharedStrings: 'cache', styles: 'cache', hyperlinks: 'ignore', worksheets: 'emit',
    });
    await loadNonstandardStrings(reader, filePath);
    let firstSheet = true;
    for await (const sheet of reader) {
      for await (const row of sheet) {
        if (!firstSheet || row.number <= 5) continue;
        yield { row: Array.from({ length: 16 }, (_, column) => cellValue(row.getCell(column + 1).value)), rowNumber: row.number };
      }
      firstSheet = false;
    }
    if (firstSheet) throw new Error('Workbook contains no worksheet');
    return;
  }
  // Legacy XLS has no streaming reader. Dense mode avoids a large address map.
  const workbook = XLSX.readFile(filePath, { cellDates: true, dense: true, cellText: false, cellHTML: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Workbook contains no worksheet');
  const lastRow = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).e.r : -1;
  for (let index = 5; index <= lastRow; index += 1) {
    yield { row: Array.from({ length: 16 }, (_, column) => sheet[index]?.[column]?.v ?? null), rowNumber: index + 1 };
  }
}
