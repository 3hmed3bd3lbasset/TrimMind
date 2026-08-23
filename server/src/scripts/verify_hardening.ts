import { query, withTransaction, queryConn } from '../config/database.js';
import { authenticateStaff, hashPassword, verifyPassword } from '../services/auth.service.js';
import { createBooking, getBookingById } from '../services/booking.service.js';
import { v4 as uuidv4 } from 'uuid';

async function runHardeningTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING PRODUCTION READINESS HARDENING TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${details ? ' - ' + details : ''}`);
      failed++;
    }
  }

  try {
    // -----------------------------------------------------------------
    // TEST 1: Password Hash & Verification without backdoor
    // -----------------------------------------------------------------
    const rawPass = 'SecretManager@2026';
    const hashed = await hashPassword(rawPass);
    const validMatch = await verifyPassword(rawPass, hashed);
    const wrongMatch = await verifyPassword('Admin@123456', hashed);
    const blankMatch = await verifyPassword('', hashed);

    assert(validMatch === true, 'Test 1.1: Correct password verifies successfully against bcrypt hash');
    assert(wrongMatch === false, 'Test 1.2: Hardcoded "Admin@123456" fails verification against different password');
    assert(blankMatch === false, 'Test 1.3: Blank password fails verification');

    // -----------------------------------------------------------------
    // TEST 2: Staff Authentication with Database Hash
    // -----------------------------------------------------------------
    const testUserId = `test-user-${uuidv4().substring(0, 8)}`;
    const testPhone = '01299998888';
    const testEmail = `test_${uuidv4().substring(0, 6)}@salon.com`;
    const userPass = 'CustomUserPass#99';
    const userHash = await hashPassword(userPass);

    await query(
      `INSERT INTO profiles (id, full_name, phone, email, password_hash, role, is_super_admin, is_active)
       VALUES (?, 'مستخدم الاختبار الأمني', ?, ?, ?, 'receptionist', 0, 1)`,
      [testUserId, testPhone, testEmail, userHash]
    );

    const authSuccess = await authenticateStaff(testPhone, userPass, '127.0.0.1');
    const authWrongPass = await authenticateStaff(testPhone, 'Admin@123456', '127.0.0.1');
    const authNonExistent = await authenticateStaff('01000000000', 'any_pass', '127.0.0.1');

    assert(authSuccess !== null && authSuccess.user.id === testUserId, 'Test 2.1: authenticateStaff succeeds with valid credentials');
    assert(authWrongPass === null, 'Test 2.2: authenticateStaff rejects "Admin@123456" for custom user');
    assert(authNonExistent === null, 'Test 2.3: authenticateStaff returns null for non-existent user');

    // Cleanup test profile
    await query('DELETE FROM profiles WHERE id = ?', [testUserId]).catch(() => {});

    // -----------------------------------------------------------------
    // TEST 3: Webhook Idempotency (Persistent Database-Backed)
    // -----------------------------------------------------------------
    const testEventId = `WH-TEST-${uuidv4()}`;
    let firstInsert = false;
    let duplicateInsertRejected = false;

    try {
      await query(
        'INSERT INTO webhook_events (id, source, event_type, processed_at) VALUES (?, "test_source", "message", NOW())',
        [testEventId]
      );
      firstInsert = true;
    } catch {}

    try {
      await query(
        'INSERT INTO webhook_events (id, source, event_type, processed_at) VALUES (?, "test_source", "message", NOW())',
        [testEventId]
      );
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
        duplicateInsertRejected = true;
      }
    }

    assert(firstInsert === true, 'Test 3.1: First webhook event inserted successfully into database');
    assert(duplicateInsertRejected === true, 'Test 3.2: Duplicate webhook event rejected by database PRIMARY KEY');

    // -----------------------------------------------------------------
    // TEST 4: ACID Transaction & Rollback on Booking Failure
    // -----------------------------------------------------------------
    const rollbackTestId = `BK-ROLLBACK-${uuidv4().substring(0, 6)}`;
    let txThrew = false;

    try {
      await withTransaction(async (conn) => {
        await queryConn(
          conn,
          `INSERT INTO bookings (
            id, customer_id, customer_name, customer_phone, branch_id, service_id,
            booking_type, status, starts_at, booking_date, queue_number, secure_token
          ) VALUES (?, 'usr-test', 'Rollback Test', '01011111111', 'branch-elhdad', 'srv-haircut',
            'normal', 'awaiting_payment', NOW(), CURDATE(), 999, ?)`,
          [rollbackTestId, `TOK-${rollbackTestId}`]
        );

        // Force intentional error inside transaction to verify ROLLBACK
        throw new Error('Simulated transactional failure');
      });
    } catch (err: any) {
      if (err.message === 'Simulated transactional failure') {
        txThrew = true;
      }
    }

    const checkRolledBack = await query<any[]>('SELECT id FROM bookings WHERE id = ?', [rollbackTestId]);
    assert(txThrew === true, 'Test 4.1: withTransaction propagates error on failure');
    assert(checkRolledBack.length === 0, 'Test 4.2: Transaction completely rolled back inserted rows on failure');

    // -----------------------------------------------------------------
    // TEST 5: Concurrent Bookings Queue Number Uniqueness
    // -----------------------------------------------------------------
    const dateStr = new Date().toISOString().split('T')[0];
    const customerPromises = Array.from({ length: 5 }).map((_, idx) =>
      createBooking({
        branchId: 'branch-elhdad',
        customerName: `عميل متزامن ${idx + 1}`,
        customerPhone: `0102000000${idx}`,
        startsAt: `${dateStr}T14:00:00.000Z`,
        serviceId: 'srv-haircut',
        bookingType: 'normal',
      })
    );

    const createdList = await Promise.all(customerPromises);
    const queueNums = createdList.map((b) => b.queue_number);
    const uniqueQueueNums = new Set(queueNums);

    assert(
      queueNums.length === uniqueQueueNums.size,
      `Test 5.1: 5 concurrent bookings received 5 unique queue numbers (${queueNums.join(', ')})`
    );

    // Verify all bookings exist in MySQL
    let allPersisted = true;
    for (const b of createdList) {
      const persisted = await getBookingById(b.id);
      if (!persisted) allPersisted = false;
    }
    assert(allPersisted === true, 'Test 5.2: All concurrent bookings persisted in MySQL database');

    // -----------------------------------------------------------------
    // TEST 6: Payment Proof Duplication Prevention
    // -----------------------------------------------------------------
    const targetBooking = createdList[0];
    let firstProofInserted = false;
    let duplicateProofRejected = false;

    const proofId1 = uuidv4();
    const proofId2 = uuidv4();

    try {
      await query(
        `INSERT INTO payment_proofs (id, booking_id, image_path, payment_method, sender_phone, transferred_amount, status)
         VALUES (?, ?, 'uploads/test.jpg', 'instapay', '01000000000', 50, 'pending_review')`,
        [proofId1, targetBooking.id]
      );
      firstProofInserted = true;
    } catch {}

    try {
      await query(
        `INSERT INTO payment_proofs (id, booking_id, image_path, payment_method, sender_phone, transferred_amount, status)
         VALUES (?, ?, 'uploads/test2.jpg', 'instapay', '01000000000', 50, 'pending_review')`,
        [proofId2, targetBooking.id]
      );
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
        duplicateProofRejected = true;
      }
    }

    assert(firstProofInserted === true, 'Test 6.1: Initial payment proof attached to booking');
    assert(duplicateProofRejected === true, 'Test 6.2: Duplicate payment proof on same booking rejected by UNIQUE constraint');

    // Clean up test bookings
    for (const b of createdList) {
      await query('DELETE FROM payment_proofs WHERE booking_id = ?', [b.id]).catch(() => {});
      await query('DELETE FROM bookings WHERE id = ?', [b.id]).catch(() => {});
    }
    await query('DELETE FROM webhook_events WHERE id = ?', [testEventId]).catch(() => {});

  } catch (globalErr: any) {
    console.error('Test execution error:', globalErr);
  }

  console.log('\n====================================================');
  console.log(`📊 FINAL TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
