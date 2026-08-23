import { IInsightsRepository, BusinessMetricsData } from '../../domain/repositories/IInsightsRepository.js';

export class GenerateInsightsReportUseCase {
  constructor(private readonly insightsRepo: IInsightsRepository) {}

  public async execute(branchId: string, periodDays: number = 7): Promise<{
    id: string;
    period_start: string;
    period_end: string;
    metrics: BusinessMetricsData;
    narrative_text: string;
  }> {
    const end = new Date();
    const start = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    const metrics = await this.insightsRepo.getMetrics(branchId, startDateStr, endDateStr);

    const topBarber = metrics.barberPerformance[0]?.barber_name || 'كافة الكباتن';
    const topService = metrics.popularServices[0]?.service_name || 'خدمات الـ VIP';

    const narrativeText = `📊 **تقرير أداء الصالون الذكي (خلال آخر ${periodDays} أيام):**\n\n` +
      `• 💰 **إجمالي الإيرادات المحققة:** ${metrics.totalRevenue.toLocaleString()} ج.م عبر ${metrics.completedBookings} حجز مكتمل.\n` +
      `• 💈 **أعلى كابتن نشاطاً وتحقيقاً للمبيعات:** كابتن **${topBarber}**.\n` +
      `• ✂️ **الخدمة الأكثر طلباً:** **${topService}**.\n` +
      `• ⭐ **متوسط تقييمات العملاء:** ${metrics.averageRating} / 5 نجوم.\n` +
      `• ⏳ **نسبة عدم الحضور (No-show):** ${metrics.noShowRate}% (${metrics.noShowBookings} حجوزات لم يحضر أصحابها).\n\n` +
      `💡 **توصيات عملية مقترحة للمدير:**\n` +
      `1. تفعيل قائمة الانتظار الذكية في أوقات الذروة لتعويض أي إلغاءات فورية.\n` +
      `2. إطلاق حملة إعادة جذب (Customer Recall) للعملاء المنقطعين لزيادة تردد الزيارات.\n` +
      `3. تطبيق سياسة حجز العربون الكامل للعملاء المسجلين في قائمة الغياب المتكرر.`;

    const reportId = await this.insightsRepo.saveReport(branchId, startDateStr, endDateStr, metrics, narrativeText);

    return {
      id: reportId,
      period_start: startDateStr,
      period_end: endDateStr,
      metrics,
      narrative_text: narrativeText,
    };
  }
}
