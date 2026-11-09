import { getPool } from '../../db/index.js';
import { drive } from '../../config/googleDrive.js';
import { createReceivablesRepository } from './receivables.repository.js';
import { resolveReceivablesFolders, runReceivablesImport } from './receivables.import.js';
export const receivablesRepository = createReceivablesRepository(getPool('laska'));
let running;
export function processReceivablesImports() {
  if (!running) running = (async () => runReceivablesImport({drive,repository:receivablesRepository,
    pool:getPool('laska'),folders:await resolveReceivablesFolders(drive, await receivablesRepository.folderId())}))().finally(() => { running = null; });
  return running;
}
