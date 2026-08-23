import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  proto,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { query } from '../config/database.js';
import { createBooking } from './booking.service.js';
import { broadcastToBranch, broadcastGlobal } from '../socket/realtime.js';

const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  (process.platform === 'linux' ? '/app/server/uploads' : path.resolve(process.cwd(), 'server', 'uploads'));

const existingUploadsAuth = path.resolve(UPLOAD_DIR, 'whatsapp_auth');
const existingServerUploadsAuth = path.resolve(process.cwd(), 'server', 'uploads', 'whatsapp_auth');
const defaultAuthDir = fs.existsSync(existingUploadsAuth)
  ? existingUploadsAuth
  : (fs.existsSync(existingServerUploadsAuth)
      ? existingServerUploadsAuth
      : path.resolve(UPLOAD_DIR, 'whatsapp_auth'));

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || defaultAuthDir;
const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL || 'https://n8n-server-production-bdce.up.railway.app/webhook/whatsapp-webhook';

// Ensure auth dir exists
try {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
} catch (e) {}

interface WhatsAppState {
  status: 'disconnected' | 'connecting' | 'connected' | 'qr_ready';
  qrCodeDataUrl: string | null;
  qrCodeRaw: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
  lastConnectedAt: string | null;
}

const state: WhatsAppState = {
  status: 'disconnected',
  qrCodeDataUrl: null,
  qrCodeRaw: null,
  pairingCode: null,
  phoneNumber: '201005437633',
  lastConnectedAt: null,
};

let sock: any = null;
let isInitializing = false;
let isSocketOpen = false;

// Global in-memory debug log buffer for live diagnostics
const debugLogs: Array<{ time: string; type: string; data: any }> = [];

export function logDebug(type: string, data: any) {
  const entry = { time: new Date().toISOString(), type, data };
  debugLogs.unshift(entry);
  if (debugLogs.length > 80) debugLogs.pop();
  console.log(`[WA-DEBUG] [${type}]`, typeof data === 'object' ? JSON.stringify(data) : data);
}

export function getDebugLogs() {
  return debugLogs;
}

// Stateful Conversation & Booking Tracker per session
export interface UserBookingSession {
  step:
    | 'idle'
    | 'choosing_session_type'
    | 'choosing_date_time'
    | 'choosing_service'
    | 'choosing_barber'
    | 'awaiting_name_phone'
    | 'awaiting_payment_proof';
  bookingType?: 'normal' | 'vip';
  serviceName?: string;
  servicePrice?: number;
  serviceId?: string;
  barberName?: string;
  barberId?: string;
  chairName?: string;
  dateTimeStr?: string;
  targetDate?: string;
  targetTime?: string;
  customerName?: string;
  customerPhone?: string;
  depositAmount?: number;
  bookingId?: string;
  lastActiveAt?: number;
}

export const bookingSessions = new Map<string, UserBookingSession>();
const chatHistories = new Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>();

// Helper to get dynamic deposit settings from database
export async function getDepositSettings(): Promise<{ normal: number; vip: number }> {
  try {
    const [row] = await query<any[]>(
      'SELECT setting_value FROM settings WHERE setting_key = "booking_rules" OR setting_key = "general" LIMIT 1'
    );
    if (row && row.setting_value) {
      const parsed = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
      return {
        normal: Number(parsed.deposit_normal || parsed.normalDeposit || 30),
        vip: Number(parsed.deposit_vip || parsed.vipDeposit || 50),
      };
    }
  } catch {}
  return { normal: 30, vip: 50 };
}

function extractMessageContent(rawMsg: any) {
  if (!rawMsg) return { text: '', isImage: false };

  let inner = rawMsg;
  while (
    inner?.ephemeralMessage?.message ||
    inner?.viewOnceMessage?.message ||
    inner?.viewOnceMessageV2?.message ||
    inner?.documentWithCaptionMessage?.message
  ) {
    inner =
      inner?.ephemeralMessage?.message ||
      inner?.viewOnceMessage?.message ||
      inner?.viewOnceMessageV2?.message ||
      inner?.documentWithCaptionMessage?.message;
  }

  const text =
    inner?.conversation ||
    inner?.extendedTextMessage?.text ||
    inner?.imageMessage?.caption ||
    inner?.videoMessage?.caption ||
    inner?.documentMessage?.caption ||
    inner?.templateButtonReplyMessage?.selectedId ||
    inner?.buttonsResponseMessage?.selectedButtonId ||
    inner?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    '';

  const isImage = Boolean(inner?.imageMessage);

  return { text: (text || '').trim(), isImage };
}

export function getWhatsAppState(): WhatsAppState {
  const isTrulyConnected = Boolean(isSocketOpen && sock && sock.user && sock.user.id);
  return {
    ...state,
    status: isTrulyConnected
      ? 'connected'
      : state.qrCodeDataUrl || state.pairingCode
      ? 'qr_ready'
      : isInitializing
      ? 'connecting'
      : 'disconnected',
  };
}

export async function resetWhatsAppSession(): Promise<WhatsAppState> {
  logDebug('RESET_SESSION_CALLED', {});
  isSocketOpen = false;
  if (sock) {
    try {
      sock.ws?.close();
      sock.end(undefined);
    } catch {}
    sock = null;
  }
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  } catch {}
  state.status = 'disconnected';
  state.qrCodeDataUrl = null;
  state.qrCodeRaw = null;
  state.pairingCode = null;
  isInitializing = false;
  return initWhatsApp();
}

export async function getOrGenerateQRCode(forceReset = false): Promise<string> {
  if (sock && sock.user && sock.user.id && isSocketOpen) {
    state.status = 'connected';
    return '';
  }

  if (forceReset) {
    await resetWhatsAppSession();
  } else if (!sock || state.status === 'disconnected') {
    initWhatsApp();
  }

  for (let i = 0; i < 30; i++) {
    if (state.qrCodeDataUrl) {
      return state.qrCodeDataUrl;
    }
    if (sock && sock.user && sock.user.id && isSocketOpen) {
      state.status = 'connected';
      return '';
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  if (state.qrCodeDataUrl) return state.qrCodeDataUrl;
  throw new Error('جاري تجهيز رمز QR من واتساب، اضغط على تحديث بعد ثانية.');
}

export async function generatePairingCode(phoneNumber: string = '01005437633'): Promise<string> {
  let cleanPhone = phoneNumber.replace(/\D+/g, '');
  if (cleanPhone.startsWith('01')) {
    cleanPhone = '20' + cleanPhone.substring(1);
  }
  state.phoneNumber = cleanPhone;

  if (!sock || state.status === 'disconnected') {
    await initWhatsApp();
  }

  for (let i = 0; i < 25; i++) {
    if (sock && !sock.authState?.creds?.registered) {
      try {
        const code = await sock.requestPairingCode(cleanPhone);
        if (code) {
          state.pairingCode = code;
          state.status = 'qr_ready';
          logDebug('PAIRING_CODE_GENERATED', { cleanPhone, code });
          return code;
        }
      } catch (err: any) {
        // Socket connecting, retry in loop
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (state.pairingCode) return state.pairingCode;
  throw new Error('جاري تجهيز السيرفر، اضغط على زر التوليد مرة أخرى.');
}

export async function initWhatsApp(): Promise<WhatsAppState> {
  if (isInitializing) {
    return getWhatsAppState();
  }

  isInitializing = true;
  state.status = 'connecting';
  logDebug('INIT_WHATSAPP_START', { authDir: AUTH_DIR });

  if (sock) {
    try {
      sock.ws?.close();
      sock.end(undefined);
    } catch {}
    sock = null;
  }

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logDebug('BAILEYS_VERSION', { version: version.join('.'), isLatest });

    const logger = pino({ level: 'silent' });

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: authState,
      browser: ['TrimMind Salon', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      retryRequestDelayMs: 1000,
      markOnlineOnConnect: true,
      emitOwnEvents: true,
      shouldIgnoreJid: (jid: string) => Boolean(jid?.includes('broadcast')),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      logDebug('CONNECTION_UPDATE', {
        connection,
        statusCode: (lastDisconnect?.error as any)?.output?.statusCode,
        hasQr: Boolean(qr),
      });

      if (qr) {
        state.qrCodeRaw = qr;
        state.qrCodeDataUrl = await QRCode.toDataURL(qr);
        state.status = 'qr_ready';
      }

      if (connection === 'close') {
        isSocketOpen = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        state.status = 'disconnected';
        state.qrCodeDataUrl = null;
        state.pairingCode = null;
        isInitializing = false;

        if (shouldReconnect) {
          setTimeout(() => initWhatsApp(), 4000);
        }
      } else if (connection === 'open') {
        isSocketOpen = true;
        state.status = 'connected';
        state.qrCodeDataUrl = null;
        state.pairingCode = null;
        state.lastConnectedAt = new Date().toISOString();
        isInitializing = false;
        logDebug('CONNECTION_OPEN_SUCCESS', { user: sock?.user });
      }
    });

    // Handle Incoming Messages & Dispatch Live AI Replies
    sock.ev.on('messages.upsert', async (m: any) => {
      logDebug('MESSAGES_UPSERT_EVENT', { type: m.type, count: m.messages?.length });

      for (const msg of m.messages || []) {
        if (!msg || !msg.message) continue;

        const remoteJid = msg.key?.remoteJid || '';
        const msgId = msg.key?.id;
        const isFromMe = Boolean(msg.key?.fromMe);

        logDebug('RAW_MSG_RECEIVED', { remoteJid, msgId, isFromMe, msgType: Object.keys(msg.message) });

        // Ignore broadcast status updates
        if (remoteJid.includes('status@broadcast')) continue;

        // If sent from the same phone (self-chat testing), allow only 1-to-1 chats to bot number
        if (isFromMe && !remoteJid.includes('201005437633') && !remoteJid.includes('01005437633')) {
          logDebug('SKIPPED_EXTERNAL_FROM_ME', { remoteJid });
          continue;
        }

        const { text, isImage } = extractMessageContent(msg.message);
        logDebug('UNWRAPPED_CONTENT', { text, isImage, remoteJid });

        if (!text && !isImage) {
          logDebug('SKIPPED_NO_TEXT_OR_IMAGE', { msgKeys: Object.keys(msg.message) });
          continue;
        }

        let base64ImageUrl: string | null = null;
        if (isImage) {
          try {
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              {
                logger: pino({ level: 'silent' }),
                reuploadRequest: sock.updateMediaMessage,
              }
            );
            if (buffer) {
              base64ImageUrl = `data:image/jpeg;base64,${(buffer as Buffer).toString('base64')}`;
            }
          } catch (err: any) {
            logDebug('IMG_DOWNLOAD_ERROR', { error: err.message });
          }
        }

        // Resolve clean Egyptian phone number
        let senderPhone = '';
        const candidateJids = [
          (msg.key as any)?.remoteJidAlt,
          (msg.key as any)?.participant,
          (msg as any)?.participant,
          remoteJid,
        ].filter(Boolean);

        for (const cJid of candidateJids) {
          if (typeof cJid === 'string' && cJid.includes('@s.whatsapp.net')) {
            let clean = cJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
            if (clean.startsWith('20') && clean.length === 12) {
              clean = '0' + clean.substring(2);
            }
            if (clean.startsWith('01') && clean.length === 11) {
              senderPhone = clean;
              break;
            }
          }
        }

        if (!senderPhone && remoteJid.startsWith('20')) {
          let clean = remoteJid.replace(/[^0-9]/g, '');
          if (clean.startsWith('20') && clean.length === 12) {
            senderPhone = '0' + clean.substring(2);
          }
        }

        const pushName = msg.pushName || '';

        logDebug('PROCESSING_MSG_FOR_AI', { senderPhone, remoteJid, text, pushName });

        // 1. Forward asynchronously to n8n
        forwardToN8nWebhook(msg, base64ImageUrl, senderPhone, text);

        // 2. Direct Intelligent Interactive AI Reply Engine
        try {
          await handleIncomingWithAI(remoteJid, senderPhone, text, isImage, base64ImageUrl, pushName);
          logDebug('AI_REPLY_DISPATCHED_OK', { remoteJid, senderPhone, text });
        } catch (err: any) {
          logDebug('AI_REPLY_DISPATCH_FAIL', { error: err.message });
        }
      }
    });

    isInitializing = false;
    return getWhatsAppState();
  } catch (err: any) {
    isInitializing = false;
    state.status = 'disconnected';
    logDebug('INIT_WHATSAPP_ERROR', { error: err.message });
    return getWhatsAppState();
  }
}

// Send Text Message via WhatsApp
export async function sendWhatsAppText(to: string, text: string): Promise<boolean> {
  for (let i = 0; i < 16; i++) {
    if (sock && (state.status === 'connected' || isSocketOpen)) {
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!sock) {
    logDebug('SEND_TEXT_FAILED_NO_SOCK', { to, text });
    return false;
  }

  let jid = to;
  if (!jid.includes('@')) {
    let clean = to.replace(/\D+/g, '');
    if (clean.startsWith('01')) clean = '20' + clean.substring(1);
    jid = `${clean}@s.whatsapp.net`;
  }

  logDebug('SENDING_WHATSAPP_TEXT', { to, jid, textSnippet: text.substring(0, 50) });
  try {
    await sock.sendMessage(jid, { text });
    logDebug('SENT_WHATSAPP_TEXT_SUCCESS', { jid });
    return true;
  } catch (err: any) {
    logDebug('SEND_PRIMARY_FAILED', { jid, error: err.message });
    if (to !== jid) {
      try {
        await sock.sendMessage(to, { text });
        logDebug('SENT_WHATSAPP_FALLBACK_SUCCESS', { to });
        return true;
      } catch (err2: any) {
        logDebug('SEND_FALLBACK_FAILED', { to, error: err2.message });
      }
    }
    return false;
  }
}

// Helper to forward incoming message to n8n Webhook
function forwardToN8nWebhook(
  msg: proto.IWebMessageInfo,
  imageUrl?: string | null,
  senderPhone?: string | null,
  text?: string
) {
  try {
    const remoteJid = msg.key?.remoteJid || '';
    const payload = JSON.stringify({
      event: 'messages.upsert',
      instance: 'trimmind_salon',
      senderPhone: senderPhone || null,
      phone: senderPhone || remoteJid.replace('@s.whatsapp.net', '').replace('@lid', ''),
      remoteJid: remoteJid,
      text: text || '',
      chatInput: text || '',
      imageUrl: imageUrl || null,
      data: {
        ...msg,
        senderPhone: senderPhone || null,
        phone: senderPhone || remoteJid.replace('@s.whatsapp.net', '').replace('@lid', ''),
        remoteJid: remoteJid,
        imageUrl: imageUrl || null,
        text: text || '',
      },
    });

    const url = new URL(N8N_WEBHOOK_URL);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let respData = '';
        res.on('data', (c) => (respData += c));
        res.on('end', () => {
          logDebug('N8N_WEBHOOK_STATUS', { statusCode: res.statusCode });
        });
      }
    );

    req.on('error', (e) => {
      logDebug('N8N_FORWARD_ERROR', { error: e.message });
    });

    req.write(payload);
    req.end();
  } catch (e: any) {
    logDebug('N8N_PAYLOAD_ERROR', { error: e.message });
  }
}

// Dynamic helpers for Random Barber and Hour for Normal Session
const BARBERS = [
  { id: 'barber-mohamed', name: 'كابتن محمد' },
  { id: 'barber-ahmed', name: 'كابتن أحمد' },
  { id: 'barber-omar', name: 'كابتن عمر' },
];

const CHAIRS = [
  { id: 'chair-1', name: 'كرسي رقم 1 (VIP)' },
  { id: 'chair-2', name: 'كرسي رقم 2' },
  { id: 'chair-3', name: 'كرسي رقم 3' },
];

function getRandomBarber() {
  return BARBERS[Math.floor(Math.random() * BARBERS.length)];
}

function getRandomHour() {
  const hours = ['1:00 ظهراً', '2:30 عصراً', '4:00 عصراً', '5:30 مساءً', '7:00 مساءً', '8:30 مساءً', '10:00 مساءً'];
  return hours[Math.floor(Math.random() * hours.length)];
}

// Direct Native Intelligent Interactive AI Agent Response Engine
async function handleIncomingWithAI(
  remoteJid: string,
  senderPhone: string,
  userMessage: string,
  isImage: boolean,
  base64ImageUrl: string | null = null,
  pushName: string = ''
) {
  if (!userMessage.trim() && !isImage) return;

  const sessionKey = senderPhone || remoteJid;
  const history = chatHistories.get(sessionKey) || [];
  let session = bookingSessions.get(sessionKey) || { step: 'idle', lastActiveAt: Date.now() };

  // Refresh dynamic deposits from DB
  const deposits = await getDepositSettings();

  const textLower = userMessage.toLowerCase().trim();

  let replyText = '';

  // -------------------------------------------------------------------------
  // 1. ARRIVAL CONFIRMATION TRIGGER ("أنا وصلت" / "وصلت" / "1" / "في الصالون")
  // -------------------------------------------------------------------------
  if (
    textLower === '1' ||
    textLower.includes('وصلت') ||
    textLower.includes('انا وصلت') ||
    textLower.includes('أنا وصلت') ||
    textLower.includes('في الصالون') ||
    textLower.includes('جيت الصالون')
  ) {
    try {
      const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
      const todayStr = `${nowCairo.getFullYear()}-${String(nowCairo.getMonth() + 1).padStart(2, '0')}-${String(nowCairo.getDate()).padStart(2, '0')}`;

      // Search for customer's booking today
      const [b] = await query<any[]>(
        `SELECT id, customer_name, barber_name, chair_id, status FROM bookings 
         WHERE (customer_phone = ? OR customer_phone = ?) 
         AND (booking_date = ? OR starts_at LIKE ?)
         AND status != 'completed' AND status != 'cancelled'
         ORDER BY created_at DESC LIMIT 1`,
        [senderPhone, senderPhone.replace(/^0/, '20'), todayStr, `${todayStr}%`]
      );

      if (b) {
        await query('UPDATE bookings SET status = "customer_arrived", updated_at = NOW() WHERE id = ?', [b.id]);
        broadcastToBranch('branch-elhdad', 'SYNC_STATE', { bookingId: b.id, status: 'customer_arrived' });
        broadcastGlobal('SYNC_STATE', { bookingId: b.id, status: 'customer_arrived' });

        replyText = `يا هلا بأستاذنا الفاضل *${b.customer_name || pushName || 'يا باشا'}*! نورت صالون الحداد VIP 🌟👑\n\n✅ تم تسجيل حضورك في السيستم بنجاح وحالتك الآن (عميل وصل بالصالون).\nاتفضل استريح في صالة الاستقبال والكابتن هيجهز الكرسي لحضرتك فوراً! 💈✨`;
      } else {
        replyText = `يا هلا يا باشا نورتنا! 🌟 تم تسجيل حضورك في الصالون، اتفضل ارتاح في الاستقبال وموظف الاستقبال هيخدمك فوراً 👑💈`;
      }
    } catch (e: any) {
      replyText = `يا هلا يا باشا نورت صالون الحداد VIP! 🌟 تم تسجيل حضورك، اتفضل ارتاح في الاستقبال فوراً 👑`;
    }

    let targetJid = remoteJid;
    if (senderPhone && !remoteJid.includes('@s.whatsapp.net')) {
      let clean = senderPhone.replace(/\D+/g, '');
      if (clean.startsWith('01')) clean = '20' + clean.substring(1);
      targetJid = `${clean}@s.whatsapp.net`;
    }
    await sendWhatsAppText(targetJid, replyText);
    return;
  }

  // -------------------------------------------------------------------------
  // 2. PAYMENT PROOF IMAGE SUBMISSION (Customer sends screenshot)
  // -------------------------------------------------------------------------
  if (isImage) {
    const custName = session.customerName || pushName || 'عميلنا المميز';
    const bType = session.bookingType || 'normal';
    const sName = session.serviceName || 'باقة VIP كاملة';
    const sPrice = session.servicePrice || (bType === 'vip' ? 300 : 150);
    const bName = session.barberName || (bType === 'vip' ? 'كابتن محمد' : getRandomBarber().name);
    const depVal = session.depositAmount || (bType === 'vip' ? deposits.vip : deposits.normal);

    try {
      // Create real DB booking attached with payment proof
      const created = await createBooking({
        customerName: custName,
        customerPhone: senderPhone || '01005437633',
        serviceId: session.serviceId || 'srv-haircut',
        serviceName: sName,
        servicePrice: sPrice,
        totalAmount: sPrice,
        bookingFeeAtBooking: depVal,
        barberName: bName,
        bookingType: bType,
        paymentProof: {
          image_url: base64ImageUrl || '',
          transferred_amount: depVal,
          submitted_at: new Date().toISOString(),
          status: 'pending_review',
        },
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });

      session.bookingId = created.id;
      session.step = 'idle';
      bookingSessions.set(sessionKey, session);

      replyText = `📸 *تم استلام صورة إثبات الدفع وتسجيل حجزك بنجاح!* 💈👑

يا أستاذ *${custName}*، تم إدراج حجزك وإيصالك في السيستم ووصل الآن لموظف الاستقبال! 🌟

🧾 *بيانات الفاتورة والحجز:*
• *رقم الحجز (Reference):* \`#${created.id}\`
• *نوع الجلسة:* ${bType === 'vip' ? 'جلسة VIP ملكية 👑' : 'جلسة عادية 💈'}
• *الكابتن:* ${bName} ✂️
• *الخدمة:* ${sName}
• *الميعاد:* ${session.dateTimeStr || 'اليوم'}
• *العربون المسدد بالإيصال:* *${depVal} جنيه*
• *المتبقي عند الحضور:* *${Math.max(0, sPrice - depVal)} جنيه*

⏱️ *موظف الاستقبال يقوم الآن بمراجعة الإيصال واعتماد الحجز فوراً، وسيصلك إشعار القبول الرسمي خلال دقائق!*

📍 *رابط متابعة دورك المباشر في الطابور:*
https://trimmind.up.railway.app/track?q=${created.id}

تنورنا يا غالي! ✨`;
    } catch (err: any) {
      logDebug('CREATE_BOOKING_WITH_IMAGE_ERROR', { error: err.message });
      replyText = `📸 تم استلام صورة الإيصال بنجاح يا أستاذ *${custName}*! جارٍ مراجعتها واعتماد حجزك فوراً من موظف الاستقبال 👑✨`;
    }

    let targetJid = remoteJid;
    if (senderPhone && !remoteJid.includes('@s.whatsapp.net')) {
      let clean = senderPhone.replace(/\D+/g, '');
      if (clean.startsWith('01')) clean = '20' + clean.substring(1);
      targetJid = `${clean}@s.whatsapp.net`;
    }
    await sendWhatsAppText(targetJid, replyText);
    return;
  }

  // -------------------------------------------------------------------------
  // 3. EXPLAIN DIFFERENCE BETWEEN NORMAL & VIP
  // -------------------------------------------------------------------------
  if (
    textLower.includes('ايه الفرق') ||
    textLower.includes('إيه الفرق') ||
    textLower.includes('الفرق بين') ||
    textLower.includes('فرق ايه')
  ) {
    replyText = `يا هلا يا باشا! الفرق الأساسي بين الجلستين في صالون الحداد VIP 👑💈:

1️⃣ **الجلسة العادية (Normal):**
• بتختار اليوم اللي تحب تحضر فيه (النهارده أو أي يوم).
• النظام بيعين لك كابتن متاح وميعاد تقريبي ودور في الطابور.
• العربون المطلوب: *${deposits.normal} جنيه فقط*.
• *(غير متاح فيها تحديد الساعة بالدقيقة مسبقاً)*.

2️⃣ **الجلسة الـ VIP الملكية (VIP):**
• حرية واختيار كامل للكابتن المفضل لحضرتك (كابتن أحمد، محمد، أو عمر).
• اختيار ميعاد الحلاقة بالتحديد (الساعة والدقيقة اللي تريحك بالظبط).
• كرسي VIP خاص وأولوية قصوى للدخول في ميعادك بدون انتظار.
• العربون المطلوب: *${deposits.vip} جنيه*.

تحب تثبت حجزك في الجلسة **العادية** ولا **VIP**؟ ✨`;
  }

  // -------------------------------------------------------------------------
  // 4. ATTEMPTING TO SPECIFY A FIXED HOUR IN A NORMAL SESSION
  // -------------------------------------------------------------------------
  else if (
    session.bookingType === 'normal' &&
    (textLower.includes('الساعة') || textLower.includes('الساعه') || /\b\d{1,2}(:\d{2})?\s*(ص|م|مساء|صباحا|عصر)/.test(textLower))
  ) {
    replyText = `يا هلا يا فندم! 👑
ميزة **اختيار وتحديد الميعاد بالساعة والدقيقة** دي ميزة مخصصة حصرياً لـ **الجلسة الـ VIP** فقط، أما الجلسة العادية فالنظام بيعين لها ميعاد ودور تقريبي في اليوم.

💎 *تحب نطوّر ونرقّي جلستك لجلسة VIP (عربون ${deposits.vip} ج) عشان تختار الساعة والكابتن اللي يريحك بالظبط وتدخل في ميعادك؟*
أو نكمل في الجلسة العادية (عربون ${deposits.normal} ج) ونعين لك وقت ودور متاح؟`;
  }

  // -------------------------------------------------------------------------
  // 5. SESSION TYPE SELECTION (VIP vs Normal)
  // -------------------------------------------------------------------------
  else if (textLower.includes('vip') || textLower.includes('في اي بي') || textLower.includes('ملكية') || textLower.includes('ملكيه') || textLower.includes('رقيني') || textLower.includes('طور')) {
    session.bookingType = 'vip';
    session.depositAmount = deposits.vip;
    session.step = 'choosing_service';
    bookingSessions.set(sessionKey, session);

    replyText = `أحلى وأفخم اختيار يا باشا! 👑 تم اختيار **الجلسة الـ VIP الملكية** (عربون ${deposits.vip} ج).

✂️ تحب تحجز مع مين من كباتن الصالون؟
• *كابتن محمد* ✂️
• *كابتن أحمد* ✂️
• *كابتن عمر* ✂️

وقولي يناسبك يوم إيه والساعة كام بالظبط؟ ✨`;
  } else if (textLower.includes('عادية') || textLower.includes('عاديه') || textLower.includes('العادي') || textLower.includes('جلسة عادية')) {
    session.bookingType = 'normal';
    session.depositAmount = deposits.normal;
    session.barberName = getRandomBarber().name;
    session.dateTimeStr = `اليوم - ${getRandomHour()}`;
    session.step = 'choosing_service';
    bookingSessions.set(sessionKey, session);

    replyText = `تمام يا باشا! تم اختيار **الجلسة العادية** 💈 (عربون ${deposits.normal} ج).
النظام خصص لك ميعاد مع *${session.barberName}* (${session.dateTimeStr}).

📋 قولي تحب نعملك أنهي خدمة النهارده؟
• *حلاقة شعر VIP ملكي:* 150 جنيه
• *تحديد وحلاقة ذقن بالبخار:* 80 جنيه
• *باقة VIP كاملة (شعر + ذقن + حمام كريم + ماسك):* 300 جنيه
• *تنظيف بشرة عميق / صبغة:* 120 جنيه`;
  }

  // -------------------------------------------------------------------------
  // 6. SERVICE SELECTION
  // -------------------------------------------------------------------------
  else if (textLower.includes('300') || textLower.includes('كاملة') || textLower.includes('كامله') || textLower.includes('باقة')) {
    session.serviceName = 'باقة VIP كاملة (شعر + ذقن + حمام كريم + ماسك)';
    session.servicePrice = 300;
    session.serviceId = 'srv-vip-full';
    session.step = 'awaiting_name_phone';
    bookingSessions.set(sessionKey, session);

    replyText = `اختيار رائع يا باشا! باقة الـ VIP الكاملة (300 جنيه) هتظبطك وتطلع عريس 👑💈.

عشان نسجل الحجز ونصدر الفاتورة فوراً:
1️⃣ *أتشرف باسم حضرتك الكريم؟*
2️⃣ *وهل تحب نسجل الحجز على رقم الواتساب ده (*${senderPhone || 'نفس الرقم'}*) ولا برقم تاني؟*`;
  } else if (textLower.includes('150') || textLower.includes('شعر')) {
    session.serviceName = 'حلاقة شعر VIP ملكي';
    session.servicePrice = 150;
    session.serviceId = 'srv-haircut';
    session.step = 'awaiting_name_phone';
    bookingSessions.set(sessionKey, session);

    replyText = `تمام جداً يا غالي! حلاقة شعر VIP ملكي (150 جنيه) ✂️👑.

عشان نسجل الحجز ونصدر الفاتورة فوراً:
1️⃣ *أتشرف باسم حضرتك الكريم؟*
2️⃣ *وهل تحب نسجل الحجز على رقم الواتساب ده (*${senderPhone || 'نفس الرقم'}*) ولا برقم تاني؟*`;
  } else if (textLower.includes('80') || textLower.includes('ذقن') || textLower.includes('دقن')) {
    session.serviceName = 'تحديد وحلاقة ذقن بالبخار';
    session.servicePrice = 80;
    session.serviceId = 'srv-beard';
    session.step = 'awaiting_name_phone';
    bookingSessions.set(sessionKey, session);

    replyText = `تمام يا باشا! تحديد وحلاقة ذقن بالبخار (80 جنيه) ✂️.

عشان نسجل الحجز ونصدر الفاتورة فوراً:
1️⃣ *أتشرف باسم حضرتك الكريم؟*
2️⃣ *وهل تحب نسجل الحجز على رقم الواتساب ده (*${senderPhone || 'نفس الرقم'}*) ولا برقم تاني؟*`;
  }

  // -------------------------------------------------------------------------
  // 7. NAME & PHONE CONFIRMATION -> ISSUE DEPOSIT INVOICE & PROMPT PROOF
  // -------------------------------------------------------------------------
  else if (session.step === 'awaiting_name_phone' || (session.serviceName && !session.customerName && (textLower.includes('نفس الرقم') || textLower.includes('رقم الواتس') || textLower.length >= 3))) {
    let candidateName = userMessage.replace(/(على نفس الرقم|رقم الواتس|الواتساب|احجزلي|سجل|أيوة|ايوة|تمام|يا ريت|نفس الرقم)/gi, '').trim();
    if (!candidateName && pushName) candidateName = pushName;
    if (!candidateName) candidateName = 'عميل صالون VIP';

    session.customerName = candidateName;
    session.customerPhone = senderPhone || '01005437633';
    session.depositAmount = session.bookingType === 'vip' ? deposits.vip : deposits.normal;
    session.step = 'awaiting_payment_proof';
    bookingSessions.set(sessionKey, session);

    replyText = `يا هلا بأستاذنا الفاضل *${session.customerName}*! 🌟👑
تم تثبيت بياناتك ورقم هاتفك (*${session.customerPhone}*) بنجاح.

🧾 *فاتورة الحجز والعربون المطلوب:*
• *نوع الجلسة:* ${session.bookingType === 'vip' ? 'جلسة VIP ملكية 👑' : 'جلسة عادية 💈'}
• *الكابتن:* ${session.barberName || 'كابتن محمد'} ✂️
• *الخدمة:* ${session.serviceName || 'خدمة VIP'}
• *إجمالي الخدمة:* ${session.servicePrice || 150} جنيه
• *العربون المطلوب لتأكيد الحجز:* *${session.depositAmount} جنيه*

⚠️ *تنبيه مهم:* رسوم الحجز (العربون) غير قابلة للاسترداد لأي سبب لضمان حجز وتجهيز الكرسي والموعد لحضرتك.

💳 *طرق تحويل وتأكيد العربون:*
• *InstaPay:* \`01005437633\`
• *Vodafone Cash:* \`01005437633\`

📸 **يرجى تحويل العربون وإرسال صورة إيصال التحويل (اسكرين شوت) هنا على الواتساب فوراً** ليرسل النظام الحجز لموظف الاستقبال لاعتماده نهائياً! ✨`;
  }

  // -------------------------------------------------------------------------
  // 8. GENERAL INTENT TO BOOK (Start booking flow if idle)
  // -------------------------------------------------------------------------
  else if (textLower.includes('احجز') || textLower.includes('حجز') || textLower.includes('احلق') || textLower.includes('ميعاد') || textLower.includes('دور')) {
    session.step = 'choosing_session_type';
    bookingSessions.set(sessionKey, session);

    replyText = `يا هلا يا باشا منورنا في صالون الحداد VIP! 💈👑
يسعدنا جداً خدمتك! تحب تختار نوع الجلسة:

1️⃣ **جلسة عادية (Normal):** اختيار اليوم، والنظام يحدد لك دور وساعة ومقعد متاح تلقائياً (العربون *${deposits.normal} ج*).
2️⃣ **جلسة VIP ملكية (VIP):** اختيار الكابتن المفضل والميعاد بالتحديد بالساعة والدقيقة + كرسي VIP مخصص وأولوية دخول فورية (العربون *${deposits.vip} ج*).

*(لو حابب تعرف الفرق بينهم قولي "إيه الفرق ما بينهم")* ✨`;
  }

  // -------------------------------------------------------------------------
  // 9. FALLBACK TO GEMINI FLASH AI
  // -------------------------------------------------------------------------
  if (!replyText) {
    const systemInstruction = `أنت المساعد الذكي الرسمي لصالون (TrimMind - صالون الحداد VIP).
أسلوبك: مصري راقي، محترم، ذكي، سريع ومفيد ("يا هلا يا فندم", "منورنا يا باشا", "تحت أمرك يا غالي").

# معلومات صالون TrimMind:
- الفرع: فرع الحداد VIP (متاح يومياً من 10:00 صباحاً حتى 12:00 منتصف الليل).
- الكباتن الحلاقين: كابتن أحمد، كابتن محمد، كابتن عمر.
- أهم الخدمات والأسعار:
  • باقة VIP كاملة: 300 جنيه
  • حلاقة شعر VIP: 150 جنيه
  • تحديد وحلاقة ذقن بالبخار: 80 جنيه
  • تنظيف بشرة / صبغة: 120 جنيه
- أنواع الجلسات:
  1. الجلسة العادية: اختيار اليوم فقط، والنظام يحدد كابتن وساعة ودور متاح (عربون ${deposits.normal} جنيه).
  2. الجلسة VIP: اختيار الكابتن والساعة والدقيقة بالتحديد وكرسي VIP بدون انتظار (عربون ${deposits.vip} جنيه).
- ميزة تحديد الساعة متاحة فقط في الـ VIP (إذا طلب العميل في العادية ساعة، اعرض عليه الترقية لـ VIP).
- العربون غير قابل للاسترداد.
- رقم واتساب العميل الحالي: ${senderPhone || 'رقم الواتساب الحالي'}.
- بيانات التحويل (إنستاباي / فودافون كاش): 01005437633.
- عند استلام صورة الإيصال يتم الحجز مباشرة في السيستم.
- رابط التتبع: https://trimmind.up.railway.app/track.

رد دائماً باللهجة المصرية الودودة واشرح بلباقة.`;

    history.push({ role: 'user', parts: [{ text: userMessage }] });
    if (history.length > 10) history.splice(0, history.length - 10);

    const candidateModels = ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];

    for (const model of candidateModels) {
      if (replyText) break;
      try {
        const apiKey = process.env.GEMINI_API_KEY_CUSTOMER || process.env.GEMINI_API_KEY || '';
        if (!apiKey) break;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
          contents: history,
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      } catch (e: any) {
        logDebug('GEMINI_CALL_ERROR', { model, error: e.message });
      }
    }
  }

  if (!replyText) {
    replyText = `أهلاً بك في صالون TrimMind (الحداد VIP) 💈👑\nنورتنا يا غالي! نقدر نساعدك في حجز جلسة عادية أو جلسة VIP، ومعرفة قائمة الأسعار والخدمات.\nتحب نساعدك بإيه النهارده؟`;
  }

  history.push({ role: 'model', parts: [{ text: replyText }] });
  chatHistories.set(sessionKey, history);

  // Send WhatsApp Reply
  let targetJid = remoteJid;
  if (senderPhone && !remoteJid.includes('@s.whatsapp.net')) {
    let clean = senderPhone.replace(/\D+/g, '');
    if (clean.startsWith('01')) clean = '20' + clean.substring(1);
    targetJid = `${clean}@s.whatsapp.net`;
  }
  await sendWhatsAppText(targetJid, replyText);
}
