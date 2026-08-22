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

export async function ensureInitialDbData() {
  try {
    // 1. Check & Seed Branches
    const branches = await query<any[]>('SELECT id FROM branches LIMIT 1');
    if (!branches || branches.length === 0) {
      await query(`
        INSERT INTO branches (id, name, address, phone, opening_time, closing_time, is_active, instapay_username, vodafone_cash_number)
        VALUES ('branch-elhdad', 'الحداد - ELHDAD', 'سقيل - مركز اوسيم', '01285694670', '10:00', '23:30', 1, '01285694670', '01285694689')
        ON DUPLICATE KEY UPDATE name=VALUES(name)
      `);
      console.log('✅ Auto-seeded branch-elhdad into MySQL DB');
    }

    // 2. Check & Seed Barbers
    const barbers = await query<any[]>('SELECT id FROM barbers LIMIT 1');
    if (!barbers || barbers.length === 0) {
      const barberList = [
        ['barber-mohamed', 'branch-elhdad', 'محمد الحداد', '01285694670', 'كبير الحلاقين وقصات VIP الملكية', 1, '[]'],
        ['barber-karim', 'branch-elhdad', 'كريم السيد', '01123456789', 'قص شعر وتدريج عصري Fade', 1, '[]'],
        ['barber-omar', 'branch-elhdad', 'عمر خالد', '01098765432', 'عناية كاملة باللحية والبشرة', 1, '[]'],
      ];
      for (const b of barberList) {
        await query(`
          INSERT INTO barbers (id, branch_id, full_name, phone, specialty, is_active, service_ids)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE full_name=VALUES(full_name)
        `, b);
      }
      console.log('✅ Auto-seeded barbers into MySQL DB');
    }

    // 3. Check & Seed Chairs
    const chairs = await query<any[]>('SELECT id FROM chairs LIMIT 1');
    if (!chairs || chairs.length === 0) {
      const chairList = [
        ['chair-1', 'branch-elhdad', 'barber-mohamed', 'الكرسي الملكي VIP 1', 'vip', 1],
        ['chair-2', 'branch-elhdad', 'barber-karim', 'كرسي العناية 2', 'normal', 1],
        ['chair-3', 'branch-elhdad', 'barber-omar', 'كرسي العناية 3', 'normal', 1],
      ];
      for (const c of chairList) {
        await query(`
          INSERT INTO chairs (id, branch_id, barber_id, name, mode, is_active)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE name=VALUES(name)
        `, c);
      }
      console.log('✅ Auto-seeded chairs into MySQL DB');
    }

    // 4. Check & Seed Services
    const services = await query<any[]>('SELECT id FROM services LIMIT 1');
    if (!services || services.length === 0) {
      const serviceList = [
        ['srv-vip-executive', 'VIP Executive', 'الباقة التنفيذية الفاخرة لرجال الأعمال والنخبة (شاملة كل الخدمات والعناية الملكية والجناح الخاص)', 900, 120, 'vip_package', 1, 1],
        ['srv-vip-royal', 'VIP Royal Cut', 'تجربة ملكية متكاملة لقص الشعر بأعلى مستوى من الدقة (جناح خاص ومكيف، كرسي مساج، شاشة سينما، دخول فوري بدون انتظار)', 650, 60, 'vip_package', 1, 1],
        ['srv-vip-gentleman', 'VIP Gentleman', 'عناية شاملة ومميزة بالشعر واللحية في أجواء من الخصوصية التامة (جناح خاص، كرسي مساج، سينما، دخول فوري)', 650, 90, 'vip_package', 1, 1],
        ['srv-haircut-beard', 'قص شعر + لحية', 'قص شعر متكامل وتحديد اللحية بالموس وحمام بخار تركي', 220, 40, 'hair', 0, 1],
        ['srv-haircut-classic', 'قص شعر كلاسيكي', 'قص وتصفيف شعر احترافي مع غسيل وسشوار', 180, 30, 'hair', 0, 1],
        ['srv-fade', 'تدريج Fade عصري', 'تدريج دقيق وعصري بأحدث الماكينات العالمية', 180, 35, 'hair', 0, 1],
        ['srv-kids', 'قص شعر أطفال', 'قص شعر لطيف للأطفال مع ألعاب وشاشات ترفيهية', 150, 25, 'kids', 0, 1],
      ];
      for (const s of serviceList) {
        await query(`
          INSERT INTO services (id, name, description, price, duration_minutes, category, is_vip_only, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE name=VALUES(name)
        `, s);
      }
      console.log('✅ Auto-seeded services into MySQL DB');
    }

    // 5. Check & Seed Products
    const products = await query<any[]>('SELECT id FROM products LIMIT 1');
    if (!products || products.length === 0) {
      const productList = [
        ['prod-espresso', 'branch-elhdad', 'إسبريسو دبل فاخر', 'hot_drink', 35, 1, 'قهوة إسبريسو إيطالية فاخرة 100% أرابيكا'],
        ['prod-latte', 'branch-elhdad', 'كافيه لاتيه بحليب الشوفان', 'hot_drink', 45, 1, 'مزيج القهوة الغنية مع الحليب الرغوي'],
        ['prod-fresh-juice', 'branch-elhdad', 'عصير برتقال فريش طازج', 'cold_drink', 40, 1, 'برتقال طبيعي معصور طازجاً بدون سكر مضاف'],
        ['prod-energy-drink', 'branch-elhdad', 'مشروب طاقة ريد بول', 'cold_drink', 50, 1, 'مشروب منعش بارد'],
        ['prod-beard-oil', 'branch-elhdad', 'زيت اللحية الفاخر بالأرجان', 'care_product', 150, 1, 'تغذية وتنعيم وترطيب عميق لشعر اللحية والشارب'],
        ['prod-wax', 'branch-elhdad', 'واكس تصفيف الشعر المطفي', 'care_product', 120, 1, 'تثبيت قوي مع مظهر مطفي طبيعي يدوم طوال اليوم'],
      ];
      for (const p of productList) {
        await query(`
          INSERT INTO products (id, branch_id, name, category, price, is_active, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE name=VALUES(name)
        `, p);
      }
      console.log('✅ Auto-seeded cafeteria products into MySQL DB');
    }

    // 6. Check & Seed Profiles (Super Admin / Manager & Receptionist)
    await query(`
      INSERT INTO profiles (id, full_name, phone, email, password_hash, role, is_super_admin, is_active)
      VALUES ('usr-manager-super', 'أحمد عبدالباسط (المدير العام)', '01285694670', 'admin@salon.com', 'Admin@123456', 'manager', 1, 1)
      ON DUPLICATE KEY UPDATE 
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        password_hash = VALUES(password_hash),
        role = 'manager',
        is_super_admin = 1,
        is_active = 1;
    `);

    await query(`
      INSERT INTO profiles (id, full_name, phone, email, password_hash, role, branch_id, is_super_admin, is_active)
      VALUES ('usr-receptionist-main', 'موظف الاستقبال', '01005437633', 'reception@salon.com', 'Admin@123456', 'receptionist', 'branch-elhdad', 0, 1)
      ON DUPLICATE KEY UPDATE 
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        password_hash = VALUES(password_hash),
        role = 'receptionist',
        is_active = 1;
    `);
    console.log('✅ Auto-seeded manager & staff accounts in MySQL DB');
  } catch (err: any) {
    console.warn('Initial DB seeding notice:', err?.message);
  }
}
