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
  salon_name: '',
  tagline: '',
  about_text: '',
  primary_phone: '',
  secondary_phone: '',
  whatsapp_number: '',
  working_hours_text: '',
  booking_fee_normal: 0,
  booking_fee_vip: 0,
  cancellation_grace_hours: 0,
  max_advance_days: 0,
  vodafone_cash_number: '',
  instapay_username: '',
  bank_account_info: '',
};

export const INITIAL_PROFILES: Profile[] = [
  {
    id: 'usr-manager-super',
    full_name: import.meta.env.VITE_MANAGER_FULL_NAME || 'مدير الصالون',
    phone: import.meta.env.VITE_MANAGER_PHONE || '',
    email: import.meta.env.VITE_MANAGER_EMAIL || '',
    password: import.meta.env.VITE_INITIAL_MANAGER_PASSWORD || '',
    role: 'manager',
    is_super_admin: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const INITIAL_BOOKINGS: Booking[] = [];

export const INITIAL_QUEUE: QueueEntry[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];