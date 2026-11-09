import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import XLSX from 'xlsx';
import { laskaWorkbookRows } from '../../services/laskaWorkbookRows.js';
import { archiveDriveFile } from '../../services/driveArchive.js';
import { parseReceivables, assignOwners, textKey, cleanText } from './receivables.domain.js';

export async function listFiles(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const result = await drive.files.list({ q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,parents,modifiedTime,version)', pageSize: 1000,
      pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true });
    files.push(...(result.data.files || []));
    pageToken = result.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function uniqueFolder(drive, parent, name) {
  const folders = (await listFiles(drive, parent)).filter(file => file.name === name && file.mimeType === 'application/vnd.google-apps.folder');
  if (folders.length !== 1) throw new Error(`Потрібна одна папка ${name} для дебіторки`);
  return folders[0].id;
}

export async function resolveReceivablesFolders(drive, configuredRoot) {
  let root = process.env.LASKA_RECEIVABLES_FOLDER_ID || configuredRoot;
  if (!root) {
    const salesFolder = process.env.LASKA_UPLOADS_FOLDER_ID;
    if (!salesFolder) throw new Error('LASKA_UPLOADS_FOLDER_ID is not configured');
    const result = await drive.files.get({fileId: salesFolder, fields: 'parents', supportsAllDrives: true});
    if (result.data.parents?.length !== 1) throw new Error('Не вдалося визначити папку Ласки');
    root = await uniqueFolder(drive, result.data.parents[0], 'Receivables');
  }
  return { root, uploads: await uniqueFolder(drive, root, 'Uploads'), archive: await uniqueFolder(drive, root, 'Archive') };
}

async function download(drive, file, directory) {
  const filePath = path.join(directory, `${file.id}${path.extname(file.name) || '.xlsx'}`);
  const result = await drive.files.get({fileId: file.id, alt: 'media', supportsAllDrives: true}, {responseType: 'stream'});
  await pipeline(result.data, createWriteStream(filePath));
  return filePath;
}

export function readNetworks(filePath) {
  const book = XLSX.readFile(filePath, {dense: true});
  const sheet = book.Sheets[book.SheetNames.find(name => ['мережі', 'мережи', 'networks'].includes(textKey(name)))];
  if (!sheet) throw new Error('У довіднику немає аркуша «мережі»');
  const rows = XLSX.utils.sheet_to_json(sheet, {header: 1, defval: null});
  if (textKey(rows[0]?.[0]) !== 'тт') throw new Error('Довідник мереж: перша колонка повинна називатися ТТ');
  const map = new Map();
  for (const row of rows.slice(1)) {
    const key = textKey(row[0]);
    if (key) map.set(key, Number(row[1]) === 1);
  }
  if (!map.size) throw new Error('Довідник мереж порожній');
  return new Set([...map].filter(([, network]) => network).map(([key]) => key));
}

export async function runReceivablesImport({drive, repository, pool, folders}) {
  const sourceFiles = (await listFiles(drive, folders.uploads)).filter(file => /^8(?:\.(xlsx|xls))?$/i.test(file.name || ''));
  if (!sourceFiles.length) return { found: 0, processed: 0 };
  // Only the newest complete snapshot matters; older queued exports must not replace it.
  sourceFiles.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime) || String(a.id).localeCompare(String(b.id)));
  if (sourceFiles.length > 1 && sourceFiles[0].modifiedTime === sourceFiles[1].modifiedTime) throw new Error('Два файли «8» з однаковою датою. Залиште актуальний файл.');
  const file = sourceFiles[0];
  const networksFiles = (await listFiles(drive, folders.root)).filter(file => /^Мережі\.(xlsx|xlsm|xls)$/i.test(file.name || ''));
  if (networksFiles.length !== 1) throw new Error('У Receivables потрібен один довідник Мережі.xlsx або Мережі.xlsm');
  const networksFile = networksFiles[0];
  const record = await repository.syncRecord();
  if (record && new Date(record.modified_time) > new Date(file.modifiedTime)) return {found: sourceFiles.length, processed: 0, skippedOlder: true};
  const same = record?.file_id === file.id && String(record.version) === String(file.version) &&
    new Date(record.modified_time).getTime() === new Date(file.modifiedTime).getTime() &&
    new Date(record.networks_modified_time).getTime() === new Date(networksFile.modifiedTime).getTime();
  let result = {found: sourceFiles.length, processed: 0};
  if (!same) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'laska-receivables-'));
    try {
      const sourcePath = await download(drive, file, directory);
      const networksPath = await download(drive, networksFile, directory);
      const { documents, controlBalanceCents } = await parseReceivables(laskaWorkbookRows(sourcePath));
      const networks = readNetworks(networksPath);
      const agents = (await pool.query('SELECT ta,department,route FROM agents')).rows;
      const assigned = assignOwners(documents, agents);
      // Verify both downloads still represent the versions originally listed.
      for (const source of [file, networksFile]) {
        const current = (await drive.files.get({fileId: source.id, fields:'version,modifiedTime,trashed,parents', supportsAllDrives:true})).data;
        if (current.trashed || String(current.version) !== String(source.version) || current.modifiedTime !== source.modifiedTime ||
            !current.parents?.includes(source === file ? folders.uploads : folders.root)) throw new Error('Файл змінився під час імпорту. Повторна спроба через 5 хвилин.');
      }
      result = {...result, processed: 1, ...await repository.replace(assigned, networks, file, networksFile.modifiedTime, controlBalanceCents)};
    } finally { await fs.rm(directory, {recursive: true, force: true}); }
  }
  const cleanupErrors = [];
  let archived = 0;
  // All these exports are older than or equal to the successfully committed snapshot.
  for (const source of sourceFiles) {
    try { await archiveDriveFile({drive,file:source,uploadsFolder:folders.uploads,archiveFolder:folders.archive}); archived++; }
    catch (error) { cleanupErrors.push({fileId:source.id,message:cleanText(error.message)}); }
  }
  return {...result,archived,cleanupErrors};
}
