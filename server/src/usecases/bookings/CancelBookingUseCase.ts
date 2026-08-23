import { IBookingRepository } from '../../domain/repositories/IBookingRepository.js';
import { IChairRepository } from '../../domain/repositories/IChairRepository.js';
import { IWaitlistRepository } from '../../domain/repositories/IWaitlistRepository.js';
import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';

export class CancelBookingUseCase {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly chairRepo: IChairRepository,
    private readonly waitlistRepo: IWaitlistRepository,
    private readonly notificationGateway: INotificationGateway,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(bookingId: string, reason?: string, actorId?: string): Promise<boolean> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) return false;

    // 1. Cancel in booking repository
    await this.bookingRepo.cancel(bookingId, reason, actorId);

    // 2. Free Chair if held
    if (booking.chairId) {
      await this.chairRepo.releaseChair(booking.chairId);
    }

    // 3. Broadcast real-time cancellation
    this.realtimeNotifier.broadcastToBranch(booking.branchId, 'BOOKING_CANCELLED', {
      bookingId,
      customerName: booking.customerName,
      queueNumber: booking.queueNumber,
    });
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { bookingId, status: 'cancelled' });

    // 4. Trigger Smart Waitlist offer to next candidate
    try {
      const candidate = await this.waitlistRepo.findNextCandidate(booking.branchId, booking.barberId, booking.bookingDate);
      if (candidate && candidate.customerPhone) {
        const token = `WLT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 25 * 60 * 1000);
        await this.waitlistRepo.updateOffer(candidate.id, token, expiresAt);

        const msg = `أهلاً بك يا ${candidate.customerName}! 💈🎉\n\nتتوفر الآن فرصة حجز وموعد شاغر لدى صالون TrimMind (الحداد VIP) في تاريخ ${candidate.preferredDate}!\n\n⏳ لديك مهلة 25 دقيقة لتأكيد حجزك:\nhttps://trimmind.up.railway.app/track?claim=${token}\n\nنتشرف بزيارتك دائماً! 👑✂️`;
        this.notificationGateway.sendWhatsApp(candidate.customerPhone, msg).catch(() => {});
      }
    } catch {}

    // 5. Notify customer
    if (booking.customerPhone) {
      const msg = `عزيزنا ${booking.customerName}، تم إلغاء حجزك رقم #${booking.id} بنجاح.\nنأمل رؤيتك قريباً في صالون TrimMind! 💈`;
      this.notificationGateway.sendWhatsApp(booking.customerPhone, msg).catch(() => {});
    }

    return true;
  }
}
