import { Profile } from '../entities/Profile.entity.js';

export interface IProfileRepository {
  findByIdentifier(identifier: string): Promise<Profile | null>;
  findById(id: string): Promise<Profile | null>;
  updatePasswordHash(userId: string, newHash: string, isBarber?: boolean): Promise<void>;
  recordLoginAttempt(identifier: string, ipAddress: string): Promise<void>;
  logAudit(actorId: string, actorName: string, role: string, action: string, targetTable: string, targetId: string, ipAddress: string): Promise<void>;
}
