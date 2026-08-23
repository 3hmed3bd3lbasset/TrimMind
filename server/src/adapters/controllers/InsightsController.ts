import { Request, Response } from 'express';
import { container } from '../../container.js';

export class InsightsController {
  public async getReport(req: Request, res: Response): Promise<void> {
    try {
      const branchId = req.params.branchId;
      const periodDays = parseInt((req.query.periodDays as string) || '7', 10);
      const report = await container.generateInsightsReportUseCase.execute(branchId, periodDays);
      res.json({ success: true, data: report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async askAssistant(req: Request, res: Response): Promise<void> {
    try {
      const { branchId, question } = req.body;
      const result = await container.askInsightsAssistantUseCase.execute(branchId, question);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

export const insightsController = new InsightsController();
