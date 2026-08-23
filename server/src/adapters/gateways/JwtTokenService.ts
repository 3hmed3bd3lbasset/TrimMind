import jwt from 'jsonwebtoken';
import { ITokenService, UserTokenPayload } from '../../domain/gateways/ITokenService.js';

export class JwtTokenService implements ITokenService {
  private readonly secret = process.env.JWT_SECRET || 'super_secret_jwt_key_for_elite_salon_platform_development_123456789';
  private readonly expiresIn = process.env.JWT_EXPIRES_IN || '24h';

  public generateToken(payload: UserTokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn as any });
  }

  public verifyToken(token: string): UserTokenPayload | null {
    try {
      return jwt.verify(token, this.secret) as UserTokenPayload;
    } catch {
      return null;
    }
  }
}
