import { ConversationSession } from '../domain/entities/ConversationSession.entity.js';
import { Booking } from '../domain/entities/Booking.entity.js';
import { CreateBookingUseCase } from '../usecases/bookings/CreateBookingUseCase.js';
import { ApplyCustomPricingUseCase } from '../usecases/bookings/ApplyCustomPricingUseCase.js';
import { UpdateBookingDraftUseCase } from '../usecases/bookings/UpdateBookingDraftUseCase.js';
import { SubmitPaymentProofUseCase } from '../usecases/payments/SubmitPaymentProofUseCase.js';
import { IBookingRepository } from '../domain/repositories/IBookingRepository.js';
import { IPaymentProofRepository } from '../domain/repositories/IPaymentProofRepository.js';
import { INotificationGateway } from '../domain/gateways/INotificationGateway.js';
import { IRealtimeNotifier } from '../domain/gateways/IRealtimeNotifier.js';

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
  }
}

function createTestBooking(props: {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  totalAmount: number;
  status: any;
  bookingType?: 'normal' | 'vip';
}): Booking {
  return new Booking(
    props.id,
    null,
    props.customerName,
    props.customerPhone,
    'branch-elhdad',
    null,
    null,
    props.serviceId,
    [],
    props.bookingType || 'normal',
    props.status,
    new Date().toISOString(),
    null,
    new Date().toISOString().split('T')[0],
    1,
    props.totalAmount,
    props.bookingType === 'vip' ? 100 : 50,
    0,
    0,
    props.totalAmount,
    `TK-${props.id}`,
    null,
    new Date().toISOString(),
    [],
    null,
    props.serviceName,
    'كابتن الصالون',
    'صالون الحداد VIP',
    'whatsapp'
  );
}

export async function runWhatsAppFlowTests(): Promise<boolean> {
  console.log('====================================================');
  console.log('🧪 RUNNING PRODUCTION WHATSAPP & BOOKING TEST SUITE');
  console.log('====================================================');

  const mockNotifier: IRealtimeNotifier = {
    broadcastToBranch: () => {},
    broadcastGlobal: () => {},
  };

  const sentWhatsAppMessages: Array<{ to: string; text: string }> = [];
  const mockNotificationGateway: INotificationGateway = {
    sendWhatsApp: async (to, text) => {
      sentWhatsAppMessages.push({ to, text });
      return true;
    },
  };

  const bookingsMap = new Map<string, Booking>();
  const mockBookingRepo: IBookingRepository = {
    createWithTransaction: async (data) => {
      const b = createTestBooking({
        id: data.id || 'BK-1001',
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        serviceId: data.serviceId,
        serviceName: data.serviceName || 'قص شعر كلاسيكي',
        totalAmount: data.totalAmount || data.servicePrice || 180,
        status: 'awaiting_payment',
        bookingType: data.bookingType,
      });
      bookingsMap.set(b.id, b);
      return b;
    },
    findById: async (id) => bookingsMap.get(id) || null,
    findBySecureToken: async () => null,
    search: async () => [],
    updateStatus: async (id, status) => {
      const b = bookingsMap.get(id);
      if (b) b.status = status;
      return b!;
    },
    updateCustomPricing: async (data) => {
      const b = bookingsMap.get(data.bookingId);
      if (!b) throw new Error('Booking not found');
      b.serviceName = data.serviceName;
      b.status = 'awaiting_payment';
      (b as any).totalAtBooking = data.totalAmount;
      (b as any).bookingFeeAtBooking = data.depositRequired;
      (b as any).discountAtBooking = data.discount;
      b.customLineItems = data.customLineItems;
      return b;
    },
    updateDraft: async (data) => {
      const b = bookingsMap.get(data.bookingId);
      if (!b) throw new Error('Booking not found');
      if (data.serviceId) (b as any).serviceId = data.serviceId;
      if (data.serviceName) b.serviceName = data.serviceName;
      if (data.startsAt) b.startsAt = data.startsAt;
      if (data.notes) b.notes = data.notes;
      return b;
    },
    reviewPaymentProof: async (id, status) => {
      const b = bookingsMap.get(id);
      if (b) b.status = status === 'approved' ? 'confirmed' : 'rejected';
      return b!;
    },
    findOverdueConfirmed: async () => [],
    markNoShow: async () => {},
    cancel: async (id) => {
      const b = bookingsMap.get(id);
      if (b) b.status = 'cancelled';
    },
  };

  const paymentProofsMap = new Map<string, any>();
  const mockPaymentProofRepo: IPaymentProofRepository = {
    submit: async (data) => {
      paymentProofsMap.set(data.bookingId, data);
      const b = bookingsMap.get(data.bookingId);
      if (b) b.status = 'pending_review';
    },
    findByBookingId: async (bookingId) => paymentProofsMap.get(bookingId) || null,
    updateStatus: async (bookingId, status) => {
      const p = paymentProofsMap.get(bookingId);
      if (p) p.status = status;
    },
  };

  // 1. CreateBookingUseCase
  console.log('\n--- 1. CreateBookingUseCase ---');
  const createBookingUseCase = new CreateBookingUseCase(mockBookingRepo, mockNotificationGateway, mockNotifier);
  const newBooking = await createBookingUseCase.execute({
    branchId: 'branch-elhdad',
    customerName: 'محمد أحمد',
    customerPhone: '01001234567',
    serviceId: 'srv-haircut-classic',
    serviceName: 'قص شعر كلاسيكي',
    servicePrice: 180,
    bookingType: 'normal',
  });
  assert(Boolean(newBooking && newBooking.id === 'BK-1001'), 'CreateBookingUseCase creates booking with ID BK-1001');
  assert(newBooking.status === 'awaiting_payment', 'Initial booking status is awaiting_payment');
  assert(sentWhatsAppMessages.length === 0, 'No conflicting duplicate WhatsApp dispatch directly inside CreateBookingUseCase');

  // 2. SubmitPaymentProofUseCase
  console.log('\n--- 2. SubmitPaymentProofUseCase ---');
  const submitProofUseCase = new SubmitPaymentProofUseCase(mockBookingRepo, mockPaymentProofRepo, mockNotifier);

  const failPhoneResult = await submitProofUseCase.execute({
    bookingId: newBooking.id,
    senderPhone: '01299999999',
    imagePath: 'https://trimmind.up.railway.app/uploads/receipt.png',
  });
  assert(failPhoneResult.success === false, 'Submit payment proof with mismatched phone is correctly rejected');

  const successProofResult = await submitProofUseCase.execute({
    bookingId: newBooking.id,
    senderPhone: '01001234567',
    imagePath: 'https://trimmind.up.railway.app/uploads/receipt.png',
    transferredAmount: 50,
  });
  assert(successProofResult.success === true, 'Submit payment proof with matching phone succeeds');
  assert(newBooking.status === 'pending_review', 'Booking status transitioned to pending_review');

  const savedProof = await mockPaymentProofRepo.findByBookingId(newBooking.id);
  assert(savedProof?.transferredAmount === 50, 'Payment proof record contains correct amount');

  // 3. ApplyCustomPricingUseCase
  console.log('\n--- 3. ApplyCustomPricingUseCase ---');
  const customBooking = createTestBooking({
    id: 'BK-CUSTOM-99',
    customerName: 'خالد ممدوح',
    customerPhone: '01011223344',
    serviceId: 'srv-haircut-classic',
    serviceName: 'باقة مخصصة',
    totalAmount: 0,
    status: 'custom_pricing_requested',
    bookingType: 'vip',
  });
  bookingsMap.set(customBooking.id, customBooking);

  const applyCustomPricingUseCase = new ApplyCustomPricingUseCase(mockBookingRepo, mockNotifier, mockNotificationGateway);
  const customResult = await applyCustomPricingUseCase.execute({
    bookingId: customBooking.id,
    items: [
      { name: 'قص شعر ملكي', price: 300 },
      { name: 'عناية لحية VIP', price: 200 },
    ],
    subtotal: 500,
    discount: 50,
    totalPrice: 450,
    depositRequired: 100,
    remainingBalance: 350,
    serviceName: 'باقة العريس VIP الملكية',
  });
  assert(customResult.success === true, 'Custom pricing applied successfully');
  assert(customResult.booking.status === 'awaiting_payment', 'Custom pricing transitions booking status to awaiting_payment');
  assert(sentWhatsAppMessages.length > 0, 'WhatsApp invoice message sent to customer on custom pricing');
  assert(sentWhatsAppMessages[sentWhatsAppMessages.length - 1].to === '01011223344', 'WhatsApp invoice recipient phone matches customer');

  // 4. UpdateBookingDraftUseCase
  console.log('\n--- 4. UpdateBookingDraftUseCase ---');
  const updateDraftUseCase = new UpdateBookingDraftUseCase(mockBookingRepo, mockNotifier);
  const draftBooking = createTestBooking({
    id: 'BK-DRAFT-1',
    customerName: 'عميل مسودة',
    customerPhone: '01055554444',
    serviceId: 'srv-1',
    serviceName: 'قص شعر',
    totalAmount: 180,
    status: 'draft',
  });
  bookingsMap.set(draftBooking.id, draftBooking);

  const draftResult = await updateDraftUseCase.execute({
    bookingId: draftBooking.id,
    notes: 'تم تعديل الملاحظات',
  });
  assert(draftResult.success === true, 'Update booking draft executed successfully');

  // 5. ConversationSession Entity Logic
  console.log('\n--- 5. ConversationSession Entity ---');
  const session = new ConversationSession({
    id: 'cs-12345',
    customerPhone: '01001234567',
    whatsappRemoteJid: '201001234567@s.whatsapp.net',
    channel: 'whatsapp',
    state: 'AWAITING_PAYMENT',
    activeBookingId: newBooking.id,
    humanHandoffActive: false,
    lastMessageAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert(session.state === 'AWAITING_PAYMENT', 'Session state is AWAITING_PAYMENT');
  assert(session.activeBookingId === newBooking.id, 'Session activeBookingId matches');

  console.log('====================================================');
  console.log(`📊 UNIT TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('====================================================');

  return passed === total;
}

if (process.argv[1]?.endsWith('whatsapp_flow.test.js') || process.argv[1]?.endsWith('whatsapp_flow.test.ts')) {
  runWhatsAppFlowTests().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}
