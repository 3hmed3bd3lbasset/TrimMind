export interface BusinessMetricsData {
  totalRevenue: number;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  noShowRate: number;
  averageRating: number;
  barberPerformance: Array<{
    barber_id: string;
    barber_name: string;
    bookings_count: number;
    total_revenue: number;
    avg_rating: number;
  }>;
  popularServices: Array<{
    service_id: string;
    service_name: string;
    count: number;
    total_revenue: number;
  }>;
}

export interface IInsightsRepository {
  getMetrics(branchId: string, startDate: string, endDate: string): Promise<BusinessMetricsData>;
  saveReport(branchId: string, startDate: string, endDate: string, metrics: BusinessMetricsData, narrative: string): Promise<string>;
}
