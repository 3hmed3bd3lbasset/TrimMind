import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

export interface BusinessMetrics {
  totalRevenue: number;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  noShowRate: number;
  averageRating: number;
  barberPerformance: {
    barber_id: string;
    barber_name: string;
    bookings_count: number;
    total_revenue: number;
    avg_rating: number;
  }[];
  popularServices: {
    service_id: string;
    service_name: string;
    count: number;
    total_revenue: number;
  }[];
}

// 1. Compute Exact Business Metrics from Database
export async function getBusinessMetrics(
  branchId: string,
  startDate: string,
  endDate: string
): Promise<BusinessMetrics> {
  // 1. Bookings Overview
  const bookingStats = await query<any[]>(
    `SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as noshow_count,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_at_booking ELSE 0 END), 0) as total_revenue
     FROM bookings
     WHERE branch_id = ? AND booking_date BETWEEN ? AND ?`,
    [branchId, startDate, endDate]
  );

  const stats = bookingStats[0] || {
    total_bookings: 0,
    completed_count: 0,
    cancelled_count: 0,
    noshow_count: 0,
    total_revenue: 0,
  };

  const total = Number(stats.total_bookings) || 0;
  const completed = Number(stats.completed_count) || 0;
  const cancelled = Number(stats.cancelled_count) || 0;
  const noshow = Number(stats.noshow_count) || 0;
  const revenue = Number(stats.total_revenue) || 0;
  const noShowRate = total > 0 ? Number(((noshow / total) * 100).toFixed(1)) : 0;

  // 2. Barbers Performance
  const barberRows = await query<any[]>(
    `SELECT 
        b.barber_id,
        COALESCE(bar.full_name, 'كابتن الصالون') as barber_name,
        COUNT(*) as bookings_count,
        COALESCE(SUM(b.total_at_booking), 0) as total_revenue,
        COALESCE(AVG(r.stars), 5.0) as avg_rating
     FROM bookings b
     LEFT JOIN barbers bar ON b.barber_id = bar.id
     LEFT JOIN ratings r ON r.barber_id = b.barber_id
     WHERE b.branch_id = ? AND b.booking_date BETWEEN ? AND ? AND b.status = 'completed'
     GROUP BY b.barber_id, bar.full_name
     ORDER BY total_revenue DESC`,
    [branchId, startDate, endDate]
  );

  // 3. Popular Services
  const serviceRows = await query<any[]>(
    `SELECT 
        b.service_id,
        COALESCE(s.name, 'خدمة الصالون') as service_name,
        COUNT(*) as count,
        COALESCE(SUM(b.total_at_booking), 0) as total_revenue
     FROM bookings b
     LEFT JOIN services s ON b.service_id = s.id
     WHERE b.branch_id = ? AND b.booking_date BETWEEN ? AND ? AND b.status = 'completed'
     GROUP BY b.service_id, s.name
     ORDER BY count DESC
     LIMIT 5`,
    [branchId, startDate, endDate]
  );

  // 4. Overall Average Rating
  const ratingRow = await query<any[]>(
    `SELECT COALESCE(AVG(stars), 5.0) as overall_rating 
     FROM ratings WHERE branch_id = ? AND created_at BETWEEN ? AND ?`,
    [branchId, `${startDate} 00:00:00`, `${endDate} 23:59:59`]
  );

  const averageRating = Number(Number(ratingRow[0]?.overall_rating || 5.0).toFixed(1));

  return {
    totalRevenue: revenue,
    totalBookings: total,
    completedBookings: completed,
    cancelledBookings: cancelled,
    noShowBookings: noshow,
    noShowRate,
    averageRating,
    barberPerformance: barberRows.map((r) => ({
      barber_id: r.barber_id,
      barber_name: r.barber_name,
      bookings_count: Number(r.bookings_count),
      total_revenue: Number(r.total_revenue),
      avg_rating: Number(Number(r.avg_rating).toFixed(1)),
    })),
    popularServices: serviceRows.map((r) => ({
      service_id: r.service_id,
      service_name: r.service_name,
      count: Number(r.count),
      total_revenue: Number(r.total_revenue),
    })),
  };
}

// 2. Generate Narrative Arabic Insights Report
export async function generateInsightsReport(branchId: string, periodDays: number = 7) {
  const end = new Date();
  const start = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const startDateStr = start.toISOString().split('T')[0];
  const endDateStr = end.toISOString().split('T')[0];

  const metrics = await getBusinessMetrics(branchId, startDateStr, endDateStr);

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

  const reportId = uuidv4();
  await query(
    `INSERT INTO insight_reports (id, branch_id, period_start, period_end, metrics_json, narrative_text, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [reportId, branchId, startDateStr, endDateStr, JSON.stringify(metrics), narrativeText]
  );

  return {
    id: reportId,
    period_start: startDateStr,
    period_end: endDateStr,
    metrics,
    narrative_text: narrativeText,
    generated_at: new Date().toISOString(),
  };
}
