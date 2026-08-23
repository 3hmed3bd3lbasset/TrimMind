import { v4 as uuidv4 } from 'uuid';
import { IRecallRepository } from '../../domain/repositories/IRecallRepository.js';
import { RecallCandidate, RecallCampaign } from '../../domain/entities/RecallCampaign.entity.js';
import { query } from '../../config/database.js';

export class MySQLRecallRepository implements IRecallRepository {
  public async findCandidates(branchId: string, thresholdDays: number): Promise<RecallCandidate[]> {
    const rows = await query<any[]>(
      `SELECT 
         b.customer_phone,
         MAX(b.customer_name) as customer_name,
         MAX(b.booking_date) as last_visit_date,
         DATEDIFF(CURDATE(), MAX(b.booking_date)) as days_since_last_visit,
         COUNT(b.id) as total_visits,
         COALESCE(MAX(bar.full_name), 'كابتن الصالون') as last_barber,
         COALESCE(MAX(s.name), 'خدمة الصالون') as last_service
       FROM bookings b
       LEFT JOIN barbers bar ON b.barber_id = bar.id
       LEFT JOIN services s ON b.service_id = s.id
       WHERE b.branch_id = ? 
         AND b.status = 'completed'
         AND b.customer_phone IS NOT NULL
         AND b.customer_phone != ''
         AND b.customer_phone NOT IN (
           SELECT DISTINCT customer_phone FROM bookings 
           WHERE status IN ('confirmed', 'awaiting_payment', 'pending_review', 'customer_arrived', 'in_service')
             AND (booking_date >= CURDATE() OR starts_at >= NOW())
         )
         AND b.customer_phone NOT IN (
           SELECT DISTINCT customer_phone FROM recall_sends
           WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
         )
       GROUP BY b.customer_phone
       HAVING days_since_last_visit >= ?
       ORDER BY days_since_last_visit DESC
       LIMIT 50`,
      [branchId, thresholdDays]
    );

    return rows.map((r) => ({
      customer_phone: r.customer_phone,
      customer_name: r.customer_name,
      last_visit_date: r.last_visit_date,
      days_since_last_visit: Number(r.days_since_last_visit),
      total_visits: Number(r.total_visits),
      last_barber: r.last_barber,
      last_service: r.last_service,
    }));
  }

  public async createCampaign(branchId: string, thresholdDays: number, notes: string, creatorId?: string): Promise<string> {
    const campaignId = `CMP-${uuidv4().substring(0, 8)}`;
    await query(
      'INSERT INTO recall_campaigns (id, branch_id, created_by, threshold_days, notes, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [campaignId, branchId, creatorId || null, thresholdDays, notes]
    );
    return campaignId;
  }

  public async recordSend(campaignId: string, phone: string, name: string, message: string): Promise<void> {
    const sendId = `SND-${uuidv4().substring(0, 8)}`;
    await query(
      'INSERT INTO recall_sends (id, campaign_id, customer_phone, customer_name, message_text, status, sent_at) VALUES (?, ?, ?, ?, ?, "sent", NOW())',
      [sendId, campaignId, phone, name, message]
    );
  }

  public async getCampaigns(branchId: string): Promise<RecallCampaign[]> {
    const rows = await query<any[]>(
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

    return rows.map((r) => new RecallCampaign(
      r.id, r.branch_id, r.created_by, r.threshold_days, r.notes, r.created_at,
      Number(r.total_sends || 0), Number(r.total_rebooked || 0)
    ));
  }
}
