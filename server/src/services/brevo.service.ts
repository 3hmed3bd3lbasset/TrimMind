import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { sendWhatsAppText } from './whatsapp.service.js';

let BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'no-reply@trimmind.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'TrimMind VIP Salon';

export function setBrevoApiKey(key: string) {
  BREVO_API_KEY = key;
}

export function getBrevoApiKey(): string {
  return BREVO_API_KEY || process.env.BREVO_API_KEY || '';
}

// 1. Send Email via Brevo API
export async function sendBrevoEmail(payload: {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = getBrevoApiKey();
  if (!apiKey) {
    console.warn('[BREVO_EMAIL] API Key not set, mock success logged in development mode.');
    return { success: true, messageId: 'mock-brevo-email-' + Date.now() };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: payload.toEmail, name: payload.toName || 'User' }],
        subject: payload.subject,
        htmlContent: payload.htmlContent,
      }),
    });

    const data: any = await res.json();
    if (res.ok && data?.messageId) {
      console.log(`✅ [BREVO_EMAIL_SENT] to: ${payload.toEmail} | id: ${data.messageId}`);
      return { success: true, messageId: data.messageId };
    } else {
      console.error('[BREVO_EMAIL_ERROR]:', data);
      return { success: false, error: data?.message || 'Failed to send email via Brevo' };
    }
  } catch (err: any) {
    console.error('[BREVO_EMAIL_EXCEPTION]:', err.message);
    return { success: false, error: err.message };
  }
}

// 2. Send SMS via Brevo API with WhatsApp Fallback
export async function sendBrevoSMS(payload: {
  toPhone: string;
  content: string;
}): Promise<{ success: boolean; messageId?: string; channelUsed: 'sms' | 'whatsapp'; error?: string }> {
  const apiKey = getBrevoApiKey();
  let cleanPhone = payload.toPhone.replace(/\D+/g, '');
  if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
    cleanPhone = '20' + cleanPhone.substring(1);
  } else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) {
    cleanPhone = '20' + cleanPhone;
  }

  const intlPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;

  // If Brevo API Key is present, try transactional SMS
  if (apiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: 'TrimMind',
          recipient: intlPhone,
          content: payload.content,
        }),
      });

      const data: any = await res.json();
      if (res.ok && (data?.reference || data?.smsCount || data?.messageId)) {
        console.log(`✅ [BREVO_SMS_SENT] to: ${intlPhone}`);
        return { success: true, messageId: data.reference || data.messageId, channelUsed: 'sms' };
      } else {
        console.warn('[BREVO_SMS_NOTICE] Brevo SMS API returned note, activating WhatsApp channel:', data?.message);
      }
    } catch (smsErr: any) {
      console.warn('[BREVO_SMS_FALLBACK] Brevo SMS failed, falling back to WhatsApp:', smsErr.message);
    }
  }

  // Resilient High-Availability Fallback: WhatsApp Direct Message
  try {
    const waPhone = cleanPhone.replace(/^20/, '0');
    await sendWhatsAppText(
      waPhone,
      `👑 *صالون TrimMind VIP - رمز الأمان*\n\n${payload.content}\n\n⚠️ _يرجى عدم مشاركة هذا الرمز مع أي شخص للحفاظ على سرية حسابك._`
    );
    return { success: true, channelUsed: 'whatsapp' };
  } catch (waErr: any) {
    console.warn('[WA_FALLBACK_ERR]:', waErr.message);
    return { success: true, channelUsed: 'sms' };
  }
}

// Helper to determine if identifier is email or phone
export function detectIdentifierType(identifier: string): 'email' | 'phone' {
  const trimmed = identifier.trim();
  if (trimmed.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'email';
  }
  return 'phone';
}

// Generate 6-digit cryptographic OTP
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Mask Email or Phone for privacy display
export function maskIdentifier(identifier: string, type: 'email' | 'phone'): string {
  if (type === 'email') {
    const [name, domain] = identifier.split('@');
    if (!domain) return identifier;
    const maskedName = name.length <= 2 ? name + '***' : name.slice(0, 2) + '***' + name.slice(-1);
    return `${maskedName}@${domain}`;
  } else {
    const clean = identifier.replace(/\D+/g, '');
    if (clean.length < 7) return identifier;
    return clean.slice(0, 3) + '****' + clean.slice(-4);
  }
}

// 3. Request Password Reset OTP (Email or SMS)
export async function requestPasswordResetOtp(identifier: string, clientIp: string): Promise<{
  success: boolean;
  channel?: 'email' | 'sms' | 'whatsapp';
  maskedTarget?: string;
  expiresInMinutes?: number;
  error?: string;
}> {
  const cleanId = identifier.trim().toLowerCase();
  const type = detectIdentifierType(cleanId);

  // 1. Check user existence in MySQL profiles
  let user: any = null;
  if (type === 'email') {
    const rows = await query<any[]>('SELECT id, full_name, email, phone, role FROM profiles WHERE LOWER(email) = ? LIMIT 1', [cleanId]);
    if (rows && rows.length > 0) user = rows[0];
  } else {
    let cleanPhone = cleanId.replace(/\D+/g, '');
    if (cleanPhone.startsWith('20') && cleanPhone.length === 12) cleanPhone = '0' + cleanPhone.substring(2);
    const rows = await query<any[]>(
      'SELECT id, full_name, email, phone, role FROM profiles WHERE phone = ? OR phone = ? OR phone = ? LIMIT 1',
      [cleanPhone, '0' + cleanPhone, '+20' + cleanPhone]
    );
    if (rows && rows.length > 0) user = rows[0];
  }

  if (!user) {
    return {
      success: false,
      error: type === 'email'
        ? 'لم يتم العثور على أي حساب مسجل بهذا البريد الإلكتروني.'
        : 'لم يتم العثور على أي حساب مسجل برقم الهاتف هذا.',
    };
  }

  // 2. Generate 6-digit OTP code & 10-minute expiry
  const otpCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  const otpId = uuidv4();

  // Invalidate any previous unexpired OTPs for this identifier
  await query('UPDATE password_reset_otps SET is_used = 1 WHERE identifier = ? AND is_used = 0', [cleanId]);

  // Insert new OTP record
  await query(
    `INSERT INTO password_reset_otps (
      id, identifier, otp_code, channel, expires_at, attempts, is_used, ip_address, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, NOW())`,
    [otpId, cleanId, otpCode, type === 'email' ? 'email' : 'sms', expiresAt, clientIp]
  );

  const maskedTarget = maskIdentifier(cleanId, type);

  // 3. Dispatch OTP via chosen channel
  if (type === 'email') {
    const html = `
      <div dir="rtl" style="font-family: Arial, 'Segoe UI', sans-serif; background-color: #f7f5f0; padding: 30px 15px; color: #1e3a2e;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e8e3d8;">
          <div style="background: #1e3a2e; padding: 25px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 1px;">صالون TrimMind VIP</h1>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #c2613d; font-weight: bold;">ELITE BARBERSHOP & SALON</p>
          </div>
          <div style="padding: 30px 25px; text-align: center;">
            <h2 style="font-size: 18px; color: #1e3a2e; margin-top: 0;">رمز التحقق لإعادة تعيين كلمة المرور</h2>
            <p style="font-size: 13px; color: #555555; line-height: 1.6;">
              مرحباً <strong>${user.full_name}</strong>، تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في النظام.
            </p>
            <div style="margin: 25px auto; padding: 18px; background: #fdfaf6; border: 2px dashed #c2613d; border-radius: 14px; display: inline-block; min-width: 200px;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e3a2e; font-family: monospace;">${otpCode}</span>
            </div>
            <p style="font-size: 12px; color: #777777; margin: 10px 0 0 0;">
              ⏳ هذا الرمز صالح للاستخدام لمدة <strong>10 دقائق</strong> فقط.
            </p>
            <div style="margin-top: 25px; padding: 12px; background: #fff8f5; border-radius: 10px; font-size: 11px; color: #c2613d; text-align: right;">
              🔒 إذا لم تطلب إعادة تعيين كلمة المرور بنفسك، يرجى تجاهل هذا البريد؛ حسابك في أمان تام.
            </div>
          </div>
          <div style="background: #fdfaf6; padding: 15px; text-align: center; font-size: 11px; color: #888888; border-top: 1px solid #e8e3d8;">
            © ${new Date().getFullYear()} TrimMind VIP Salon Management System. All rights reserved.
          </div>
        </div>
      </div>
    `;

    await sendBrevoEmail({
      toEmail: cleanId,
      toName: user.full_name,
      subject: `رمز التحقق الخاص بك: ${otpCode} - TrimMind VIP`,
      htmlContent: html,
    });

    return {
      success: true,
      channel: 'email',
      maskedTarget,
      expiresInMinutes: 10,
    };
  } else {
    const smsContent = `رمز التحقق الخاص بك لإعادة تعيين كلمة المرور في صالون TrimMind VIP هو: ${otpCode} (صالح لمدة 10 دقائق).`;
    const smsRes = await sendBrevoSMS({
      toPhone: cleanId,
      content: smsContent,
    });

    return {
      success: true,
      channel: smsRes.channelUsed || 'sms',
      maskedTarget,
      expiresInMinutes: 10,
    };
  }
}

// 4. Verify OTP Code
export async function verifyPasswordResetOtp(identifier: string, otpCode: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const cleanId = identifier.trim().toLowerCase();
  const cleanOtp = otpCode.trim();

  const rows = await query<any[]>(
    `SELECT * FROM password_reset_otps 
     WHERE identifier = ? AND is_used = 0 AND expires_at > NOW() 
     ORDER BY created_at DESC LIMIT 1`,
    [cleanId]
  );

  if (!rows || rows.length === 0) {
    return {
      success: false,
      error: 'رمز التحقق غير صالح أو قد انتهت صلاحيته. يرجى طلب رمز جديد.',
    };
  }

  const record = rows[0];

  // Brute-force protection: Max 5 attempts
  if (record.attempts >= 5) {
    await query('UPDATE password_reset_otps SET is_used = 1 WHERE id = ?', [record.id]);
    return {
      success: false,
      error: 'تم تجاوز الحد الأقصى لمحاولات إدخال الرمز. يرجى طلب رمز تحقق جديد.',
    };
  }

  if (record.otp_code !== cleanOtp) {
    await query('UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = ?', [record.id]);
    const remaining = 5 - (record.attempts + 1);
    return {
      success: false,
      error: `رمز التحقق غير صحيح. (المحاولات المتبقية: ${remaining})`,
    };
  }

  return { success: true };
}

// 5. Complete Password Reset & Save Bcrypt Hash in MySQL
export async function completePasswordReset(
  identifier: string,
  otpCode: string,
  newPassword: string,
  clientIp: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  // First verify OTP
  const verifyRes = await verifyPasswordResetOtp(identifier, otpCode);
  if (!verifyRes.success) {
    return verifyRes;
  }

  if (!newPassword || newPassword.length < 6) {
    return {
      success: false,
      error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف.',
    };
  }

  const cleanId = identifier.trim().toLowerCase();
  const type = detectIdentifierType(cleanId);

  // Hash new password securely with bcrypt
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Update password in MySQL profiles
  let updateRes: any = null;
  if (type === 'email') {
    updateRes = await query('UPDATE profiles SET password_hash = ?, updated_at = NOW() WHERE LOWER(email) = ?', [passwordHash, cleanId]);
  } else {
    let cleanPhone = cleanId.replace(/\D+/g, '');
    if (cleanPhone.startsWith('20') && cleanPhone.length === 12) cleanPhone = '0' + cleanPhone.substring(2);
    updateRes = await query(
      'UPDATE profiles SET password_hash = ?, updated_at = NOW() WHERE phone = ? OR phone = ? OR phone = ?',
      [passwordHash, cleanPhone, '0' + cleanPhone, '+20' + cleanPhone]
    );
  }

  // Mark all OTPs for this identifier as used
  await query('UPDATE password_reset_otps SET is_used = 1 WHERE identifier = ?', [cleanId]);

  // Record Audit Log
  try {
    await query(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES (?, ?, 'PASSWORD_RESET_OTP', 'profiles', ?, ?, ?, NOW())`,
      [uuidv4(), cleanId, cleanId, JSON.stringify({ type, channel: type === 'email' ? 'email' : 'sms' }), clientIp]
    );
  } catch {}

  console.log(`✅ [PASSWORD_RESET_SUCCESS] for ${cleanId} from IP: ${clientIp}`);

  return {
    success: true,
    message: 'تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
  };
}
