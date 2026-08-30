import { v4 as uuidv4 } from 'uuid';
import { IProfileRepository } from '../../domain/repositories/IProfileRepository.js';
import { Profile } from '../../domain/entities/Profile.entity.js';
import { query } from '../../config/database.js';

export class MySQLProfileRepository implements IProfileRepository {
  public async findByIdentifier(identifier: string): Promise<Profile | null> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPhone = identifier.trim().replace(/\D+/g, '');

    // Check profiles table
    let rows = await query<any[]>(
      'SELECT * FROM profiles WHERE (LOWER(email) = ? OR phone = ?) AND is_active = 1 LIMIT 1',
      [cleanId, cleanPhone]
    );

    if (rows && rows.length > 0) {
      const p = rows[0];
      return new Profile(
        p.id,
        p.full_name,
        p.phone,
        p.email,
        p.password_hash || p.password,
        p.role,
        Boolean(p.is_super_admin),
        p.branch_id,
        p.barber_id,
        typeof p.assigned_branch_ids === 'string' ? JSON.parse(p.assigned_branch_ids || '[]') : p.assigned_branch_ids || [],
        Boolean(p.is_active),
        p.created_at
      );
    }

    return null;
  }

  public async findById(id: string): Promise<Profile | null> {
    const rows = await query<any[]>('SELECT * FROM profiles WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return null;
    const p = rows[0];
    return new Profile(
      p.id,
      p.full_name,
      p.phone,
      p.email,
      p.password_hash || p.password,
      p.role,
      Boolean(p.is_super_admin),
      p.branch_id,
      p.barber_id,
      typeof p.assigned_branch_ids === 'string' ? JSON.parse(p.assigned_branch_ids || '[]') : p.assigned_branch_ids || [],
      Boolean(p.is_active),
      p.created_at
    );
  }

  public async updatePasswordHash(userId: string, newHash: string, isBarber?: boolean): Promise<void> {
    if (isBarber || userId.startsWith('usr-barber-')) {
      const barberId = userId.replace('usr-barber-', '');
      await query('UPDATE barbers SET password_hash = ? WHERE id = ?', [newHash, barberId]);
    } else {
      await query('UPDATE profiles SET password_hash = ? WHERE id = ?', [newHash, userId]);
    }
  }

  public async recordLoginAttempt(identifier: string, ipAddress: string): Promise<void> {
    await query('INSERT INTO login_attempts (identifier, ip_address) VALUES (?, ?)', [identifier, ipAddress]).catch(() => {});
  }

  public async logAudit(actorId: string, actorName: string, role: string, action: string, targetTable: string, targetId: string, ipAddress: string): Promise<void> {
    await query(
      'INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, target_table, target_id, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), actorId, actorName, role, action, targetTable, targetId, ipAddress]
    ).catch(() => {});
  }
}
