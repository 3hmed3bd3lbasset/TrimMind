import { RecallCandidate, RecallCampaign } from '../entities/RecallCampaign.entity.js';

export interface IRecallRepository {
  findCandidates(branchId: string, thresholdDays: number): Promise<RecallCandidate[]>;
  createCampaign(branchId: string, thresholdDays: number, notes: string, creatorId?: string): Promise<string>;
  recordSend(campaignId: string, phone: string, name: string, message: string): Promise<void>;
  getCampaigns(branchId: string): Promise<RecallCampaign[]>;
}
