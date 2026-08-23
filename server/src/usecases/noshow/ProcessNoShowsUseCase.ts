import { IBookingRepository } from '../../domain/repositories/IBookingRepository.js';
import { IChairRepository } from '../../domain/repositories/IChairRepository.js';
import { IWaitlistRepository } from '../../domain/repositories/IWaitlistRepository.js';
import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';

export class ProcessNoShowsUseCase {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly chairRepo: IChairRepository,
    private readonly waitlistRepo: IWaitlistRepository,
    private readonly notificationGateway: INotificationGateway,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(gracePeriodMinutes: number = 35): Promise<number> {
    const overdueBookings = await this.bookingRepo.findOverdueConfirmed(gracePeriodMinutes);
    if (overdueBookings.length === 0) return 0;

    for (const b of overdueBookings) {
      await this.bookingRepo.markNoShow(b.id);

      if (b.chairId) {
        await this.chairRepo.releaseChair(b.chairId);
      }

      // Realtime Broadcast
      this.realtimeNotifier.broadcastToBranch(b.branchId, 'BOOKING_NO_SHOW', { bookingId: b.id, customerName: b.customerName });
      this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { bookingId: b.id, status: 'no_show' });

      // Offer freed slot to next waitlist customer
      try {
        const candidate = await this.waitlistRepo.findNextCandidate(b.branchId, b.barberId, b.bookingDate);
        if (candidate && candidate.customerPhone) {
          const token = `WLT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          const expiresAt = new Date(Date.now() + 25 * 60 * 1000);
          await this.waitlistRepo.updateOffer(candidate.id, token, expiresAt);

          const msg = `أهلاً بك يا ${candidate.customerName}! 💈🎉\n\nتتوفر الآن فرصة حجز وموعد شاغر لدى صالون TrimMind (الحداد VIP) في تاريخ ${candidate.preferredDate}!\n\n⏳ لديك مهلة 25 دقيقة لتأكيد حجزك:\nhttps://trimmind.up.railway.app/track?claim=${token}\n\nنتشرف بزيارتك دائماً! 👑✂️`;
          this.notificationGateway.sendWhatsApp(candidate.customerPhone, msg).catch(() => {});
        }
      } catch {}
    }

    return overdueBookings.length;
  }
}
