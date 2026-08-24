import jwt from 'jsonwebtoken';
import { ITokenService, UserTokenPayload } from '../../domain/gateways/ITokenService.js';
import { JWT_SECRET } from '../../config/jwt.js';

export class JwtTokenService implements ITokenService {
  private readonly secret = JWT_SECRET;
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
