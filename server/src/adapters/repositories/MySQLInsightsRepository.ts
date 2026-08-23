import { v4 as uuidv4 } from 'uuid';
import { IInsightsRepository, BusinessMetricsData } from '../../domain/repositories/IInsightsRepository.js';
import { query } from '../../config/database.js';

export class MySQLInsightsRepository implements IInsightsRepository {
  public async getMetrics(branchId: string, startDate: string, endDate: string): Promise<BusinessMetricsData> {
    const summaryRows = await query<any[]>(
      `SELECT 
         COUNT(*) as total_bookings,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_bookings,
         SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show_bookings,
         COALESCE(SUM(CASE WHEN status = 'completed' THEN total_at_booking ELSE 0 END), 0) as total_revenue
       FROM bookings
       WHERE branch_id = ? AND booking_date BETWEEN ? AND ?`,
      [branchId, startDate, endDate]
    );

    const s = summaryRows[0] || {};
    const totalBookings = Number(s.total_bookings || 0);
    const completedBookings = Number(s.completed_bookings || 0);
    const cancelledBookings = Number(s.cancelled_bookings || 0);
    const noShowBookings = Number(s.no_show_bookings || 0);
    const totalRevenue = Number(s.total_revenue || 0);
    const noShowRate = totalBookings > 0 ? Math.round((noShowBookings / totalBookings) * 100) : 0;

    const ratingRows = await query<any[]>(
      `SELECT COALESCE(AVG(stars), 4.9) as avg_rating
       FROM ratings
       WHERE branch_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
      [branchId, startDate, endDate]
    );
    const averageRating = Number(Number(ratingRows[0]?.avg_rating || 4.9).toFixed(1));

    const barberRows = await query<any[]>(
      `SELECT 
         b.barber_id,
         COALESCE(bar.full_name, 'كابتن الصالون') as barber_name,
         COUNT(b.id) as bookings_count,
         COALESCE(SUM(b.total_at_booking), 0) as total_revenue,
         COALESCE(AVG(r.stars), 4.9) as avg_rating
       FROM bookings b
       LEFT JOIN barbers bar ON b.barber_id = bar.id
       LEFT JOIN ratings r ON b.id = r.booking_id
       WHERE b.branch_id = ? AND b.booking_date BETWEEN ? AND ? AND b.status = 'completed'
       GROUP BY b.barber_id, bar.full_name
       ORDER BY total_revenue DESC`,
      [branchId, startDate, endDate]
    );

    const popularRows = await query<any[]>(
      `SELECT 
         b.service_id,
         COALESCE(s.name, 'خدمة الصالون') as service_name,
         COUNT(b.id) as count,
         COALESCE(SUM(b.service_price_at_booking), 0) as total_revenue
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       WHERE b.branch_id = ? AND b.booking_date BETWEEN ? AND ? AND b.status = 'completed'
       GROUP BY b.service_id, s.name
       ORDER BY count DESC`,
      [branchId, startDate, endDate]
    );

    return {
      totalRevenue,
      totalBookings,
      completedBookings,
      cancelledBookings,
      noShowBookings,
      noShowRate,
      averageRating,
      barberPerformance: barberRows.map((r) => ({
        barber_id: r.barber_id || 'unassigned',
        barber_name: r.barber_name,
        bookings_count: Number(r.bookings_count),
        total_revenue: Number(r.total_revenue),
        avg_rating: Number(Number(r.avg_rating || 4.9).toFixed(1)),
      })),
      popularServices: popularRows.map((r) => ({
        service_id: r.service_id || 'srv',
        service_name: r.service_name,
        count: Number(r.count),
        total_revenue: Number(r.total_revenue),
      })),
    };
  }

  public async saveReport(branchId: string, startDate: string, endDate: string, metrics: BusinessMetricsData, narrative: string): Promise<string> {
    const reportId = `RPT-${uuidv4().substring(0, 8)}`;
    await query(
      `INSERT INTO insight_reports (id, branch_id, period_start, period_end, metrics_json, narrative_text, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [reportId, branchId, startDate, endDate, JSON.stringify(metrics), narrative]
    );
    return reportId;
  }
}
