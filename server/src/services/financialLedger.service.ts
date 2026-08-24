import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

// ============================================================================
// Tamper-Evident Cryptographic Ledger (Blockchain-like Hash Chaining)
// ============================================================================

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const LEDGER_SECRET = process.env.LEDGER_INTEGRITY_SECRET || 'trimmind_tamper_evident_ledger_secret_2026';

export interface FinancialEntryInput {
  id?: string;
  booking_id?: string | null;
  branch_id: string;
  barber_id?: string | null;
  amount: number;
  type: 'deposit' | 'final_payment' | 'full_payment' | 'refund' | 'cafeteria' | 'product';
  payment_method?: 'cash' | 'vodafone_cash' | 'instapay' | 'credit_card';
  reference_number?: string | null;
  notes?: string | null;
  recorded_by?: string | null;
}

export interface LedgerIntegrityReport {
  isValid: boolean;
  totalRecords: number;
  brokenRecordId?: string;
  tamperedField?: string;
  message: string;
}

/**
 * Computes a deterministic HMAC-SHA256 hash for a financial row
 */
export function calculateRecordHash(
  id: string,
  branch_id: string,
  amount: number,
  type: string,
  payment_method: string,
  previous_hash: string
): string {
  const payload = `${id}:${branch_id}:${Number(amount).toFixed(2)}:${type}:${payment_method || 'cash'}:${previous_hash}`;
  return crypto.createHmac('sha256', LEDGER_SECRET).update(payload).digest('hex');
}

/**
 * Records a financial transaction with Tamper-Evident Hash Chaining
 */
export async function recordChainedFinancialEntry(entry: FinancialEntryInput): Promise<string> {
  const newId = entry.id || uuidv4();
  const branchId = entry.branch_id;

  // 1. Get the last record's hash for this branch (or global)
  const lastRows = await query<any[]>(
    `SELECT record_hash FROM financial_records 
     WHERE branch_id = ? AND record_hash IS NOT NULL 
     ORDER BY created_at DESC, id DESC LIMIT 1`,
    [branchId]
  );

  const previousHash = lastRows && lastRows.length > 0 && lastRows[0].record_hash
    ? lastRows[0].record_hash
    : GENESIS_HASH;

  // 2. Calculate cryptographic signature for this record
  const recordHash = calculateRecordHash(
    newId,
    branchId,
    entry.amount,
    entry.type,
    entry.payment_method || 'cash',
    previousHash
  );

  // 3. Insert atomically
  await query(
    `INSERT INTO financial_records 
     (id, booking_id, branch_id, barber_id, amount, type, payment_method, reference_number, notes, recorded_by, previous_hash, record_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      newId,
      entry.booking_id || null,
      branchId,
      entry.barber_id || null,
      entry.amount,
      entry.type,
      entry.payment_method || 'cash',
      entry.reference_number || null,
      entry.notes || null,
      entry.recorded_by || null,
      previousHash,
      recordHash,
    ]
  );

  return newId;
}

/**
 * Validates the entire cryptographic chain to detect any manual database tampering
 */
export async function verifyLedgerIntegrity(branchId?: string): Promise<LedgerIntegrityReport> {
  try {
    let sql = 'SELECT * FROM financial_records WHERE record_hash IS NOT NULL';
    const params: any[] = [];

    if (branchId) {
      sql += ' AND branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY created_at ASC, id ASC';

    const records = await query<any[]>(sql, params);

    if (!records || records.length === 0) {
      return { isValid: true, totalRecords: 0, message: 'لا توجد سجلات مالية بعد' };
    }

    let expectedPreviousHash = GENESIS_HASH;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];

      // Verify previous link
      if (row.previous_hash !== expectedPreviousHash && i > 0) {
        return {
          isValid: false,
          totalRecords: records.length,
          brokenRecordId: row.id,
          tamperedField: 'previous_hash',
          message: `🚨 تم اكتشاف انقطاع في السلسلة التشفيرية عند السجل رقم [${row.id}]! قد يكون تم حذف سجل يدوي.`,
        };
      }

      // Recompute hash
      const computedHash = calculateRecordHash(
        row.id,
        row.branch_id,
        row.amount,
        row.type,
        row.payment_method,
        row.previous_hash
      );

      if (computedHash !== row.record_hash) {
        return {
          isValid: false,
          totalRecords: records.length,
          brokenRecordId: row.id,
          tamperedField: 'amount_or_data',
          message: `🚨 تحذير أمني: تم اكتشاف تلاعب بالأرقام أو البيانات في السجل المالي [${row.id}]!`,
        };
      }

      expectedPreviousHash = row.record_hash;
    }

    return {
      isValid: true,
      totalRecords: records.length,
      message: `✅ تم التحقق من سلامة جميع السجلات المالية (${records.length} سجل) بنجاح وبدون أي تلاعب.`,
    };
  } catch (err: any) {
    return {
      isValid: false,
      totalRecords: 0,
      message: `فشل التحقق من السلسلة: ${err.message}`,
    };
  }
}
