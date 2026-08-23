export interface RecallCandidate {
  customer_phone: string;
  customer_name: string;
  last_visit_date: string;
  days_since_last_visit: number;
  total_visits: number;
  last_barber: string;
  last_service: string;
}

export class RecallCampaign {
  constructor(
    public readonly id: string,
    public readonly branchId: string,
    public readonly createdBy: string | null,
    public readonly thresholdDays: number,
    public readonly notes: string,
    public readonly createdAt: string = new Date().toISOString(),
    public totalSends: number = 0,
    public totalRebooked: number = 0
  ) {}
}
