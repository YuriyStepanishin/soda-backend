import XLSX from 'xlsx';
import { getPool } from '../db/index.js';
import { drive } from '../config/googleDrive.js';

const laskaPool = getPool('laska');

const DICTIONARY_FILES = {
  agents: 'Довідник ТА+ПТТ.xlsx',
  products: 'Довідник товарів.xlsx',
};

const downloadDictionary = async (fileName) => {
  const folderId = process.env.LASKA_DICTIONARIES_FOLDER_ID;

  if (!folderId) {
    throw new Error('LASKA_DICTIONARIES_FOLDER_ID is not configured');
  }

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const file = (response.data.files || []).find(
    (item) => item.name === fileName,
  );

  if (!file) {
    throw new Error(`Google Drive dictionary not found: ${fileName}`);
  }

  const download = await drive.files.get(
    {
      fileId: file.id,
      alt: 'media',
      supportsAllDrives: true,
    },
    { responseType: 'stream' },
  );
  const chunks = [];

  for await (const chunk of download.data) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

export const importAgents = async () => {
  const workbook = XLSX.read(
    await downloadDictionary(DICTIONARY_FILES.agents),
    {
      type: 'buffer',
    },
  );
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
  });

  console.log(`[LASKA] ТА у файлі: ${rows.length}`);

  await laskaPool.query('TRUNCATE TABLE agents RESTART IDENTITY');

  for (const row of rows) {
    await laskaPool.query(
      `
      INSERT INTO agents (
        ta,
        department,
        route
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (ta)
      DO UPDATE SET
        department = EXCLUDED.department,
        route = EXCLUDED.route
      `,
      [
        String(row['ТА'] ?? '').trim(),
        String(row['Відділ'] ?? '').trim() || null,
        String(row['Маршрут'] ?? '').trim() || null,
      ],
    );
  }

  console.log(`[LASKA] Довідник ТА імпортовано: ${rows.length}`);

  return rows.length;
};

export const importProducts = async () => {
  const workbook = XLSX.read(
    await downloadDictionary(DICTIONARY_FILES.products),
    { type: 'buffer' },
  );
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
  });

  console.log('[LASKA] Заголовки:', Object.keys(rows[0] || {}));

  console.log(`[LASKA] Товарів у файлі: ${rows.length}`);

  await laskaPool.query('TRUNCATE TABLE products RESTART IDENTITY');

  for (const row of rows) {
    await laskaPool.query(
      `
      INSERT INTO products (
        product_name,
        manufacturer,
        tm,
        group_name,
        subgroup,
        packaging
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (product_name)
      DO UPDATE SET
        manufacturer = EXCLUDED.manufacturer,
        tm = EXCLUDED.tm,
        group_name = EXCLUDED.group_name,
        subgroup = EXCLUDED.subgroup,
        packaging = EXCLUDED.packaging
      `,
      [
        String(row['товар'] ?? '').trim(),
        String(row['Виробник'] ?? '').trim() || null,
        String(row['ТМ'] ?? '').trim() || null,
        String(row['Група'] ?? '').trim() || null,
        String(row['Підгрупа'] ?? '').trim() || null,
        String(row['Фасовка'] ?? '').trim() || null,
      ],
    );
  }

  console.log(`[LASKA] Довідник товарів імпортовано: ${rows.length}`);

  return rows.length;
};
