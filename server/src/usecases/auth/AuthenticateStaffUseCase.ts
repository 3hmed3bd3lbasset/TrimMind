import { IProfileRepository } from '../../domain/repositories/IProfileRepository.js';
import { IPasswordHasher } from '../../domain/gateways/IPasswordHasher.js';
import { ITokenService } from '../../domain/gateways/ITokenService.js';
import { Profile } from '../../domain/entities/Profile.entity.js';

export interface AuthResult {
  token: string;
  user: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    role: string;
    is_super_admin: boolean;
    branch_id: string | null;
    barber_id: string | null;
    assigned_branch_ids: string[];
  };
}

export class AuthenticateStaffUseCase {
  constructor(
    private readonly profileRepo: IProfileRepository,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService
  ) {}

  public async execute(identifier: string, plainPassword: string, ipAddress: string): Promise<AuthResult | null> {
    const user = await this.profileRepo.findByIdentifier(identifier);
    if (!user) {
      // Constant-time execution against User Enumeration timing attacks
      await this.passwordHasher.verify(plainPassword, '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345').catch(() => {});
      await this.profileRepo.recordLoginAttempt(identifier, ipAddress);
      return null;
    }

    // Strict Password Verification - No backdoors
    const isMatch = await this.passwordHasher.verify(plainPassword, user.passwordHash);
    if (!isMatch) {
      await this.profileRepo.recordLoginAttempt(identifier, ipAddress);
      return null;
    }

    // Auto-migrate legacy plaintext passwords to secure Bcrypt hash
    if (user.passwordHash && !user.passwordHash.startsWith('$2a$') && !user.passwordHash.startsWith('$2b$') && !user.passwordHash.startsWith('$2y$')) {
      const newHash = await this.passwordHasher.hash(plainPassword);
      await this.profileRepo.updatePasswordHash(user.id, newHash, user.role === 'barber');
    }

    const token = this.tokenService.generateToken({
      id: user.id,
      role: user.role,
      email: user.email,
    });

    await this.profileRepo.logAudit(user.id, user.fullName, user.role, 'AUTH_LOGIN_SUCCESS', 'profiles', user.id, ipAddress);

    return {
      token,
      user: {
        id: user.id,
        full_name: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        is_super_admin: user.isSuperAdmin,
        branch_id: user.branchId,
        barber_id: user.barberId,
        assigned_branch_ids: user.assignedBranchIds,
      },
    };
  }
}
