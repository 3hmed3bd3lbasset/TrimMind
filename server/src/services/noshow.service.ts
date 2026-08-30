import cron from 'node-cron';
import { container } from '../container.js';

export function initNoShowProtectionCron() {
  // No-show auto-cancellation disabled to prevent premature booking removal
  console.log('⏰ Auto No-show Protection initialized in passive audit mode (No automatic deletions).');
}
