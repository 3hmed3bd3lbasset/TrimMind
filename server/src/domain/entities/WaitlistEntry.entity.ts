export type WaitlistStatus = 'waiting' | 'offered' | 'claimed' | 'expired' | 'cancelled';

export class WaitlistEntry {
  constructor(
    public readonly id: string,
    public readonly branchId: string,
    public readonly barberId: string | null,
    public readonly customerName: string,
    public readonly customerPhone: string,
    public readonly preferredDate: string,
    public readonly preferredTimeWindow: string,
    public readonly serviceId: string,
    public status: WaitlistStatus = 'waiting',
    public offerToken: string | null = null,
    public offeredAt: string | null = null,
    public offerExpiresAt: string | null = null,
    public claimedBookingId: string | null = null,
    public readonly createdAt: string = new Date().toISOString(),
    public barberName?: string,
    public serviceName?: string
  ) {}

  public isOfferValid(): boolean {
    if (this.status !== 'offered' || !this.offerExpiresAt) return false;
    return new Date(this.offerExpiresAt).getTime() > Date.now();
  }

  public makeOffer(token: string, expiresAt: Date): void {
    this.status = 'offered';
    this.offerToken = token;
    this.offeredAt = new Date().toISOString();
    this.offerExpiresAt = expiresAt.toISOString();
  }

  public claim(bookingId: string): void {
    if (!this.isOfferValid()) {
      throw new Error('انتهت صلاحية هذا العرض.');
    }
    this.status = 'claimed';
    this.claimedBookingId = bookingId;
  }
}
