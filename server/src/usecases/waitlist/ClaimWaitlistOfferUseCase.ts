import { IWaitlistRepository } from '../../domain/repositories/IWaitlistRepository.js';
import { IBookingRepository } from '../../domain/repositories/IBookingRepository.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';
import { Booking } from '../../domain/entities/Booking.entity.js';

export class ClaimWaitlistOfferUseCase {
  constructor(
    private readonly waitlistRepo: IWaitlistRepository,
    private readonly bookingRepo: IBookingRepository,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(token: string): Promise<{ booking: Booking; waitlistEntryId: string }> {
    const entry = await this.waitlistRepo.findByOfferToken(token.trim().toUpperCase());
    if (!entry || !entry.isOfferValid()) {
      throw new Error('عذراً، هذا العرض غير صالح أو انتهت مهلة الـ 25 دقيقة المخصصة لتأكيده.');
    }

    const booking = await this.bookingRepo.createWithTransaction({
      branchId: entry.branchId,
      barberId: entry.barberId,
      customerName: entry.customerName,
      customerPhone: entry.customerPhone,
      serviceId: entry.serviceId || 'srv-haircut',
      bookingType: 'normal',
      notes: `تم الحجز عبر قائمة الانتظار الذكية (عرض رقم ${token.toUpperCase()})`,
    });

    const claimed = await this.waitlistRepo.markClaimed(entry.id, booking.id);
    if (!claimed) {
      // Rollback booking if already claimed concurrently
      await this.bookingRepo.cancel(booking.id, 'إلغاء بسبب حجز العرض مسبقاً من طرف آخر');
      throw new Error('عذراً، تم حجز هذا العرض مسبقاً.');
    }

    this.realtimeNotifier.broadcastToBranch(entry.branchId, 'WAITLIST_UPDATED', { id: entry.id, status: 'claimed' });
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { type: 'WAITLIST_CLAIMED', entryId: entry.id });

    return { booking, waitlistEntryId: entry.id };
  }
}
