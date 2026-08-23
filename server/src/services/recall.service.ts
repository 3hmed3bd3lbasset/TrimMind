import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

export interface RecallCandidate {
  customer_phone: string;
  customer_name: string;
  last_visit_date: string;
  days_since_last_visit: number;
  total_visits: number;
  last_barber: string;
  last_service: string;
}

// 1. Find Recall Candidates (Lapsed Customers)
export async function findRecallCandidates(branchId: string, thresholdDays: number = 30): Promise<RecallCandidate[]> {
  const sql = `
    SELECT b.customer_phone, b.customer_name, 
           MAX(b.booking_date) as last_visit_date,
           DATEDIFF(CURDATE(), MAX(b.booking_date)) as days_since_last_visit,
           COUNT(*) as total_visits,
           COALESCE(MAX(bar.full_name), 'كابتن الصالون') as last_barber,
           COALESCE(MAX(s.name), 'خدمة الصالون') as last_service
    FROM bookings b
    LEFT JOIN barbers bar ON b.barber_id = bar.id
    LEFT JOIN services s ON b.service_id = s.id
    WHERE b.status = 'completed'
      AND b.branch_id = ?
      AND b.customer_phone IS NOT NULL
      AND LENGTH(b.customer_phone) >= 10
      AND NOT EXISTS (
        SELECT 1 FROM bookings future_b 
        WHERE future_b.customer_phone = b.customer_phone 
          AND future_b.status IN ('confirmed', 'pending_review', 'awaiting_payment') 
          AND future_b.booking_date >= CURDATE()
      )
    GROUP BY b.customer_phone, b.customer_name
    HAVING DATEDIFF(CURDATE(), MAX(b.booking_date)) >= ?
    ORDER BY last_visit_date DESC
    LIMIT 100
  `;

  return await query<RecallCandidate[]>(sql, [branchId, thresholdDays]);
}

// 2. Generate Personalized Message
export function generateRecallMessage(customerName: string, lastBarber: string, lastService: string): string {
  const name = customerName || 'عزيزنا العميل';
  return `أهلاً يا ${name}! 💈✨\nوحشتنا في صالون TrimMind (الحداد VIP).. بقالك فترة ما شرفتناش من بعد آخر ${lastService} مع كابتن ${lastBarber}!\n\nجاهزين لك دائماً بأفضل تجربة عناية وحلاقة ملكية تليق بك 👑✂️\n\n👉 احجز موعدك القادم بضغطة واحدة من هنا:\nhttps://trimmind.up.railway.app\n\nنتشرف بزيارتك دائماً! ❤️`;
}

// 3. Create and Send Recall Campaign
export async function sendRecallCampaign(
  branchId: string,
  thresholdDays: number,
  candidatePhones: string[],
  customMessageTemplate?: string,
  actorId?: string
) {
  const campaignId = uuidv4();

  await query(
    `INSERT INTO recall_campaigns (id, branch_id, created_by, threshold_days, notes, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [campaignId, branchId, actorId || null, thresholdDays, `حملة إعادة جذب عملاء منقطعين منذ ${thresholdDays} يوماً`]
  );

  const candidates = await findRecallCandidates(branchId, thresholdDays);
  const selectedCandidates = candidates.filter((c) => candidatePhones.includes(c.customer_phone));

  let sentCount = 0;
  for (const c of selectedCandidates) {
    const msgText = customMessageTemplate
      ? customMessageTemplate.replace('{name}', c.customer_name).replace('{barber}', c.last_barber).replace('{service}', c.last_service)
      : generateRecallMessage(c.customer_name, c.last_barber, c.last_service);

    const sendId = uuidv4();
    await query(
      `INSERT INTO recall_sends (id, campaign_id, customer_phone, customer_name, message_text, status, sent_at)
       VALUES (?, ?, ?, ?, ?, 'sent', NOW())`,
      [sendId, campaignId, c.customer_phone, c.customer_name, msgText]
    );

    // Send WhatsApp Message
    try {
      const { sendWhatsAppText } = await import('./whatsapp.service.js');
      await sendWhatsAppText(c.customer_phone, msgText);
      sentCount++;
    } catch (err: any) {
      console.warn(`Failed to send recall WhatsApp to ${c.customer_phone}:`, err.message);
    }
  }

  return {
    campaignId,
    totalTargeted: selectedCandidates.length,
    sentCount,
  };
}

// 4. Get Past Campaigns with Attribution
export async function getRecallCampaigns(branchId: string) {
  const campaigns = await query<any[]>(
    `SELECT c.*, 
            COUNT(s.id) as total_sends,
            SUM(CASE WHEN s.status = 'rebooked' THEN 1 ELSE 0 END) as total_rebooked
     FROM recall_campaigns c
     LEFT JOIN recall_sends s ON c.id = s.campaign_id
     WHERE c.branch_id = ?
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [branchId]
  );

  return campaigns;
}
