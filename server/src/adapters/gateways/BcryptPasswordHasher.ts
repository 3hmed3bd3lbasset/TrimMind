import bcrypt from 'bcrypt';
import { IPasswordHasher } from '../../domain/gateways/IPasswordHasher.js';

export class BcryptPasswordHasher implements IPasswordHasher {
  private readonly rounds = 10;

  public async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, this.rounds);
  }

  public async verify(plainPassword: string, hash?: string): Promise<boolean> {
    if (!plainPassword || !hash) return false;
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
      try {
        return await bcrypt.compare(plainPassword, hash);
      } catch {
        return false;
      }
    }
    return plainPassword === hash;
  }
}
