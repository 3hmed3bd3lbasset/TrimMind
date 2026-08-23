import cron from 'node-cron';
import { container } from '../container.js';

export function initNoShowProtectionCron() {
  // Run every 10 minutes to auto-detect and reclaim lost chair time from no-shows
  cron.schedule('*/10 * * * *', async () => {
    try {
      const processedCount = await container.processNoShowsUseCase.execute(35);
      if (processedCount > 0) {
        console.log(`🛡️ [No-show Protection] Successfully processed and reclaimed ${processedCount} overdue booking(s).`);
      }
    } catch (err: any) {
      console.warn('[No-show Protection Cron Error]:', err.message);
    }
  });

  console.log('⏰ Auto No-show Protection & Chair Reclaiming Cron initialized (Clean Architecture).');
}
