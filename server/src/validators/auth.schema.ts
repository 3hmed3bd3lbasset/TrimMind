import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z
    .string({ required_error: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف' })
    .min(3, 'الاسم أو المعرف قصير جداً')
    .max(200, 'المعرف طويل جداً'),
  password: z
    .string({ required_error: 'يرجى إدخال كلمة المرور' })
    .min(6, 'كلمة المرور يجب أن لا تقل عن 6 أحرف')
    .max(100, 'كلمة المرور طويلة جداً'),
});

export const createStaffSchema = z.object({
  full_name: z.string().min(3, 'الاسم يجب أن لا يقل عن 3 أحرف').max(100),
  phone: z.string().regex(/^01[0125][0-9]{8}$/, 'رقم هاتف مصري غير صحيح (01...)'),
  email: z.string().email('بريد إلكتروني غير صحيح'),
  password: z.string().min(8, 'كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل'),
  role: z.enum(['receptionist', 'manager', 'barber']),
  branch_id: z.string().optional(),
  barber_id: z.string().optional(),
  is_super_admin: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  identifier: z
    .string({ required_error: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف' })
    .min(3, 'المعرف قصير جداً')
    .max(200, 'المعرف طويل جداً'),
});

export const verifyOtpSchema = z.object({
  identifier: z
    .string({ required_error: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف' })
    .min(3),
  otp: z
    .string({ required_error: 'يرجى إدخال رمز التحقق OTP' })
    .length(6, 'رمز التحقق يجب أن يتكون من 6 أرقام'),
});

export const resetPasswordSchema = z.object({
  identifier: z
    .string({ required_error: 'يرجى إدخال البريد الإلكتروني أو رقم الهاتف' })
    .min(3),
  otp: z
    .string({ required_error: 'يرجى إدخال رمز التحقق OTP' })
    .length(6, 'رمز التحقق يجب أن يتكون من 6 أرقام'),
  newPassword: z
    .string({ required_error: 'يرجى إدخال كلمة المرور الجديدة' })
    .min(6, 'كلمة المرور يجب أن لا تقل عن 6 أحرف')
    .max(100),
});

