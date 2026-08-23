export type ChairStatus = 'available' | 'in_service' | 'cleaning' | 'offline';
export type ChairMode = 'normal' | 'vip' | 'both';

export class Chair {
  constructor(
    public readonly id: string,
    public readonly branchId: string,
    public barberId: string | null,
    public name: string,
    public mode: ChairMode = 'normal',
    public isActive: boolean = true,
    public status: ChairStatus = 'available',
    public currentBookingId: string | null = null,
    public serviceEndsAt: string | null = null,
    public readonly createdAt: string = new Date().toISOString()
  ) {}

  public isAvailable(): boolean {
    return this.isActive && this.status === 'available' && !this.currentBookingId;
  }

  public occupy(bookingId: string, endsAt?: string): void {
    this.status = 'in_service';
    this.currentBookingId = bookingId;
    this.serviceEndsAt = endsAt || null;
  }

  public release(): void {
    this.status = 'available';
    this.currentBookingId = null;
    this.serviceEndsAt = null;
  }
}
