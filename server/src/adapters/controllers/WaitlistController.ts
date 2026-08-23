import { Request, Response } from 'express';
import { container } from '../../container.js';

export class WaitlistController {
  public async join(req: Request, res: Response): Promise<void> {
    try {
      const entry = await container.joinWaitlistUseCase.execute(req.body);
      res.status(201).json({ success: true, data: entry });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public async getByBranch(req: Request, res: Response): Promise<void> {
    try {
      const branchId = req.params.branchId;
      const date = req.query.date as string | undefined;
      const entries = await container.waitlistRepo.findByBranch(branchId, date);
      res.json({ success: true, data: entries });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async claimOffer(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;
      const result = await container.claimWaitlistOfferUseCase.execute(token);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public async promote(req: Request, res: Response): Promise<void> {
    try {
      const result = await container.promoteWaitlistEntryUseCase.execute(req.params.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export const waitlistController = new WaitlistController();
