import cron from 'node-cron';

export const scheduleImport = ({ enabled, schedule, timezone, label, run }) => {
  if (!enabled) return;

  let isRunning = false;

  cron.schedule(
    schedule,
    async () => {
      if (isRunning) {
        console.log(`[${label}] Previous run still in progress, skip tick`);
        return;
      }

      isRunning = true;

      try {
        const summary = await run();
        console.log(`[${label}] Completed:`, summary);
      } catch (error) {
        console.error(`[${label}] Failed:`, error.message);
      } finally {
        isRunning = false;
      }
    },
    { timezone },
  );

  console.log(`[${label}] Enabled with schedule "${schedule}" (${timezone})`);
};
