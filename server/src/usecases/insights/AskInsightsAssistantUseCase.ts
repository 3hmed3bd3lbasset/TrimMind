import { IInsightsRepository } from '../../domain/repositories/IInsightsRepository.js';

export class AskInsightsAssistantUseCase {
  constructor(private readonly insightsRepo: IInsightsRepository) {}

  public async execute(branchId: string, question: string): Promise<{ question: string; answer: string; metrics: any }> {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const metrics = await this.insightsRepo.getMetrics(branchId, start, end);

    const answer = `بناءً على بيانات الصالون الحقيقية لآخر 30 يوماً:\n\n` +
      `• إجمالي الإيرادات المسجلة: ${metrics.totalRevenue.toLocaleString()} ج.م\n` +
      `• عدد الحجوزات المكتملة: ${metrics.completedBookings} حجز\n` +
      `• أعلى كابتن تحقيقاً للإيرادات: ${metrics.barberPerformance[0]?.barber_name || 'غير محدد'} (${metrics.barberPerformance[0]?.total_revenue || 0} ج.م)\n` +
      `• نسبة عدم الحضور (No-show): ${metrics.noShowRate}%\n\n` +
      `إجابة على استفسارك: "${question}"\nنوصي بمتابعة الحجوزات المتأخرة وتفعيل التذكيرات الدورية عبر الواتساب للحفاظ على استقرار الإيرادات.`;

    return {
      question,
      answer,
      metrics,
    };
  }
}
