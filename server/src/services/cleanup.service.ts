import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import bcrypt from 'bcrypt';
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

  // Daily 3:00 AM Session & Refresh Token Garbage Collection (Purge Expired/Revoked Tokens)
  cron.schedule('0 3 * * *', async () => {
    try {
      const { purgeExpiredTokens } = await import('./session.service.js');
      await purgeExpiredTokens();
    } catch (err: any) {
      console.warn('⚠️ Token GC cron job error:', err.message);
    }
  });

  console.log('⏰ 2-Hour Receipt Auto-Purge & Daily Session GC Scheduled Tasks initialized.');
}

export async function ensureInitialDbData() {
  try {
    // 0. Ensure refresh_tokens table for Session Management & Rotation
    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        token_hash VARCHAR(128) NOT NULL UNIQUE,
        family_id VARCHAR(64) NOT NULL,
        is_revoked TINYINT(1) DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME NULL,
        ip_address VARCHAR(45),
        user_agent VARCHAR(255),
        INDEX idx_user_family (user_id, family_id),
        INDEX idx_token_hash (token_hash),
        INDEX idx_expires (expires_at),
        INDEX idx_revoked (is_revoked, revoked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS financial_records (
        id VARCHAR(64) PRIMARY KEY,
        booking_id VARCHAR(64),
        branch_id VARCHAR(64) NOT NULL,
        barber_id VARCHAR(64),
        amount DECIMAL(10, 2) NOT NULL,
        type ENUM('deposit', 'final_payment', 'full_payment', 'refund', 'cafeteria', 'product') NOT NULL,
        payment_method ENUM('cash', 'vodafone_cash', 'instapay', 'credit_card') DEFAULT 'cash',
        reference_number VARCHAR(100),
        notes TEXT,
        recorded_by VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch_type_date (branch_id, type, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS waitlist_entries (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        barber_id VARCHAR(64),
        customer_name VARCHAR(150) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        preferred_date DATE NOT NULL,
        preferred_time_window VARCHAR(50),
        service_id VARCHAR(64),
        status ENUM('waiting', 'offered', 'claimed', 'expired', 'cancelled') DEFAULT 'waiting',
        offer_token VARCHAR(64) UNIQUE,
        offered_at TIMESTAMP NULL,
        offer_expires_at TIMESTAMP NULL,
        claimed_booking_id VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_waitlist_status (branch_id, preferred_date, status),
        INDEX idx_waitlist_phone (customer_phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS recall_campaigns (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        created_by VARCHAR(64),
        threshold_days INT NOT NULL,
        notes VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS recall_sends (
        id VARCHAR(64) PRIMARY KEY,
        campaign_id VARCHAR(64) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        customer_name VARCHAR(150),
        message_text TEXT NOT NULL,
        status ENUM('queued', 'sent', 'failed', 'rebooked') DEFAULT 'queued',
        sent_at TIMESTAMP NULL,
        rebooked_at TIMESTAMP NULL,
        rebooked_booking_id VARCHAR(64),
        INDEX idx_recall_phone (customer_phone),
        INDEX idx_recall_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS insight_reports (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        metrics_json JSON NOT NULL,
        narrative_text TEXT NOT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch_period (branch_id, period_start, period_end)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS webhook_events (
        id VARCHAR(128) PRIMARY KEY,
        source VARCHAR(64) NOT NULL,
        event_type VARCHAR(64),
        payload JSON,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_source_event (source, event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      CREATE TABLE IF NOT EXISTS whatsapp_analytics_logs (
        id VARCHAR(64) PRIMARY KEY,
        phone VARCHAR(32) NOT NULL,
        event_type ENUM('chat_started', 'intent_detected', 'booking_created', 'proof_uploaded', 'booking_confirmed', 'human_handoff_requested', 'revenue_recorded') NOT NULL,
        booking_id VARCHAR(64),
        metadata JSON,
        amount DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wa_phone (phone),
        INDEX idx_wa_event (event_type),
        INDEX idx_wa_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Safely add WhatsApp Concierge columns to bookings table
    const safeColumns = [
      'ALTER TABLE bookings ADD COLUMN source ENUM("web", "whatsapp") DEFAULT "web"',
      'ALTER TABLE bookings ADD COLUMN ai_brief TEXT NULL',
      'ALTER TABLE bookings ADD COLUMN confidence_score INT DEFAULT 90',
      'ALTER TABLE bookings ADD COLUMN needs_human_attention BOOLEAN DEFAULT FALSE',
      'ALTER TABLE bookings ADD COLUMN handoff_expires_at TIMESTAMP NULL',
      'ALTER TABLE bookings ADD COLUMN custom_line_items JSON NULL',
      'ALTER TABLE bookings ADD COLUMN no_show_marked_at TIMESTAMP NULL',
      'ALTER TABLE payment_proofs MODIFY COLUMN image_path LONGTEXT NULL',
    ];

    for (const colQuery of safeColumns) {
      try {
        await query(colQuery);
      } catch {}
    }

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

    // 6. Check & Seed Profiles (Super Admin / Manager & Receptionist) with secure bcrypt hash
    const defaultManagerHash = bcrypt.hashSync(process.env.MANAGER_PASSWORD || 'Admin@123456', 10);
    const defaultReceptionistHash = bcrypt.hashSync(process.env.RECEPTIONIST_PASSWORD || 'Admin@123456', 10);

    await query(`
      INSERT INTO profiles (id, full_name, phone, email, password_hash, role, is_super_admin, is_active)
      VALUES ('usr-manager-super', 'أحمد عبدالباسط (المدير العام)', '01285694670', 'admin@salon.com', ?, 'manager', 1, 1)
      ON DUPLICATE KEY UPDATE 
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        password_hash = VALUES(password_hash),
        role = 'manager',
        is_super_admin = 1,
        is_active = 1;
    `, [defaultManagerHash]);

    await query(`
      INSERT INTO profiles (id, full_name, phone, email, password_hash, role, branch_id, is_super_admin, is_active)
      VALUES ('usr-receptionist-main', 'موظف الاستقبال', '01005437633', 'reception@salon.com', ?, 'receptionist', 'branch-elhdad', 0, 1)
      ON DUPLICATE KEY UPDATE 
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        password_hash = VALUES(password_hash),
        role = 'receptionist',
        is_active = 1;
    `, [defaultReceptionistHash]);
    console.log('✅ Auto-seeded manager & staff accounts in MySQL DB with secure bcrypt hashes');

    // 7. Auto-repair any duplicated queue numbers in the database
    await repairDuplicateQueueNumbers();
  } catch (err: any) {
    console.warn('Initial DB seeding notice:', err?.message);
  }
}

export async function repairDuplicateQueueNumbers() {
  try {
    const dates = await query<any[]>(
      `SELECT branch_id, DATE(starts_at) as bdate, COUNT(*) as cnt 
       FROM bookings 
       WHERE status != 'cancelled' 
       GROUP BY branch_id, DATE(starts_at) 
       HAVING cnt > 1`
    );

    for (const d of dates) {
      if (!d.bdate) continue;
      const bdateStr = typeof d.bdate === 'string' ? d.bdate.substring(0, 10) : new Date(d.bdate).toISOString().substring(0, 10);
      const dayBookings = await query<any[]>(
        `SELECT id, queue_number, created_at, starts_at 
         FROM bookings 
         WHERE branch_id = ? AND (booking_date = ? OR starts_at LIKE ?) AND status != 'cancelled'
         ORDER BY created_at ASC`,
        [d.branch_id, bdateStr, `${bdateStr}%`]
      );

      let expectedQueue = 1;
      for (const b of dayBookings) {
        if (b.queue_number !== expectedQueue) {
          await query('UPDATE bookings SET queue_number = ? WHERE id = ?', [expectedQueue, b.id]);
        }
        expectedQueue++;
      }
    }
    console.log('✅ Database Queue Numbers Audited & Repaired sequentially.');
  } catch (err: any) {
    console.warn('⚠️ repairDuplicateQueueNumbers notice:', err.message);
  }
}
