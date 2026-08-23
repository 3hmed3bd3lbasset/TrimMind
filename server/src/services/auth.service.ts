import { container } from '../container.js';

export async function hashPassword(password: string): Promise<string> {
  return await container.passwordHasher.hash(password);
}

export async function verifyPassword(password: string, hash?: string): Promise<boolean> {
  return await container.passwordHasher.verify(password, hash);
}

export function generateToken(payload: { id: string; role: string; email?: string | null }): string {
  return container.tokenService.generateToken(payload);
}

export async function authenticateStaff(identifier: string, plainPassword: string, ipAddress: string) {
  return await container.authenticateStaffUseCase.execute(identifier, plainPassword, ipAddress);
}
