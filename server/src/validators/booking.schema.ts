import { z } from 'zod';

export const createBookingSchema = z.object({
  id: z.string().optional(),
  bookingId: z.string().optional(),
  customerName: z
    .string({ required_error: 'اسم العميل مطلوب' })
    .min(2, 'الاسم يجب أن لا يقل عن حرفين')
    .max(100, 'الاسم طويل جداً'),
  customerPhone: z
    .string({ required_error: 'رقم الهاتف مطلوب' })
    .transform((val) => val.replace(/\s+/g, '').replace(/^(\+20|20)/, '0'))
    .refine((val) => /^01[0125][0-9]{8}$/.test(val) || val.length >= 10, {
      message: 'رقم الهاتف يجب أن يكون رقم هاتف صحيح (مثال: 01012345678)',
    }),
  branchId: z.string({ required_error: 'يرجى اختيار الفرع' }),
  branchName: z.string().optional(),
  barberId: z.string().optional(),
  barberName: z.string().optional(),
  chairId: z.string().optional(),
  serviceId: z.string({ required_error: 'يرجى اختيار الخدمة' }),
  serviceName: z.string().optional(),
  servicePrice: z.number().optional(),
  totalAmount: z.number().optional(),
  additionalServiceIds: z.array(z.string()).optional(),
  bookingType: z.enum(['normal', 'vip']).default('normal'),
  startsAt: z.string({ required_error: 'توقيت الحجز مطلوب' }),
  endsAt: z.string().optional(),
  notes: z.string().max(500, 'الملاحظات يجب أن لا تتجاوز 500 حرف').optional(),
  selectedProducts: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive().max(50),
      })
    )
    .optional(),
  paymentProof: z
    .object({
      paymentMethod: z.enum(['instapay', 'vodafone_cash', 'card', 'cash']),
      senderPhone: z.string().min(4).max(30),
      imagePath: z.string().min(5),
      amount: z.number().positive(),
    })
    .optional(),
  source: z.enum(['web', 'whatsapp']).optional(),
  aiBrief: z.string().optional(),
  confidenceScore: z.number().optional(),
  needsHumanAttention: z.boolean().optional(),
  customLineItems: z.array(z.any()).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(300, 'سبب الإلغاء طويل جداً').optional(),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum([
    'draft',
    'awaiting_payment',
    'payment_submitted',
    'pending_review',
    'confirmed',
    'customer_arrived',
    'in_service',
    'completed',
    'rejected',
    'cancelled',
    'expired',
    'no_show',
  ]),
  note: z.string().max(300).optional(),
  booking: z.any().optional(),
});

export const rateBookingSchema = z.object({
  stars: z.number().min(1).max(5),
  barber_score: z.number().min(1).max(5).optional(),
  place_score: z.number().min(1).max(5).optional(),
  experience_score: z.number().min(1).max(5).optional(),
  comment: z.string().max(500).optional(),
});
