import { z } from 'zod';

export const createBookingSchema = z
  .object({
    id: z.string().optional(),
    bookingId: z.string().optional(),
    customerName: z
      .string({ required_error: 'اسم العميل مطلوب' })
      .min(1, 'يرجى كتابة اسم العميل')
      .max(150, 'الاسم طويل جداً'),
    customerPhone: z
      .string({ required_error: 'رقم الهاتف مطلوب' })
      .min(6, 'رقم الهاتف غير مكتمل')
      .max(30, 'رقم الهاتف طويل جداً'),
    branchId: z.string().optional().default('branch-elhdad'),
    branchName: z.string().optional(),
    barberId: z.string().optional().nullable(),
    barberName: z.string().optional().nullable(),
    chairId: z.string().optional().nullable(),
    serviceId: z.string().optional().default('srv-haircut'),
    serviceName: z.string().optional(),
    servicePrice: z.number().optional(),
    totalAmount: z.number().optional(),
    additionalServiceIds: z.array(z.string()).optional().default([]),
    bookingType: z.enum(['normal', 'vip']).default('normal'),
    startsAt: z.string().optional(),
    endsAt: z.string().optional().nullable(),
    notes: z.string().max(1000, 'الملاحظات يجب أن لا تتجاوز 1000 حرف').optional().nullable(),
    selectedProducts: z
      .array(
        z.object({
          productId: z.string(),
          quantity: z.number().int().positive().max(50),
        })
      )
      .optional()
      .default([]),
    paymentProof: z
      .object({
        paymentMethod: z.string().optional().default('instapay'),
        senderPhone: z.string().optional().nullable(),
        imagePath: z.string().optional().nullable(),
        amount: z.number().optional().default(50),
      })
      .optional()
      .nullable(),
    source: z.string().optional().default('web'),
    status: z.string().optional(),
    aiBrief: z.string().optional().nullable(),
    confidenceScore: z.number().optional(),
    needsHumanAttention: z.boolean().optional(),
    customLineItems: z.array(z.any()).optional().default([]),
  })
  .passthrough();

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
