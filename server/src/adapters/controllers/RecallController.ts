import { Request, Response } from 'express';
import { container } from '../../container.js';

export class RecallController {
  public async getCandidates(req: Request, res: Response): Promise<void> {
    try {
      const branchId = req.params.branchId;
      const thresholdDays = parseInt((req.query.thresholdDays as string) || '30', 10);
      const candidates = await container.findRecallCandidatesUseCase.execute(branchId, thresholdDays);
      res.json({ success: true, data: candidates });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async sendCampaign(req: Request, res: Response): Promise<void> {
    try {
      const actor = (req as any).user;
      const { branchId, thresholdDays, candidatePhones, customMessageTemplate } = req.body;
      const result = await container.sendRecallCampaignUseCase.execute(
        branchId,
        thresholdDays || 30,
        candidatePhones || [],
        customMessageTemplate,
        actor?.id
      );
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  public async getCampaigns(req: Request, res: Response): Promise<void> {
    try {
      const branchId = req.params.branchId;
      const campaigns = await container.recallRepo.getCampaigns(branchId);
      res.json({ success: true, data: campaigns });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const recallController = new RecallController();
