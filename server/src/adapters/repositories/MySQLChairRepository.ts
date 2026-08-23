import { IChairRepository } from '../../domain/repositories/IChairRepository.js';
import { Chair } from '../../domain/entities/Chair.entity.js';
import { query } from '../../config/database.js';

export class MySQLChairRepository implements IChairRepository {
  public async findById(id: string): Promise<Chair | null> {
    const rows = await query<any[]>('SELECT * FROM chairs WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return null;
    const c = rows[0];
    return new Chair(c.id, c.branch_id, c.barber_id, c.name, c.mode, Boolean(c.is_active), c.status, c.current_booking_id, c.service_ends_at, c.created_at);
  }

  public async findByBranch(branchId: string): Promise<Chair[]> {
    const rows = await query<any[]>('SELECT * FROM chairs WHERE branch_id = ? ORDER BY name ASC', [branchId]);
    return rows.map((c) => new Chair(c.id, c.branch_id, c.barber_id, c.name, c.mode, Boolean(c.is_active), c.status, c.current_booking_id, c.service_ends_at, c.created_at));
  }

  public async releaseChair(chairId: string): Promise<void> {
    await query('UPDATE chairs SET status = "available", current_booking_id = NULL, service_ends_at = NULL WHERE id = ?', [chairId]);
  }

  public async occupyChair(chairId: string, bookingId: string, endsAt?: string): Promise<void> {
    await query('UPDATE chairs SET status = "in_service", current_booking_id = ?, service_ends_at = ? WHERE id = ?', [bookingId, endsAt || null, chairId]);
  }
}
