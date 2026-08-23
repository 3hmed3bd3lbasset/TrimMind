import { IWaitlistRepository } from '../../domain/repositories/IWaitlistRepository.js';
import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';

export class PromoteWaitlistEntryUseCase {
  constructor(
    private readonly waitlistRepo: IWaitlistRepository,
    private readonly notificationGateway: INotificationGateway,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(entryId: string): Promise<{ offerToken: string; expiresAt: Date }> {
    const entry = await this.waitlistRepo.findById(entryId);
    if (!entry) {
      throw new Error('طلب قائمة الانتظار غير موجود.');
    }

    const offerToken = `WLT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.waitlistRepo.updateOffer(entry.id, offerToken, expiresAt);

    if (entry.customerPhone) {
      const msg = `مرحباً يا ${entry.customerName}! 💈👑\nقام فريق الاستقبال بصالون TrimMind بإتاحة موعد خاص لك بناءً على طلبك في قائمة الانتظار.\n\n👉 لتأكيد الحجز:\nhttps://trimmind.up.railway.app/track?claim=${offerToken}`;
      this.notificationGateway.sendWhatsApp(entry.customerPhone, msg).catch(() => {});
    }

    this.realtimeNotifier.broadcastToBranch(entry.branchId, 'WAITLIST_UPDATED', { id: entry.id, status: 'offered', offerToken });

    return { offerToken, expiresAt };
  }
}
