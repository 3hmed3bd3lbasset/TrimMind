import { WaitlistEntry } from '../entities/WaitlistEntry.entity.js';

export interface JoinWaitlistData {
  branchId: string;
  barberId?: string | null;
  customerName: string;
  customerPhone: string;
  preferredDate: string;
  preferredTimeWindow?: string;
  serviceId?: string;
}

export interface IWaitlistRepository {
  create(data: JoinWaitlistData): Promise<WaitlistEntry>;
  findByBranch(branchId: string, date?: string): Promise<WaitlistEntry[]>;
  findById(id: string): Promise<WaitlistEntry | null>;
  findByOfferToken(token: string): Promise<WaitlistEntry | null>;
  findNextCandidate(branchId: string, barberId?: string | null, date?: string): Promise<WaitlistEntry | null>;
  updateOffer(id: string, token: string, expiresAt: Date): Promise<void>;
  markClaimed(id: string, bookingId: string): Promise<void>;
}
