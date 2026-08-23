import { container } from '../container.js';

export interface JoinWaitlistPayload {
  branchId: string;
  barberId?: string;
  customerName: string;
  customerPhone: string;
  preferredDate: string;
  preferredTimeWindow?: string;
  serviceId?: string;
}

export async function joinWaitlist(payload: JoinWaitlistPayload) {
  return await container.joinWaitlistUseCase.execute(payload);
}

export async function getBranchWaitlist(branchId: string, date?: string) {
  return await container.waitlistRepo.findByBranch(branchId, date);
}

export async function offerSlotToNextEntry(branchId: string, barberId?: string | null, date?: string) {
  const candidate = await container.waitlistRepo.findNextCandidate(branchId, barberId, date);
  if (!candidate) return null;
  const result = await container.promoteWaitlistEntryUseCase.execute(candidate.id);
  return { candidateId: candidate.id, ...result };
}

export async function claimWaitlistOffer(token: string) {
  const result = await container.claimWaitlistOfferUseCase.execute(token);
  return { booking: result.booking, entry: { id: result.waitlistEntryId } };
}

export async function promoteWaitlistEntry(entryId: string) {
  const result = await container.promoteWaitlistEntryUseCase.execute(entryId);
  return { success: true, ...result };
}
