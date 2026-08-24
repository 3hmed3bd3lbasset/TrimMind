import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// ============================================================================
// HMAC-SHA256 Webhook Signature Verification & Anti-Replay Defense Engine
// ============================================================================

const PROCESSED_NONCES = new Map<string, number>();
const REPLAY_TOLERANCE_MS = 5 * 60 * 1000; // 5 Minutes Timestamp Window
const DEFAULT_WEBHOOK_SECRET = process.env.WEBHOOK_SIGNATURE_SECRET || 'trimmind_secure_webhook_secret_key_2026';

// Clean up stale nonces every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of PROCESSED_NONCES.entries()) {
    if (now - timestamp > REPLAY_TOLERANCE_MS * 2) {
      PROCESSED_NONCES.delete(nonce);
    }
  }
}, 10 * 60 * 1000);

export function verifyWebhookSignature(secret = DEFAULT_WEBHOOK_SECRET) {
  return (req: Request, res: Response, next: NextFunction) => {
    // In dev mode with explicit bypass flag, allow optional verification
    if (process.env.NODE_ENV !== 'production' && req.headers['x-dev-bypass'] === 'true') {
      return next();
    }

    const rawSignature = (
      req.headers['x-hub-signature-256'] ||
      req.headers['x-signature-256'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['x-signature']
    ) as string;

    const rawTimestamp = (req.headers['x-webhook-timestamp'] || req.headers['x-timestamp']) as string;
    const nonce = (req.headers['x-webhook-nonce'] || req.headers['x-request-id'] || req.body?.eventId) as string;

    // If no signature header is provided in production -> Reject
    if (!rawSignature) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح: توقيع الـ Webhook مفقود (Missing X-Signature-256)',
      });
    }

    // 1. Anti-Replay Attack: Verify Timestamp Tolerance (5 min window)
    if (rawTimestamp) {
      const parsedTime = Number(rawTimestamp);
      if (!isNaN(parsedTime) && Math.abs(Date.now() - parsedTime) > REPLAY_TOLERANCE_MS) {
        return res.status(401).json({
          success: false,
          error: 'تم رفض الطلب: فارق التوقيت تجاوز الحد المسموح (Replay Attack Detected)',
        });
      }
    }

    // 2. Anti-Replay Attack: Nonce / Event ID Single-Execution Check
    if (nonce) {
      if (PROCESSED_NONCES.has(nonce)) {
        return res.status(409).json({
          success: false,
          error: 'تم رفض الطلب: تم معالجة هذا الحدث مسبقاً (Duplicate Webhook Execution)',
        });
      }
      PROCESSED_NONCES.set(nonce, Date.now());
    }

    // 3. Compute Expected HMAC-SHA256 Signature
    try {
      const payloadString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      const dataToSign = rawTimestamp ? `${rawTimestamp}.${payloadString}` : payloadString;

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(dataToSign);
      const expectedDigest = hmac.digest('hex');

      const cleanSignature = rawSignature.replace(/^sha256=/, '').trim();

      // Timing-Safe Buffer Comparison against Side-Channel Timing Attacks
      const sigBuffer = Buffer.from(cleanSignature, 'hex');
      const expectedBuffer = Buffer.from(expectedDigest, 'hex');

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return res.status(401).json({
          success: false,
          error: 'توقيع الـ Webhook غير صحيح (Invalid HMAC-SHA256 Signature)',
        });
      }

      next();
    } catch (err: any) {
      return res.status(401).json({
        success: false,
        error: 'فشل التحقق من التوقيع الرقمي للـ Webhook',
      });
    }
  };
}
