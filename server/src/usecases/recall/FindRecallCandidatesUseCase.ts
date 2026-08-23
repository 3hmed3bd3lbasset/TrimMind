import { IRecallRepository } from '../../domain/repositories/IRecallRepository.js';
import { RecallCandidate } from '../../domain/entities/RecallCampaign.entity.js';

export class FindRecallCandidatesUseCase {
  constructor(private readonly recallRepo: IRecallRepository) {}

  public async execute(branchId: string, thresholdDays: number = 30): Promise<RecallCandidate[]> {
    return await this.recallRepo.findCandidates(branchId, thresholdDays);
  }
}
