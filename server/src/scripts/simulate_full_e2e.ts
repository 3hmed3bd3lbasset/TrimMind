import { Booking } from '../domain/entities/Booking.entity.js';
import { Profile } from '../domain/entities/Profile.entity.js';
import { Chair } from '../domain/entities/Chair.entity.js';
import { WaitlistEntry } from '../domain/entities/WaitlistEntry.entity.js';
import { BcryptPasswordHasher } from '../adapters/gateways/BcryptPasswordHasher.js';
import { JwtTokenService } from '../adapters/gateways/JwtTokenService.js';

function formatCurrency(amount: number): string {
  return `${amount} ج.م`;
}

async function runEndToEndDomainAndGlitchSimulation() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE CLIENT & SERVER GLITCH SIMULATION TEST');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testTitle: string, extra?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testTitle}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testTitle}${extra ? ' -> ' + extra : ''}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------
  // 1. FINANCIAL & PRICE CALCULATION ACCURACY TEST (NO GLITCHES)
  // -----------------------------------------------------------------
  console.log('📌 [TEST 1]: Financial & Price Calculation Invariants...');

  // Test Case: VIP Booking with 100 EGP deposit
  const vipBooking = new Booking(
    'BK-1001',
    'usr-1',
    'أحمد عبد الباسط',
    '01285694670',
    'branch-elhdad',
    'barber-mohamed',
    'chair-1',
    'srv-vip-royal',
    ['srv-beard-care'],
    'vip',
    'pending_review',
    new Date().toISOString(),
    null,
    new Date().toISOString().split('T')[0],
    1,
    750, // Service price
    100, // VIP deposit
    0,
    150, // Products total
    900, // Total = 750 + 150
    'VIP-SEC-1234',
    'حجز VIP ملكي',
    new Date().toISOString(),
    [],
    {
      id: 'proof-1',
      booking_id: 'BK-1001',
      image_path: 'uploads/proof.jpg',
      payment_method: 'instapay',
      sender_phone: '01285694670',
      transferred_amount: 100,
      status: 'pending_review',
      submitted_at: new Date().toISOString(),
    }
  );

  assert(vipBooking.totalAtBooking === 900, '1.1 Total equals service price + products total (750 + 150 = 900)');
  assert(vipBooking.paymentProof?.transferred_amount === 100, '1.2 Deposit paid is recorded accurately as 100 EGP');
  assert(vipBooking.calculateRemaining() === 800, '1.3 Remaining balance strictly calculated as (900 - 100 = 800 EGP)');
  assert(formatCurrency(800) === '800 ج.م', '1.4 Currency formatter produces correct Arabic currency format');

  // Test Case: Normal Booking with 50 EGP deposit
  const normalBooking = new Booking(
    'BK-1002',
    'usr-2',
    'محمود شاكر',
    '01012345678',
    'branch-elhdad',
    'barber-karim',
    'chair-2',
    'srv-haircut',
    [],
    'normal',
    'awaiting_payment',
    new Date().toISOString(),
    null,
    new Date().toISOString().split('T')[0],
    2,
    180,
    50,
    0,
    0,
    180,
    'NOR-SEC-5678'
  );

  assert(normalBooking.calculateRemaining() === 130, '1.5 Normal booking remaining calculated strictly as (180 - 50 = 130 EGP)');

  // -----------------------------------------------------------------
  // 2. CHAIR OCCUPANCY & LIFECYCLE INVARIANTS (NO CONFLICTS)
  // -----------------------------------------------------------------
  console.log('\n📌 [TEST 2]: Chair Occupancy & Status Lifecycle...');
  const chair = new Chair('chair-vip-1', 'branch-elhdad', 'barber-mohamed', 'كرسي VIP الملكي 1', 'vip');
  assert(chair.isAvailable() === true, '2.1 Initial chair status is available');

  chair.occupy(vipBooking.id, new Date(Date.now() + 45 * 60 * 1000).toISOString());
  assert(chair.status === 'in_service', '2.2 Chair transitions to in_service when occupied');
  assert(chair.isAvailable() === false, '2.3 Occupied chair reports not available to other customers');

  chair.release();
  assert(chair.status === 'available' && chair.currentBookingId === null, '2.4 Chair released successfully on checkout');

  // -----------------------------------------------------------------
  // 3. SMART WAITLIST OFFER EXPIRY INVARIANTS
  // -----------------------------------------------------------------
  console.log('\n📌 [TEST 3]: Smart Waitlist Token & Expiry Invariants...');
  const waitlist = new WaitlistEntry(
    'WLT-001',
    'branch-elhdad',
    'barber-mohamed',
    'حسام حسن',
    '01122334455',
    '2026-08-23',
    'afternoon',
    'srv-haircut'
  );

  assert(waitlist.status === 'waiting', '3.1 Waitlist entry begins in waiting status');
  const validExpiry = new Date(Date.now() + 25 * 60 * 1000);
  waitlist.makeOffer('WLT-TOKEN-99', validExpiry);
  assert(waitlist.isOfferValid() === true, '3.2 Active 25-minute offer is recognized as valid');

  const expiredExpiry = new Date(Date.now() - 5 * 60 * 1000);
  const expiredWaitlist = new WaitlistEntry(
    'WLT-002',
    'branch-elhdad',
    'barber-mohamed',
    'عميل منتهي',
    '01122334455',
    '2026-08-23',
    'afternoon',
    'srv-haircut',
    'offered',
    'EXP-TOKEN',
    new Date().toISOString(),
    expiredExpiry.toISOString()
  );
  assert(expiredWaitlist.isOfferValid() === false, '3.3 Past 25-minute window offer is safely marked invalid/expired');

  // -----------------------------------------------------------------
  // 4. NO-SHOW AUTO-DETECTION ACCURACY
  // -----------------------------------------------------------------
  console.log('\n📌 [TEST 4]: No-Show Overdue Calculation Invariants...');
  const overdueStartsAt = new Date(Date.now() - 40 * 60 * 1000).toISOString(); // 40 mins ago
  const overdueBooking = new Booking(
    'BK-1003',
    'usr-3',
    'عميل متأخر',
    '01099999999',
    'branch-elhdad',
    null,
    null,
    'srv-haircut',
    [],
    'normal',
    'confirmed',
    overdueStartsAt,
    null,
    '2026-08-23',
    3,
    180,
    50,
    0,
    0,
    180,
    'NOR-SEC-9999'
  );

  assert(overdueBooking.isOverdueForNoShow(35) === true, '4.1 40-min overdue booking flagged for automated No-Show reclamation');

  const freshStartsAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 mins ago
  const freshBooking = new Booking(
    'BK-1004',
    'usr-4',
    'عميل في وقته',
    '01088888888',
    'branch-elhdad',
    null,
    null,
    'srv-haircut',
    [],
    'normal',
    'confirmed',
    freshStartsAt,
    null,
    '2026-08-23',
    4,
    180,
    50,
    0,
    0,
    180,
    'NOR-SEC-8888'
  );
  assert(freshBooking.isOverdueForNoShow(35) === false, '4.2 Booking within grace period is not incorrectly marked as no-show');

  // -----------------------------------------------------------------
  // 5. SECURITY, HASHER & TOKEN INTEGRITY (ZERO BACKDOORS)
  // -----------------------------------------------------------------
  console.log('\n📌 [TEST 5]: Password Hasher & Token Integrity...');
  const hasher = new BcryptPasswordHasher();
  const tokenService = new JwtTokenService();

  const samplePassword = 'StrongPassword#2026';
  const sampleHash = await hasher.hash(samplePassword);

  assert(await hasher.verify(samplePassword, sampleHash) === true, '5.1 Valid password successfully verifies against Bcrypt');
  assert(await hasher.verify('Admin@123456', sampleHash) === false, '5.2 Hardcoded backdoor password rejected');
  assert(await hasher.verify('admin123456', sampleHash) === false, '5.3 Hardcoded lower-case backdoor rejected');

  const jwt = tokenService.generateToken({ id: 'usr-manager', role: 'manager', email: 'admin@salon.com' });
  const decoded = tokenService.verifyToken(jwt);
  assert(decoded?.role === 'manager' && decoded?.id === 'usr-manager', '5.4 JWT token created and decoded with role intact');

  // -----------------------------------------------------------------
  // 6. ROLE & BRANCH PERMISSIONS
  // -----------------------------------------------------------------
  console.log('\n📌 [TEST 6]: Role & Branch Permission Invariants...');
  const superAdmin = new Profile('usr-admin', 'أحمد عبد الباسط', '01285694670', 'admin@salon.com', sampleHash, 'manager', true);
  assert(superAdmin.hasAccessToBranch('branch-elhdad') === true, '6.1 Super admin has access to any branch');
  assert(superAdmin.hasAccessToBranch('any-other-branch') === true, '6.2 Super admin access extends to dynamic branches');

  const receptionist = new Profile('usr-rec', 'موظف الاستقبال', '01005437633', 'rec@salon.com', sampleHash, 'receptionist', false, 'branch-elhdad');
  assert(receptionist.hasAccessToBranch('branch-elhdad') === true, '6.3 Receptionist has access to assigned branch');
  assert(receptionist.hasAccessToBranch('branch-cairo') === false, '6.4 Receptionist isolated from unassigned branches');

  console.log('\n================================================================');
  console.log(`📊 SIMULATION COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndDomainAndGlitchSimulation().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
