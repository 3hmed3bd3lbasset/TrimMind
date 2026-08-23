import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_dev_secret_only_change_in_prod_123456789';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash?: string): Promise<boolean> {
  if (!hash || !password) return false;
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
  return password === hash;
}

export function generateToken(payload: { id: string; role: string; email?: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: (JWT_EXPIRES_IN || '24h') as any });
}

export async function authenticateStaff(identifier: string, plainPassword: string, ipAddress: string) {
  try {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPhone = identifier.trim().replace(/\D+/g, '');

    // 1. Find user by email or phone in database profiles
    let users = await query<any[]>(
      'SELECT * FROM profiles WHERE (LOWER(email) = ? OR phone = ?) AND is_active = 1 LIMIT 1',
      [cleanId, cleanPhone]
    );

    // 2. If not in profiles table, check barbers table
    if (!users || users.length === 0) {
      const barbers = await query<any[]>(
        'SELECT * FROM barbers WHERE phone = ? AND is_active = 1 LIMIT 1',
        [cleanPhone]
      );
      if (barbers && barbers.length > 0) {
        const b = barbers[0];
        users = [
          {
            id: `usr-barber-${b.id}`,
            full_name: b.full_name,
            phone: b.phone,
            role: 'barber',
            barber_id: b.id,
            branch_id: b.branch_id,
            password_hash: b.password || b.password_hash,
            is_super_admin: 0,
          },
        ];
      }
    }

    if (!users || users.length === 0) {
      await recordLoginAttempt(identifier, ipAddress);
      return null;
    }

    const user = users[0];

    // 3. Verify password strictly using stored hash - NO backdoors or hardcoded bypasses
    const isMatch = await verifyPassword(plainPassword, user.password_hash || user.password);

    if (!isMatch) {
      await recordLoginAttempt(identifier, ipAddress);
      return null;
    }

    // If stored password was legacy plaintext, automatically upgrade to bcrypt hash in DB
    const currentHash = user.password_hash || user.password;
    if (currentHash && !currentHash.startsWith('$2a$') && !currentHash.startsWith('$2b$') && !currentHash.startsWith('$2y$')) {
      const newHash = await hashPassword(plainPassword);
      if (user.id.startsWith('usr-barber-')) {
        const barberId = user.barber_id || user.id.replace('usr-barber-', '');
        query('UPDATE barbers SET password_hash = ? WHERE id = ?', [newHash, barberId]).catch(() => {});
      } else {
        query('UPDATE profiles SET password_hash = ? WHERE id = ?', [newHash, user.id]).catch(() => {});
      }
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      role: user.role,
      email: user.email,
    });

    // Record audit log safely
    try {
      await query(
        'INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, target_table, target_id, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), user.id, user.full_name, user.role, 'AUTH_LOGIN_SUCCESS', 'profiles', user.id, ipAddress]
      );
    } catch {
      // ignore
    }

    return {
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        is_super_admin: Boolean(user.is_super_admin),
        branch_id: user.branch_id,
        barber_id: user.barber_id,
        assigned_branch_ids: typeof user.assigned_branch_ids === 'string' ? JSON.parse(user.assigned_branch_ids || '[]') : user.assigned_branch_ids,
      },
    };
  } catch (err) {
    console.error('authenticateStaff error:', err);
    return null;
  }
}

async function recordLoginAttempt(identifier: string, ipAddress: string) {
  try {
    await query('INSERT INTO login_attempts (identifier, ip_address) VALUES (?, ?)', [
      identifier,
      ipAddress,
    ]);
  } catch (e) {
    // Ignore logging failures
  }
}
