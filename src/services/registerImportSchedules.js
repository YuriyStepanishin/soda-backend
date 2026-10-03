import { processGoogleDriveImports } from './olgatorgProcessGoogleDriveImports.js';
import { processLaskaGoogleDriveImports } from './laskaProcessGoogleDriveImports.js';
import { scheduleImport } from '../utils/scheduleImport.js';

const isEnabled = (value, defaultValue) =>
  (value || defaultValue).toLowerCase() === 'true';

export const registerImportSchedules = () => {
  const timezone = process.env.APP_TIMEZONE || 'Europe/Kyiv';
  process.env.TZ = process.env.TZ || timezone;

  scheduleImport({
    enabled: isEnabled(process.env.IMPORT_CRON_ENABLED, 'true'),
    schedule: process.env.IMPORT_CRON_SCHEDULE || '*/5 * * * *',
    timezone,
    label: 'Import Cron',
    run: processGoogleDriveImports,
  });

  scheduleImport({
    enabled: isEnabled(process.env.LASKA_IMPORT_CRON_ENABLED, 'false'),
    schedule: process.env.LASKA_IMPORT_CRON_SCHEDULE || '0 2 * * *',
    timezone,
    label: 'LASKA Import Cron',
    run: processLaskaGoogleDriveImports,
  });
};
