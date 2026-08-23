import { Chair } from '../entities/Chair.entity.js';

export interface IChairRepository {
  findById(id: string): Promise<Chair | null>;
  findByBranch(branchId: string): Promise<Chair[]>;
  releaseChair(chairId: string): Promise<void>;
  occupyChair(chairId: string, bookingId: string, endsAt?: string): Promise<void>;
}
