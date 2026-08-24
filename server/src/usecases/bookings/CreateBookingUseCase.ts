import { IBookingRepository, CreateBookingData } from '../../domain/repositories/IBookingRepository.js';
import { INotificationGateway } from '../../domain/gateways/INotificationGateway.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';
import { Booking } from '../../domain/entities/Booking.entity.js';

export class CreateBookingUseCase {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly notificationGateway: INotificationGateway,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(data: CreateBookingData, actorId?: string): Promise<Booking> {
    const booking = await this.bookingRepo.createWithTransaction(data, actorId);

    // Realtime Notifications
    this.realtimeNotifier.broadcastToBranch(booking.branchId, 'BOOKING_CREATED', booking);
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { type: 'BOOKING_CREATED', bookingId: booking.id });

    return booking;
  }
}
