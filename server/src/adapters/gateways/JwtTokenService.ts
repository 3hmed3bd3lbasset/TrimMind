import jwt from 'jsonwebtoken';
import { ITokenService, UserTokenPayload } from '../../domain/gateways/ITokenService.js';

export class JwtTokenService implements ITokenService {
  private readonly secret = process.env.JWT_SECRET || 'super_secret_jwt_key_for_elite_salon_platform_development_123456789';
  private readonly expiresIn = '15m'; // Strict 15-Minute Short-Lived Access Token

  public generateToken(payload: UserTokenPayload): string {
    return jwt.sign(
      {
        sub: payload.id,
        role: payload.role,
        email: payload.email || null,
      },
      this.secret,
      {
        algorithm: 'HS256',
        expiresIn: this.expiresIn,
      }
    );
  }

  public verifyToken(token: string): UserTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: ['HS256'], // Strict algorithm allow-list (rejects alg:none)
      }) as any;
      if (!decoded || !decoded.sub) return null;
      return {
        id: decoded.sub,
        role: decoded.role,
        email: decoded.email,
      };
    } catch {
      return null;
    }
  }
}
