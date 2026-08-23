export interface UserTokenPayload {
  id: string;
  role: string;
  email?: string | null;
}

export interface ITokenService {
  generateToken(payload: UserTokenPayload): string;
  verifyToken(token: string): UserTokenPayload | null;
}
