import { IWaitlistRepository, JoinWaitlistData } from '../../domain/repositories/IWaitlistRepository.js';
import { IRealtimeNotifier } from '../../domain/gateways/IRealtimeNotifier.js';
import { WaitlistEntry } from '../../domain/entities/WaitlistEntry.entity.js';

export class JoinWaitlistUseCase {
  constructor(
    private readonly waitlistRepo: IWaitlistRepository,
    private readonly realtimeNotifier: IRealtimeNotifier
  ) {}

  public async execute(data: JoinWaitlistData): Promise<WaitlistEntry> {
    let cleanPhone = data.customerPhone.replace(/\D+/g, '');
    if (cleanPhone.startsWith('20') && cleanPhone.length === 12) {
      cleanPhone = '0' + cleanPhone.substring(2);
    }

    const entry = await this.waitlistRepo.create({
      ...data,
      customerPhone: cleanPhone,
    });

    this.realtimeNotifier.broadcastToBranch(entry.branchId, 'WAITLIST_UPDATED', entry);
    this.realtimeNotifier.broadcastGlobal('SYNC_STATE', { type: 'WAITLIST_JOINED', entryId: entry.id });

    return entry;
  }
}
