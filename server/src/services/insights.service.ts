import { container } from '../container.js';
import { query } from '../config/database.js';

export async function getBusinessMetrics(branchId: string, startDate: string, endDate: string) {
  return await container.insightsRepo.getMetrics(branchId, startDate, endDate);
}

export async function generateAIReport(branchId: string, periodDays: number = 7) {
  return await container.generateInsightsReportUseCase.execute(branchId, periodDays);
}

export const generateInsightsReport = generateAIReport;

export async function askManagerAssistant(branchId: string, question: string) {
  return await container.askInsightsAssistantUseCase.execute(branchId, question);
}

export async function getLatestReports(branchId: string) {
  const rows = await query<any[]>(
    'SELECT * FROM insight_reports WHERE branch_id = ? ORDER BY generated_at DESC LIMIT 10',
    [branchId]
  );
  return rows.map((r) => ({
    id: r.id,
    branch_id: r.branch_id,
    period_start: r.period_start,
    period_end: r.period_end,
    metrics: typeof r.metrics_json === 'string' ? JSON.parse(r.metrics_json) : r.metrics_json,
    narrative_text: r.narrative_text,
    generated_at: r.generated_at,
  }));
}
