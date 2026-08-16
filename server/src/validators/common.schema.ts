import { z } from 'zod';

export const branchSchema = z.object({
  name: z.string().min(3).max(200),
  address: z.string().min(5),
  phone: z.string().min(8).max(20),
  opening_time: z.string().default('10:00'),
  closing_time: z.string().default('23:00'),
  is_active: z.boolean().default(true),
  image_url: z.string().optional(),
  instapay_username: z.string().optional(),
  vodafone_cash_number: z.string().optional(),
  bank_account_info: z.string().optional(),
});

export const barberSchema = z.object({
  branch_id: z.string().min(1),
  full_name: z.string().min(3).max(150),
  phone: z.string().optional(),
  photo_url: z.string().optional(),
  specialty: z.string().optional(),
  is_active: z.boolean().default(true),
  service_ids: z.array(z.string()).optional(),
});

export const chairSchema = z.object({
  branch_id: z.string().min(1),
  barber_id: z.string().optional().nullable(),
  name: z.string().min(2).max(100),
  mode: z.enum(['normal', 'vip', 'both']).default('normal'),
  is_active: z.boolean().default(true),
});

export const serviceSchema = z.object({
  branch_id: z.string().optional().nullable(),
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  duration_minutes: z.number().int().positive().default(30),
  category: z.enum(['hair', 'beard', 'skin', 'vip_package', 'kids']).default('hair'),
  is_vip_only: z.boolean().default(false),
  is_active: z.boolean().default(true),
  image_url: z.string().optional(),
});

export const productSchema = z.object({
  branch_id: z.string().optional().nullable(),
  name: z.string().min(2).max(200),
  category: z.enum(['hot_drink', 'cold_drink', 'care_product', 'cigar_shisha']).default('hot_drink'),
  price: z.number().nonnegative(),
  is_active: z.boolean().default(true),
  image_url: z.string().optional(),
  description: z.string().optional(),
});
