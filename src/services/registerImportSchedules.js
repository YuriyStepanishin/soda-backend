import { processGoogleDriveImports } from './olgatorgProcessGoogleDriveImports.js';
import { processLaskaGoogleDriveImports } from './laskaProcessGoogleDriveImports.js';
import { scheduleImport } from '../utils/scheduleImport.js';
import { processReceivablesImports } from '../modules/receivables/receivables.service.js';

const isEnabled = (value, defaultValue) =>
  (value || defaultValue).toLowerCase() === 'true';

export const registerImportSchedules = () => {
  const timezone = process.env.DB_TIMEZONE;
  process.env.TZ = process.env.TZ || timezone;

  scheduleImport({
    enabled: isEnabled(process.env.LASKA_RECEIVABLES_CRON_ENABLED, 'true'),
    schedule: process.env.LASKA_RECEIVABLES_CRON_SCHEDULE || '*/5 * * * *',
    timezone: timezone || 'Europe/Kyiv',
    label: 'LASKA Receivables Cron',
    run: processReceivablesImports,
  });

  scheduleImport({
    enabled: isEnabled(process.env.IMPORT_CRON_ENABLED, 'true'),
    schedule: process.env.IMPORT_CRON_SCHEDULE || '*/5 * * * *',
    timezone,
    label: 'OLGATORG Import Cron',
    run: processGoogleDriveImports,
  });

  scheduleImport({
    enabled: isEnabled(process.env.LASKA_IMPORT_CRON_ENABLED, 'true'),
    schedule: process.env.LASKA_IMPORT_CRON_SCHEDULE || '*/5 * * * *',
    timezone,
    label: 'LASKA Import Cron',
    run: processLaskaGoogleDriveImports,
  });
};
