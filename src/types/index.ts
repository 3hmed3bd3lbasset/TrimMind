export type UserRole = 'customer' | 'receptionist' | 'manager' | 'barber';

export type BookingType = 'normal' | 'vip';

export type ChairMode = 'normal' | 'vip' | 'both';

export type BookingStatus =
  | 'draft'
  | 'custom_pricing_requested'
  | 'awaiting_payment'
  | 'payment_submitted'
  | 'pending_review'
  | 'confirmed'
  | 'customer_arrived'
  | 'in_service'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'no_show';

export type PaymentStatus = 'pending_review' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  password?: string; // Login password / PIN for staff accounts
  role: UserRole;
  is_super_admin?: boolean; // Super Admin (المدير الأساسي) vs Partner/Branch Manager
  assigned_branch_ids?: string[]; // Allowed branches for this manager/partner
  branch_id?: string;
  barber_id?: string; // If user is a barber
  created_at: string;
  updated_at: string;
}

export interface SalonSettings {
  salon_name: string;
  tagline: string;
  about_text: string;
  primary_phone: string;
  secondary_phone?: string;
  whatsapp_number?: string;
  working_hours_text: string;
  booking_fee_normal: number;
  booking_fee_vip: number;
  cancellation_grace_hours: number;
  max_advance_days: number;
  vodafone_cash_number?: string;
  instapay_username?: string;
  bank_account_info?: string;
  manager_report_phone?: string;
  recall_days_threshold?: number;
  weekly_off_days?: number[]; // 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  opening_time: string; // e.g. "10:00"
  closing_time: string; // e.g. "23:00"
  is_active: boolean;
  image_url?: string;
  instapay_username?: string;
  vodafone_cash_number?: string;
  bank_account_info?: string;
  settings?: Record<string, any>;
  created_at: string;
}

export interface Barber {
  id: string;
  branch_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  password?: string; // Barber login password / PIN for profile access
  photo_url?: string;
  rating?: number;
  rating_count?: number;
  specialty?: string;
  is_active: boolean;
  service_ids?: string[];
  created_at: string;
}

export interface Chair {
  id: string;
  branch_id: string;
  barber_id?: string;
  name: string;
  mode: ChairMode;
  is_active: boolean;
  status?: 'available' | 'in_service' | 'cleaning' | 'offline';
  current_booking_id?: string;
  service_ends_at?: string;
  created_at: string;
}

export interface Service {
  id: string;
  branch_id?: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes: number;
  category: 'hair' | 'beard' | 'skin' | 'vip_package' | 'kids';
  is_vip_only?: boolean;
  is_active: boolean;
  image_url?: string;
  created_at: string;
}

export interface Product {
  id: string;
  branch_id?: string;
  name: string;
  category: 'hot_drink' | 'cold_drink' | 'care_product' | 'cigar_shisha';
  price: number;
  is_active: boolean;
  image_url?: string;
  description?: string;
}

export interface Setting {
  key: string;
  branch_id?: string;
  value: any;
  updated_at: string;
}

export interface BookingItem {
  id: string;
  booking_id: string;
  product_id?: string;
  name: string;
  price_at_booking: number;
  quantity: number;
}

export interface BookingModificationLog {
  role: UserRole;
  actor_name: string;
  action: string;
  timestamp: string;
  old_total: number;
  new_total: number;
  note?: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  branch_id: string;
  barber_id?: string;
  chair_id?: string;
  service_id: string;
  additional_service_ids?: string[];
  booking_type: BookingType;
  status: BookingStatus;
  starts_at: string; // ISO String
  ends_at: string; // ISO String
  service_price_at_booking: number;
  booking_fee_at_booking: number;
  discount_at_booking: number;
  discount_amount?: number;
  items_total_at_booking: number;
  total_at_booking: number;
  secure_token: string;
  queue_number?: number;
  notes?: string;
  items?: BookingItem[];
  payment_proof?: PaymentProof;
  rating?: Rating;
  last_modified_by?: BookingModificationLog;
  completed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  source?: 'web' | 'whatsapp';
  service_name?: string;
  barber_name?: string;
  serviceName?: string;
  barberName?: string;
  ai_brief?: string;
  confidence_score?: number;
  needs_human_attention?: boolean;
  handoff_expires_at?: string | null;
  custom_line_items?: Array<{ name: string; price: number }>;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppAnalyticsData {
  totalChats: number;
  convertedBookings: number;
  conversionRate: number;
  totalRevenue: number;
  totalDeposits: number;
  humanHandoffCount: number;
  avgResponseTimeSeconds: number;
  customerSatisfactionScore: number;
}

export interface BookingStatusHistory {
  id: string;
  booking_id: string;
  from_status?: BookingStatus;
  to_status: BookingStatus;
  changed_by?: string;
  changed_by_name?: string;
  changed_at: string;
  note?: string;
}

export interface PaymentProof {
  id: string;
  booking_id: string;
  image_path: string;
  payment_method: 'instapay' | 'vodafone_cash' | 'card' | 'cash';
  sender_phone: string;
  transferred_amount: number;
  status: PaymentStatus;
  reviewed_by?: string;
  rejection_reason?: string;
  submitted_at: string;
  reviewed_at?: string;
  is_image_purged?: boolean;
  purged_at?: string;
}

export interface Invoice {
  id: string;
  booking_id: string;
  subtotal: number;
  booking_fee: number;
  discount: number;
  total: number;
  paid_amount: number;
  remaining_amount: number;
  created_at: string;
}

export interface QueueEntry {
  id: string;
  branch_id: string;
  chair_id?: string;
  booking_id?: string;
  customer_name: string;
  service_name: string;
  barber_name: string;
  position: number;
  estimated_wait_minutes?: number;
  created_at: string;
}

export interface Rating {
  id: string;
  booking_id: string;
  customer_id: string;
  customer_name?: string;
  barber_id: string;
  branch_id: string;
  stars: number; // 1-5 (المتوسط العام)
  barber_score?: number; // 1-5 (تقييم الكابتن)
  place_score?: number; // 1-5 (تقييم المكان والنظافة)
  experience_score?: number; // 1-5 (تقييم التجربة والمعاملة)
  comment?: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type:
    | 'new_booking'
    | 'payment_proof_submitted'
    | 'pending_review'
    | 'booking_confirmed'
    | 'customer_arrived'
    | 'in_service'
    | 'completed'
    | 'cancelled'
    | 'system';
  target_id?: string; // Booking ID or relevant entity ID
  target_type?: 'booking' | 'payment_proof' | 'queue' | 'chair';
  branch_id?: string;
  read: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  customer_id: string;
  type: string;
  payload: Record<string, any>;
  read_at?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_name?: string;
  actor_role?: UserRole;
  action: string;
  target_table?: string;
  target_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  payload?: {
    type?: string;
    data?: any;
    [key: string]: any;
  };
  created_at: string;
}
