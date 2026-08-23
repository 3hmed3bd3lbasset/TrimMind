import { v4 as uuidv4 } from 'uuid';
import { IWaitlistRepository, JoinWaitlistData } from '../../domain/repositories/IWaitlistRepository.js';
import { WaitlistEntry } from '../../domain/entities/WaitlistEntry.entity.js';
import { query } from '../../config/database.js';

export class MySQLWaitlistRepository implements IWaitlistRepository {
  public async create(data: JoinWaitlistData): Promise<WaitlistEntry> {
    const id = `WLT-${uuidv4().substring(0, 8)}`;
    const preferredTime = data.preferredTimeWindow || 'afternoon';
    const srvId = data.serviceId || 'srv-haircut';

    await query(
      `INSERT INTO waitlist_entries (
        id, branch_id, barber_id, customer_name, customer_phone,
        preferred_date, preferred_time_window, service_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'waiting', NOW())`,
      [id, data.branchId, data.barberId || null, data.customerName, data.customerPhone, data.preferredDate, preferredTime, srvId]
    );

    return (await this.findById(id))!;
  }

  public async findByBranch(branchId: string, date?: string): Promise<WaitlistEntry[]> {
    let sql = `
      SELECT w.*, b.full_name as barber_name, s.name as service_name
      FROM waitlist_entries w
      LEFT JOIN barbers b ON w.barber_id = b.id
      LEFT JOIN services s ON w.service_id = s.id
      WHERE w.branch_id = ?
    `;
    const params: any[] = [branchId];

    if (date) {
      sql += ' AND w.preferred_date = ?';
      params.push(date);
    }
    sql += ' ORDER BY w.created_at ASC';

    const rows = await query<any[]>(sql, params);
    return rows.map((r) => new WaitlistEntry(
      r.id, r.branch_id, r.barber_id, r.customer_name, r.customer_phone,
      r.preferred_date, r.preferred_time_window, r.service_id, r.status,
      r.offer_token, r.offered_at, r.offer_expires_at, r.claimed_booking_id,
      r.created_at, r.barber_name, r.service_name
    ));
  }

  public async findById(id: string): Promise<WaitlistEntry | null> {
    const rows = await query<any[]>(
      `SELECT w.*, b.full_name as barber_name, s.name as service_name
       FROM waitlist_entries w
       LEFT JOIN barbers b ON w.barber_id = b.id
       LEFT JOIN services s ON w.service_id = s.id
       WHERE w.id = ? LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return new WaitlistEntry(
      r.id, r.branch_id, r.barber_id, r.customer_name, r.customer_phone,
      r.preferred_date, r.preferred_time_window, r.service_id, r.status,
      r.offer_token, r.offered_at, r.offer_expires_at, r.claimed_booking_id,
      r.created_at, r.barber_name, r.service_name
    );
  }

  public async findByOfferToken(token: string): Promise<WaitlistEntry | null> {
    const rows = await query<any[]>('SELECT id FROM waitlist_entries WHERE offer_token = ? LIMIT 1', [token]);
    if (!rows || rows.length === 0) return null;
    return this.findById(rows[0].id);
  }

  public async findNextCandidate(branchId: string, barberId?: string | null, date?: string): Promise<WaitlistEntry | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    let sql = `
      SELECT id FROM waitlist_entries
      WHERE branch_id = ?
        AND preferred_date = ?
        AND status = 'waiting'
    `;
    const params: any[] = [branchId, targetDate];

    if (barberId) {
      sql += ' AND (barber_id = ? OR barber_id IS NULL)';
      params.push(barberId);
    }
    sql += ' ORDER BY created_at ASC LIMIT 1';

    const rows = await query<any[]>(sql, params);
    if (!rows || rows.length === 0) return null;
    return this.findById(rows[0].id);
  }

  public async updateOffer(id: string, token: string, expiresAt: Date): Promise<void> {
    await query(
      `UPDATE waitlist_entries
       SET status = 'offered', offer_token = ?, offered_at = NOW(), offer_expires_at = ?
       WHERE id = ?`,
      [token, expiresAt.toISOString(), id]
    );
  }

  public async markClaimed(id: string, bookingId: string): Promise<boolean> {
    const result: any = await query(
      'UPDATE waitlist_entries SET status = "claimed", claimed_booking_id = ? WHERE id = ? AND status = "offered"',
      [bookingId, id]
    );
    return Boolean(result && result.affectedRows > 0);
  }
}
