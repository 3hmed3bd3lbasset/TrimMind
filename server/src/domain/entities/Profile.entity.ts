export type UserRole = 'customer' | 'receptionist' | 'manager' | 'barber';

export class Profile {
  constructor(
    public readonly id: string,
    public fullName: string,
    public phone: string,
    public email: string | null,
    public passwordHash: string,
    public role: UserRole,
    public isSuperAdmin: boolean = false,
    public branchId: string | null = null,
    public barberId: string | null = null,
    public assignedBranchIds: string[] = [],
    public isActive: boolean = true,
    public readonly createdAt: string = new Date().toISOString()
  ) {}

  public hasAccessToBranch(targetBranchId: string): boolean {
    if (this.isSuperAdmin) return true;
    if (this.branchId === targetBranchId) return true;
    return this.assignedBranchIds.includes(targetBranchId);
  }

  public isManager(): boolean {
    return this.role === 'manager';
  }

  public isStaff(): boolean {
    return this.role === 'manager' || this.role === 'receptionist' || this.role === 'barber';
  }
}
