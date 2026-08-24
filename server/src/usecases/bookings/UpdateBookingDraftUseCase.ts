import { IBookingRepository } from '../../domain/repositories/IBookingRepository.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';
import { query } from '../../config/database.js';

export interface UpdateBookingDraftPayload {
  bookingId: string;
  serviceId?: string;
  serviceName?: string;
  additionalServiceIds?: string[];
  barberId?: string;
  barberName?: string;
  startsAt?: string;
  notes?: string;
}

export class UpdateBookingDraftUseCase {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(payload: UpdateBookingDraftPayload): Promise<{ success: boolean; message: string; booking: any }> {
    const booking = await this.bookingRepo.findById(payload.bookingId);
    if (!booking) {
      throw new Error('لم يتم العثور على الحجز المطلوب للتعديل');
    }

    if (booking.status !== 'draft' && booking.status !== 'awaiting_payment' && booking.status !== 'custom_pricing_requested') {
      throw new Error('لا يمكن تعديل الحجز بعد اعتماده أو تأكيده النهائي');
    }

    const updated = await this.bookingRepo.updateDraft({
      bookingId: payload.bookingId,
      serviceId: payload.serviceId,
      serviceName: payload.serviceName,
      additionalServiceIds: payload.additionalServiceIds,
      barberId: payload.barberId,
      barberName: payload.barberName,
      startsAt: payload.startsAt,
      notes: payload.notes,
    });

    this.realtimeNotifier.broadcastToBranch(booking.branchId, 'BOOKING_UPDATED', { bookingId: booking.id });
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { bookingId: booking.id, type: 'BOOKING_UPDATED' });

    return {
      success: true,
      message: 'تم تحديث بيانات مسودة الحجز بنجاح.',
      booking: updated,
    };
  }
}
