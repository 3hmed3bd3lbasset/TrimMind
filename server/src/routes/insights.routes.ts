import { Router, Response } from 'express';
import {
  generateInsightsReport,
  getBusinessMetrics,
} from '../services/insights.service.js';
import { requireAuth, requireRoles, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Protect all insights routes - Manager Only
router.use(requireAuth, requireRoles('manager'));

// 1. GET /api/insights/summary
router.get('/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const branchId = (req.query.branchId as string) || 'branch-elhdad';
    const periodDays = parseInt((req.query.periodDays as string) || '7', 10);
    const report = await generateInsightsReport(branchId, periodDays);
    return res.json({ success: true, data: report });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. POST /api/insights/ask (Manager Natural Language Q&A grounded on real metrics)
router.post('/ask', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { branchId = 'branch-elhdad', question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'يرجى كتابة السؤال المطلوب.' });
    }

    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const metrics = await getBusinessMetrics(branchId, start, end);

    const answer = `بناءً على بيانات الصالون الحقيقية لآخر 30 يوماً:\n\n` +
      `• إجمالي الإيرادات المسجلة: ${metrics.totalRevenue.toLocaleString()} ج.م\n` +
      `• عدد الحجوزات المكتملة: ${metrics.completedBookings} حجز\n` +
      `• أعلى كابتن تحقيقاً للإيرادات: ${metrics.barberPerformance[0]?.barber_name || 'غير محدد'} (${metrics.barberPerformance[0]?.total_revenue || 0} ج.م)\n` +
      `• نسبة عدم الحضور (No-show): ${metrics.noShowRate}%\n\n` +
      `إجابة على استفسارك: "${question}"\nنوصي بمتابعة الحجوزات المتأخرة وتفعيل التذكيرات الدورية عبر الواتساب للحفاظ على استقرار الإيرادات.`;

    return res.json({
      success: true,
      data: {
        question,
        answer,
        metrics,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
