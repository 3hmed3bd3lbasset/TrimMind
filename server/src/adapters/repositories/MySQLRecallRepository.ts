import { v4 as uuidv4 } from 'uuid';
import { IRecallRepository } from '../../domain/repositories/IRecallRepository.js';
import { RecallCandidate, RecallCampaign } from '../../domain/entities/RecallCampaign.entity.js';
import { query } from '../../config/database.js';
import { getPersistentDb } from '../../services/persistentStorage.service.js';

export class MySQLRecallRepository implements IRecallRepository {
  public async findCandidates(branchId: string, thresholdDays: number = 30): Promise<RecallCandidate[]> {
    const candidatesMap = new Map<string, RecallCandidate>();

    // 1. Fetch from MySQL Database
    try {
      const rows = await query<any[]>(
        `SELECT 
           b.customer_phone,
           MAX(b.customer_name) as customer_name,
           MAX(COALESCE(b.booking_date, b.starts_at, b.created_at)) as last_visit_date,
           DATEDIFF(CURDATE(), MAX(COALESCE(b.booking_date, b.starts_at, b.created_at))) as days_since_last_visit,
           COUNT(b.id) as total_visits,
           COALESCE(MAX(bar.full_name), MAX(b.barber_name), 'كابتن الصالون') as last_barber,
           COALESCE(MAX(s.name), MAX(b.service_name), 'قص وتصفيف شعر') as last_service,
           COALESCE(MAX(b.booking_type), 'normal') as booking_type
         FROM bookings b
         LEFT JOIN barbers bar ON b.barber_id = bar.id
         LEFT JOIN services s ON b.service_id = s.id
         WHERE (b.branch_id = ? OR ? = 'all' OR b.branch_id IS NULL)
           AND b.status IN ('completed', 'confirmed', 'in_service')
           AND b.customer_phone IS NOT NULL
           AND b.customer_phone != ''
         GROUP BY b.customer_phone
         ORDER BY days_since_last_visit DESC
         LIMIT 100`,
        [branchId, branchId]
      );

      for (const r of rows) {
        const phone = r.customer_phone.trim();
        const days = Math.max(0, Number(r.days_since_last_visit || 0));
        candidatesMap.set(phone, {
          customer_phone: phone,
          customer_name: r.customer_name || 'عميل الصالون',
          last_visit_date: r.last_visit_date || new Date().toISOString(),
          days_since_last_visit: days,
          total_visits: Number(r.total_visits || 1),
          last_barber: r.last_barber || 'محمد الحداد',
          last_service: r.last_service || 'قص شعر وتصفيف كلاسيكي',
          booking_type: r.booking_type || 'normal',
          is_vip: r.booking_type === 'vip' || String(r.last_service).toLowerCase().includes('vip'),
        });
      }
    } catch (e: any) {
      console.warn('MySQL recall candidates query error:', e.message);
    }

    // 2. Merge with Persistent Storage Engine
    try {
      const pBookings = getPersistentDb().bookings || [];
      for (const b of pBookings) {
        const phone = (b.customer_phone || (b as any).customerPhone || '').trim();
        if (!phone) continue;

        const isAccepted = b.status === 'completed' || b.status === 'confirmed' || b.status === 'in_service' || b.payment_proof?.status === 'approved';
        if (!isAccepted) continue;

        const dateStr = b.starts_at || b.created_at || new Date().toISOString();
        const visitDate = new Date(dateStr);
        const days = Math.max(0, Math.floor((Date.now() - visitDate.getTime()) / (1000 * 60 * 60 * 24)));
        const isVip = b.booking_type === 'vip' || (b.service_name && b.service_name.toLowerCase().includes('vip'));

        if (!candidatesMap.has(phone)) {
          candidatesMap.set(phone, {
            customer_phone: phone,
            customer_name: b.customer_name || (b as any).customerName || 'عميل الصالون',
            last_visit_date: dateStr,
            days_since_last_visit: days,
            total_visits: 1,
            last_barber: b.barber_name || (b as any).barberName || 'محمد الحداد',
            last_service: b.service_name || (b as any).serviceName || 'قص شعر وتصفيف كلاسيكي',
            booking_type: b.booking_type || (isVip ? 'vip' : 'normal'),
            is_vip: isVip,
          });
        } else {
          const existing = candidatesMap.get(phone)!;
          if (new Date(dateStr) > new Date(existing.last_visit_date)) {
            existing.last_visit_date = dateStr;
            existing.days_since_last_visit = days;
            existing.last_barber = b.barber_name || (b as any).barberName || existing.last_barber;
            existing.last_service = b.service_name || (b as any).serviceName || existing.last_service;
            existing.booking_type = b.booking_type || (isVip ? 'vip' : 'normal');
            existing.is_vip = isVip;
          }
          existing.total_visits = (existing.total_visits || 1) + 1;
        }
      }
    } catch {}

    const candidates = Array.from(candidatesMap.values());
    // Sort descending by days since last visit
    candidates.sort((a, b) => b.days_since_last_visit - a.days_since_last_visit);
    return candidates;
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
