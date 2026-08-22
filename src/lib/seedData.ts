import {
  Branch,
  Barber,
  Chair,
  Service,
  Product,
  Booking,
  QueueEntry,
  AuditLog,
  Profile,
  SalonSettings,
} from '../types';

export const INITIAL_BRANCHES: Branch[] = [];

export const INITIAL_BARBERS: Barber[] = [];

export const INITIAL_CHAIRS: Chair[] = [];

export const INITIAL_SERVICES: Service[] = [];

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_SETTINGS: SalonSettings = {
  salon_name: (import.meta as any).env?.VITE_SALON_NAME || 'صالون الحلاقة والعناية VIP',
  tagline: 'الوجهة الأولى للرجل العصري الباحث عن الدقة والأناقة الفائقة',
  about_text: 'يقدم الصالون أرقى خدمات الحلاقة والعناية باللحية والبشرة، مع نظام حجز رقمي ذكي يضمن خصوصيتك وراحتك بدون أي انتظار.',
  primary_phone: (import.meta as any).env?.VITE_SALON_PHONE || '',
  secondary_phone: '',
  whatsapp_number: (import.meta as any).env?.VITE_SALON_WHATSAPP || '',
  working_hours_text: 'يومياً: 10:00 ص – 11:30 م (الحجز الإلكتروني متاح 24/7)',
  booking_fee_normal: 50,
  booking_fee_vip: 100,
  cancellation_grace_hours: 3,
  max_advance_days: 14,
  vodafone_cash_number: (import.meta as any).env?.VITE_VODAFONE_CASH || '',
  instapay_username: (import.meta as any).env?.VITE_INSTAPAY_USERNAME || '',
  bank_account_info: '',
};

export const INITIAL_PROFILES: Profile[] = [
  {
    id: 'usr-customer-guest',
    full_name: 'عميل زائر',
    phone: '',
    email: '',
    role: 'customer',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'usr-manager-super',
    full_name: (import.meta as any).env?.VITE_MANAGER_FULL_NAME || 'المدير العام',
    phone: (import.meta as any).env?.VITE_MANAGER_PHONE || '01011122233',
    email: (import.meta as any).env?.VITE_MANAGER_EMAIL || 'admin@salon.com',
    password: (import.meta as any).env?.VITE_INITIAL_MANAGER_PASSWORD || '',
    role: 'manager',
    is_super_admin: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const INITIAL_BOOKINGS: Booking[] = [];

export const INITIAL_QUEUE: QueueEntry[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];
