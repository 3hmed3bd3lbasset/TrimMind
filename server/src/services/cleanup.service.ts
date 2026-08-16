import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { query } from '../config/database.js';

const uploadDir = process.env.UPLOAD_DIR || 'uploads';

export function initCleanupCron() {
  // Run every 15 minutes to purge images older than 2 hours after confirmation
  cron.schedule('*/15 * * * *', async () => {
    try {
      // Find proofs reviewed/confirmed > 2 hours ago
      const expiredProofs = await query<any[]>(
        `SELECT pp.id, pp.image_path, pp.booking_id 
         FROM payment_proofs pp
         JOIN bookings b ON pp.booking_id = b.id
         WHERE pp.is_image_purged = 0
           AND (b.status IN ('confirmed', 'completed', 'in_service', 'rejected', 'cancelled'))
           AND (
             pp.reviewed_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)
             OR (pp.reviewed_at IS NULL AND pp.submitted_at < DATE_SUB(NOW(), INTERVAL 3 HOUR))
           )`
      );

      if (expiredProofs && expiredProofs.length > 0) {
        console.log(`🧹 Auto-Purge: Found ${expiredProofs.length} expired receipt image(s) to remove`);

        for (const proof of expiredProofs) {
          if (proof.image_path && !proof.image_path.startsWith('http')) {
            const fullPath = path.resolve(uploadDir, path.basename(proof.image_path));
            if (fs.existsSync(fullPath)) {
              try {
                fs.unlinkSync(fullPath);
              } catch (err: any) {
                console.warn('Failed to delete physical file:', fullPath, err.message);
              }
            }
          }

          // Mark as purged in DB
          await query(
            'UPDATE payment_proofs SET is_image_purged = 1, purged_at = NOW() WHERE id = ?',
            [proof.id]
          );
        }
      }
    } catch (error: any) {
      console.warn('⚠️ Cleanup cron job error:', error.message);
    }
  });

  console.log('⏰ 2-Hour Receipt Auto-Purge Scheduled Task initialized.');
}
