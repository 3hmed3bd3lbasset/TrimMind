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
    | 'awaiting_payment_proof'
    | 'proof_submitted';
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
  receiptSubmitted?: boolean;
  lastActiveAt?: number;
}

export const bookingSessions = new Map<string, UserBookingSession>();
const chatHistories = new Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>();

// Dynamic Live Salon Context queried directly from MySQL Database
export interface LiveSalonContext {
  services: Array<{ id: string; name: string; price: number; category?: string; duration?: number; is_vip_only?: boolean | number }>;
  barbers: Array<{ id: string; name: string; is_available?: boolean }>;
  chairs: Array<{ id: string; name: string; type?: string }>;
  deposits: { normal: number; vip: number };
  paymentAccounts: { instapay: string; vodafoneCash: string };
  salonName: string;
}

export async function getLiveSalonContext(): Promise<LiveSalonContext> {
  // 1. Live Services from MySQL database
  let services = await query<any[]>(
    'SELECT id, name, price, category, is_vip_only, duration_minutes as duration FROM services WHERE is_active = 1 OR is_active IS NULL ORDER BY price ASC'
  ).catch(() => []);

  if (!services || services.length === 0) {
    services = [
      { id: 'srv-haircut-classic', name: 'قص شعر كلاسيكي (Classic Haircut)', price: 180, duration_minutes: 30, category: 'hair', is_vip_only: 0 },
      { id: 'srv-vip-royal', name: 'VIP Royal Cut', price: 480, duration_minutes: 60, category: 'vip_package', is_vip_only: 1 },
      { id: 'srv-vip-gentleman', name: 'VIP Gentleman', price: 650, duration_minutes: 90, category: 'vip_package', is_vip_only: 1 },
      { id: 'srv-vip-full', name: 'VIP Full Experience', price: 750, duration_minutes: 120, category: 'vip_package', is_vip_only: 1 },
      { id: 'srv-vip-executive', name: 'VIP Executive', price: 900, duration_minutes: 130, category: 'vip_package', is_vip_only: 1 },
      { id: 'srv-haircut-beard', name: 'قص شعر + لحية', price: 220, duration_minutes: 40, category: 'hair', is_vip_only: 0 },
      { id: 'srv-beard-trim', name: 'تحديد لحية', price: 100, duration_minutes: 30, category: 'beard', is_vip_only: 0 },
      { id: 'srv-kids', name: 'قص شعر أطفال', price: 120, duration_minutes: 40, category: 'kids', is_vip_only: 0 },
      { id: 'srv-fade', name: 'تدرج Fade', price: 180, duration_minutes: 35, category: 'hair', is_vip_only: 0 },
      { id: 'srv-protein', name: 'بروتين وترطيب شعر', price: 300, duration_minutes: 60, category: 'treatment', is_vip_only: 0 },
      { id: 'srv-facial', name: 'تنظيف بشرة', price: 240, duration_minutes: 45, category: 'treatment', is_vip_only: 0 },
    ];
  }

  // 2. Live Barbers from MySQL database
  let barbers = await query<any[]>(
    'SELECT id, full_name as name, is_active FROM barbers WHERE is_active = 1 OR is_active IS NULL ORDER BY rating DESC'
  ).catch(() => []);

  if (!barbers || barbers.length === 0) {
    barbers = [
      { id: 'barber-mohamed', name: 'محمد الحداد' },
      { id: 'barber-karim', name: 'كريم السيد' },
      { id: 'barber-omar', name: 'عمر خالد' },
    ];
  }

  // 3. Live Chairs from MySQL database
  let chairs = await query<any[]>(
    'SELECT id, name, type FROM chairs WHERE is_active = 1 OR is_active IS NULL'
  ).catch(() => []);

  if (!chairs || chairs.length === 0) {
    chairs = [
      { id: 'chair-1', name: 'كرسي رقم 1 (VIP)' },
      { id: 'chair-2', name: 'كرسي رقم 2' },
      { id: 'chair-3', name: 'كرسي رقم 3' },
    ];
  }

  // 4. Live Settings from MySQL database
  let deposits = { normal: 50, vip: 100 };
  let paymentAccounts = { instapay: '01005437633', vodafoneCash: '01005437633' };
  let salonName = 'صالون TrimMind (الحداد VIP)';

  try {
    const rows = await query<any[]>('SELECT setting_key, setting_value FROM settings');
    if (rows && rows.length > 0) {
      for (const r of rows) {
        const val = typeof r.setting_value === 'string' ? JSON.parse(r.setting_value) : r.setting_value;
        if (r.setting_key === 'booking_rules' || r.setting_key === 'general' || r.setting_key === 'salon_settings') {
          const normVal = val.booking_fee_normal || val.deposit_normal || val.normalDeposit || val.bookingFeeNormal;
          const vipVal = val.booking_fee_vip || val.deposit_vip || val.vipDeposit || val.bookingFeeVip;
          if (normVal !== undefined && normVal !== null) deposits.normal = Number(normVal);
          if (vipVal !== undefined && vipVal !== null) deposits.vip = Number(vipVal);
          if (val.instapay_username || val.instapay || val.instapay_number) {
            paymentAccounts.instapay = val.instapay_username || val.instapay || val.instapay_number;
          }
          if (val.vodafone_cash_number || val.vodafone_cash || val.vodafoneCash) {
            paymentAccounts.vodafoneCash = val.vodafone_cash_number || val.vodafone_cash || val.vodafoneCash;
          }
          if (val.salon_name || val.salonName) salonName = val.salon_name || val.salonName;
        }
      }
    }
  } catch {}

  return { services, barbers, chairs, deposits, paymentAccounts, salonName };
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

function getSmartCairoTimeForNormalSession(): { dateTimeStr: string; timeStr: string; startsAtISO: string } {
  // Strict Africa/Cairo Timezone
  const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const currentHour = nowCairo.getHours();
  const currentMinute = nowCairo.getMinutes();

  // If after 10:30 PM (salon closing time is 12:00 AM), schedule for tomorrow afternoon
  if (currentHour >= 22 && currentMinute > 30) {
    const tomorrow = new Date(nowCairo.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toLocaleDateString('ar-EG', { weekday: 'long', month: 'long', day: 'numeric' });
    const randomTomorrowHours = [
      { label: '1:00 ظهراً', hour: 13, min: 0 },
      { label: '3:30 عصراً', hour: 15, min: 30 },
      { label: '5:00 مساءً', hour: 17, min: 0 },
      { label: '7:00 مساءً', hour: 19, min: 0 },
      { label: '9:00 مساءً', hour: 21, min: 0 },
    ];
    const chosen = randomTomorrowHours[Math.floor(Math.random() * randomTomorrowHours.length)];
    tomorrow.setHours(chosen.hour, chosen.min, 0, 0);
    return {
      dateTimeStr: `غداً (${tomorrowStr}) - الساعة ${chosen.label}`,
      timeStr: chosen.label,
      startsAtISO: tomorrow.toISOString(),
    };
  }

  // Salon operating slots for today
  const candidateSlotsToday = [
    { hour: 11, min: 0, label: '11:00 صباحاً' },
    { hour: 12, min: 30, label: '12:30 ظهراً' },
    { hour: 14, min: 0, label: '2:00 ظهراً' },
    { hour: 15, min: 30, label: '3:30 عصراً' },
    { hour: 17, min: 0, label: '5:00 مساءً' },
    { hour: 18, min: 30, label: '6:30 مساءً' },
    { hour: 20, min: 0, label: '8:00 مساءً' },
    { hour: 21, min: 30, label: '9:30 مساءً' },
    { hour: 23, min: 0, label: '11:00 مساءً' },
  ];

  // Pick only future slots (at least 30 minutes from now)
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  const validFutureSlots = candidateSlotsToday.filter(
    (s) => s.hour * 60 + s.min >= currentTotalMinutes + 30
  );

  if (validFutureSlots.length > 0) {
    const chosen = validFutureSlots[Math.floor(Math.random() * Math.min(3, validFutureSlots.length))];
    const targetDate = new Date(nowCairo);
    targetDate.setHours(chosen.hour, chosen.min, 0, 0);
    return {
      dateTimeStr: `اليوم - الساعة ${chosen.label}`,
      timeStr: chosen.label,
      startsAtISO: targetDate.toISOString(),
    };
  } else {
    // If very late today, give a slot in ~45-60 minutes
    const nextHour = currentHour + 1;
    const isPm = nextHour >= 12;
    const dispHour = nextHour % 12 || 12;
    const label = `${dispHour}:00 ${isPm ? 'مساءً' : 'صباحاً'}`;
    const targetDate = new Date(nowCairo);
    targetDate.setHours(nextHour, 0, 0, 0);
    return {
      dateTimeStr: `اليوم - الساعة ${label}`,
      timeStr: label,
      startsAtISO: targetDate.toISOString(),
    };
  }
}

// Helper to extract Egyptian Barber by name or nickname
function extractBarberFromText(text: string, barbers: Array<{ id: string; name: string }>) {
  const t = text.toLowerCase();
  if (t.includes('حداد') || t.includes('الحداد')) {
    const found = barbers.find((b) => b.name.includes('حداد')) || { id: 'barber-mohamed', name: 'محمد الحداد' };
    return { barberId: found.id, barberName: found.name.startsWith('كابتن') ? found.name : `كابتن ${found.name}` };
  }
  if (t.includes('كريم') || t.includes('السيد')) {
    const found = barbers.find((b) => b.name.includes('كريم')) || { id: 'barber-karim', name: 'كريم السيد' };
    return { barberId: found.id, barberName: found.name.startsWith('كابتن') ? found.name : `كابتن ${found.name}` };
  }
  if (t.includes('عمر') || t.includes('خالد')) {
    const found = barbers.find((b) => b.name.includes('عمر')) || { id: 'barber-omar', name: 'عمر خالد' };
    return { barberId: found.id, barberName: found.name.startsWith('كابتن') ? found.name : `كابتن ${found.name}` };
  }
  for (const b of barbers) {
    const bClean = b.name.replace(/كابتن|\s+/g, '').toLowerCase();
    if (bClean.length >= 3 && t.includes(bClean)) {
      return { barberId: b.id, barberName: b.name.startsWith('كابتن') ? b.name : `كابتن ${b.name}` };
    }
  }
  return null;
}

// Helper to extract Cairo Date and Time (e.g. "بكرا الساعة 5", "النهارده 8", "الساعة 5 عصرا")
function extractDateTimeFromText(text: string) {
  const t = text.toLowerCase();
  const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  let dayLabel = '';
  let targetDate = new Date(nowCairo);

  if (t.includes('بكرا') || t.includes('بكرة') || t.includes('غدا') || t.includes('غداً')) {
    dayLabel = 'غداً';
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (t.includes('بعد بكرا') || t.includes('بعد بكرة') || t.includes('بعد غد')) {
    dayLabel = 'بعد غد';
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (t.includes('النهارده') || t.includes('اليوم')) {
    dayLabel = 'اليوم';
  }

  // Parse time / hour: "الساعة 5", "الساعه 5", "5 عصرا", "5 مساء", "الساعة 12"
  const timeMatch = t.match(/(?:الساعة|الساعه|ساعة|ساعه)\s*(\d{1,2})(?::(\d{2}))?\s*(ص|م|عصرا|عصراً|مساء|مساءً|صباحا|صباحاً|الظهر|بالليل)?/i) ||
                    t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(عصرا|عصراً|مساء|مساءً|صباحا|صباحاً|م|ص)\b/i);

  let timeStr = '';
  let hasExplicitTime = false;

  if (timeMatch) {
    let rawHour = parseInt(timeMatch[1], 10);
    let minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    let period = timeMatch[3] || '';

    if (rawHour >= 1 && rawHour <= 12) {
      hasExplicitTime = true;
      if (period.includes('ص') || period.includes('صباح')) {
        targetDate.setHours(rawHour === 12 ? 0 : rawHour, minute, 0, 0);
        timeStr = `الساعة ${rawHour}:${String(minute).padStart(2, '0')} صباحاً`;
      } else {
        const hour24 = rawHour === 12 ? 12 : rawHour + 12;
        targetDate.setHours(hour24, minute, 0, 0);
        const pLabel = rawHour >= 3 && rawHour <= 6 ? 'عصراً' : rawHour >= 7 ? 'مساءً' : 'ظهراً';
        timeStr = `الساعة ${rawHour}:${String(minute).padStart(2, '0')} ${pLabel}`;
      }
    }
  }

  if (dayLabel || timeStr) {
    const fullStr = dayLabel && timeStr ? `${dayLabel} (${timeStr})` : dayLabel || timeStr;
    return {
      dayLabel,
      timeStr,
      fullStr,
      hasExplicitTime,
      targetDateISO: targetDate.toISOString(),
    };
  }
  return null;
}

// Helper to extract customer name cleanly
function extractNameFromText(text: string, pushName: string = '') {
  const explicitMatch = text.match(/(?:اسمي|سجل اسمي|سجلني باسم|معاك|انا|أنا|باسم|الاسم|معك)\s+([^\s,،]+(?:\s+[^\s,،]+){0,2})/i);
  if (explicitMatch && explicitMatch[1]) {
    let cleanCandidate = explicitMatch[1]
      .replace(/(واستناني|استناني|على نفس|علي نفس|نفس الرقم|على الرقم|رقم الواتس|الواتس|بكرا|بكرة|الساعة|الساعه).*/gi, '')
      .trim();
    if (cleanCandidate.length >= 2) {
      return cleanCandidate;
    }
  }

  let clean = text
    .replace(/(عايز اجي|عايز احجز|احجزلي|اسجل|سجلني|سجل اسمي|سجل|واستناني|استناني|على نفس الرقم|علي نفس الرقم|على نفس|علي نفس|نفس الرقم|رقم الواتس|الواتساب|الواتس|واوفق مع|مع الحداد|مع كريم|مع عمر|مع الكابتن|كابتن|الحداد|كريم|عمر|بكرا|بكرة|النهارده|اليوم|الساعة \d+|الساعه \d+|\d+|ج|جنيه|كدا|كده)/gi, '')
    .replace(/(أيوة|ايوة|تمام|يا ريت|حبيبي|تسلم|شكرا|شكراً|يا غالي|يا باشا|لا ياعم|ياعم)/gi, '')
    .trim();

  clean = clean.replace(/(على نفس.*|علي نفس.*|على الرقم.*|نفس الرقم.*)/gi, '').trim();

  if (clean && clean.length >= 2 && clean.length <= 25 && !clean.includes('http')) {
    return clean;
  }

  const cleanPushName = (pushName || 'أحمد').replace(/(على نفس.*|علي نفس.*)/gi, '').trim();
  return cleanPushName || 'أحمد';
}

// Direct Native Intelligent Interactive AI Agent Response Engine - 100% Dynamic MySQL Database Integration
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

  // Memory lasts for 90 minutes (1.5 hours)
  const SESSION_TIMEOUT_MS = 90 * 60 * 1000;
  const now = Date.now();
  let session = bookingSessions.get(sessionKey);
  if (!session || (session.lastActiveAt && (now - session.lastActiveAt) > SESSION_TIMEOUT_MS)) {
    session = { step: 'idle', lastActiveAt: now };
  } else {
    session.lastActiveAt = now;
  }

  // 1. Fetch Real-Time Live Salon Context directly from MySQL Database
  const liveCtx = await getLiveSalonContext();
  const deposits = liveCtx.deposits;

  const textLower = userMessage.toLowerCase().trim();

  // Multi-Entity Cumulative Parsing
  const parsedBarber = extractBarberFromText(userMessage, liveCtx.barbers);
  if (parsedBarber) {
    session.barberId = parsedBarber.barberId;
    session.barberName = parsedBarber.barberName;
  }

  const parsedDateTime = extractDateTimeFromText(userMessage);
  if (parsedDateTime) {
    session.dateTimeStr = parsedDateTime.fullStr;
    if (parsedDateTime.timeStr) session.targetTime = parsedDateTime.timeStr;
    if (parsedDateTime.dayLabel) session.targetDate = parsedDateTime.dayLabel;
    if (parsedDateTime.hasExplicitTime) {
      session.bookingType = 'vip';
      session.depositAmount = deposits.vip;
    }
  }

  if (textLower.includes('نفس الرقم') || textLower.includes('على نفس الرقم') || textLower.includes('رقم الواتس')) {
    session.customerPhone = senderPhone || '01005437633';
  }

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
    const custName = session.customerName || (pushName && pushName.trim().length >= 2 ? pushName.trim() : 'أحمد');
    const bType = session.bookingType || 'normal';
    const defaultSrv = liveCtx.services[0] || { id: 'srv-1', name: 'قص شعر كلاسيكي', price: 180 };
    const sName = session.serviceName || defaultSrv.name;
    const sPrice = session.servicePrice || defaultSrv.price;
    const randomBarber = liveCtx.barbers[Math.floor(Math.random() * liveCtx.barbers.length)] || { id: 'barber-mohamed', name: 'محمد الحداد' };
    const bName = session.barberName || (bType === 'vip' ? (liveCtx.barbers[0]?.name || 'محمد الحداد') : randomBarber.name);
    const bId = session.barberId || (bType === 'vip' ? (liveCtx.barbers[0]?.id || 'barber-mohamed') : randomBarber.id);
    const depVal = session.depositAmount || (bType === 'vip' ? deposits.vip : deposits.normal);

    try {
      const created = await createBooking({
        customerName: custName,
        customerPhone: senderPhone || '01005437633',
        serviceId: session.serviceId || defaultSrv.id,
        serviceName: sName,
        servicePrice: sPrice,
        totalAmount: sPrice,
        bookingFeeAtBooking: depVal,
        barberId: bId,
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
      session.receiptSubmitted = true;
      session.step = 'proof_submitted';
      session.customerName = custName;
      session.barberName = bName;
      session.serviceName = sName;
      session.bookingType = bType;
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
    replyText = `يا هلا يا باشا! الفرق الأساسي بين الجلستين في ${liveCtx.salonName} 👑💈:

1️⃣ **الجلسة العادية (Normal):**
• بتختار اليوم اللي تحب تحضر فيه (النهارده أو أي يوم).
• النظام بيعين لك كابتن متاح وميعاد تقريبي ودور في الطابور.
• العربون المطلوب: *${deposits.normal} جنيه فقط*.
• *(غير متاح فيها تحديد الساعة بالدقيقة مسبقاً)*.

2️⃣ **الجلسة الـ VIP الملكية (VIP):**
• حرية واختيار كامل للكابتن المفضل لحضرتك (${liveCtx.barbers.map((b) => b.name).join('، ')}).
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
    parsedDateTime?.hasExplicitTime &&
    !session.serviceName
  ) {
    replyText = `يا هلا يا فندم! 👑
ميزة **اختيار وتحديد الميعاد بالساعة والدقيقة** دي ميزة مخصصة حصرياً لـ **الجلسة الـ VIP** فقط، أما الجلسة العادية فالنظام بيعين لها ميعاد ودور تقريبي في اليوم.

💎 *تحب نطوّر ونرقّي جلستك لجلسة VIP (عربون ${deposits.vip} ج) عشان تختار الساعة والكابتن اللي يريحك بالظبط وتدخل في ميعادك؟*
أو نكمل في الجلسة العادية (عربون ${deposits.normal} ج) ونعين لك وقت ودور متاح؟`;
  }

  // -------------------------------------------------------------------------
  // 5. SESSION TYPE SELECTION (VIP vs Normal)
  // -------------------------------------------------------------------------
  else if (textLower === 'vip' || textLower === 'ملكيه' || textLower === 'ملكية' || textLower === 'في اي بي' || textLower === '2' || textLower === 'جلسة vip') {
    session.bookingType = 'vip';
    session.depositAmount = deposits.vip;
    session.step = 'choosing_service';
    bookingSessions.set(sessionKey, session);

    const barbersList = liveCtx.barbers.map((b) => `• *${b.name.startsWith('كابتن') ? b.name : 'كابتن ' + b.name}* ✂️`).join('\n');
    const vipServices = liveCtx.services.filter((s) => s.category === 'vip_package' || s.is_vip_only || s.name.toLowerCase().includes('vip'));
    const vipServicesList = vipServices.map((s) => `• *${s.name}:* ${s.price} جنيه`).join('\n');

    replyText = `أحلى وأفخم اختيار يا باشا! 👑 تم اختيار **الجلسة الـ VIP الملكية** (عربون ${deposits.vip} ج).

✂️ **كباتن الصالون المتاحين للاختيار:**
${barbersList}

👑 **باقات وخدمات الـ VIP الملكية المتاحة:**
${vipServicesList}

قولي تحب تختار كابتن مين، وأنهي باقة، والميعاد والساعة المناسبة لحضرتك؟ ✨`;
  } else if (textLower === 'عادية' || textLower === 'عاديه' || textLower === 'العادي' || textLower === '1' || textLower === 'جلسة عادية') {
    session.bookingType = 'normal';
    session.depositAmount = deposits.normal;
    const randomBarber = liveCtx.barbers[Math.floor(Math.random() * liveCtx.barbers.length)] || { id: 'barber-1', name: 'كابتن الصالون' };
    session.barberName = randomBarber.name;
    session.barberId = randomBarber.id;
    const smartCairo = getSmartCairoTimeForNormalSession();
    session.dateTimeStr = session.dateTimeStr || smartCairo.dateTimeStr;
    session.targetTime = smartCairo.timeStr;
    session.step = 'choosing_service';
    bookingSessions.set(sessionKey, session);

    const normalServices = liveCtx.services.filter((s) => s.category !== 'vip_package' && !s.is_vip_only && !s.name.toLowerCase().includes('vip'));
    const servicesList = normalServices.map((s) => `• *${s.name}:* ${s.price} جنيه`).join('\n');

    replyText = `تمام يا باشا! تم اختيار **الجلسة العادية** 💈 (عربون ${deposits.normal} ج).
النظام خصص لك ميعاد مع *${session.barberName}* (${session.dateTimeStr}).

📋 **قائمة خدمات الجلسة العادية:**
${servicesList}

قولي تحب نعملك أنهي خدمة النهارده؟ ✨`;
  }

  // -------------------------------------------------------------------------
  // 6. DYNAMIC SERVICE MATCHING FROM MYSQL (WITH AUTO-VIP UPGRADE)
  // -------------------------------------------------------------------------
  if (!replyText) {
    for (const s of liveCtx.services) {
      const sNameClean = s.name.toLowerCase();
      const sPriceStr = String(s.price);
      if (
        textLower.includes(sPriceStr) ||
        (sNameClean.length > 3 && textLower.includes(sNameClean)) ||
        (s.name.includes('Executive') && (textLower.includes('executive') || textLower.includes('900'))) ||
        (s.name.includes('Royal') && (textLower.includes('royal') || textLower.includes('480'))) ||
        (s.name.includes('Gentleman') && (textLower.includes('gentleman') || textLower.includes('650'))) ||
        (s.name.includes('Full Experience') && (textLower.includes('full') || textLower.includes('750'))) ||
        (s.name.includes('تنظيف بشرة') && (textLower.includes('بشرة') || textLower.includes('بشره') || textLower.includes('تنظيف')))
      ) {
        session.serviceName = s.name;
        session.servicePrice = s.price;
        session.serviceId = s.id;

        const isVipService = s.category === 'vip_package' || Boolean(s.is_vip_only) || s.name.toLowerCase().includes('vip') || s.price >= 400;
        if (isVipService) {
          session.bookingType = 'vip';
          session.depositAmount = deposits.vip;
        } else if (!session.bookingType) {
          session.bookingType = 'normal';
          session.depositAmount = deposits.normal;
        } else {
          session.depositAmount = session.bookingType === 'vip' ? deposits.vip : deposits.normal;
        }

        session.step = 'awaiting_name_phone';
        bookingSessions.set(sessionKey, session);

        replyText = `اختيار رائع يا باشا! *${s.name}* (*${s.price} جنيه*) ✂️👑.
${isVipService ? '✨ تم اعتماد الحجز كـ *جلسة VIP ملكية* نظراً لاختيارك باقة VIP فاخرة.' : ''}

عشان نسجل الحجز ونصدر الفاتورة فوراً:
1️⃣ *أتشرف باسم حضرتك الكريم؟*
2️⃣ *وهل تحب نسجل الحجز على رقم الواتساب ده (*${senderPhone || 'نفس الرقم'}*) ولا برقم تاني؟*`;
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. NAME & PHONE CONFIRMATION -> ISSUE DEPOSIT INVOICE & PROMPT PROOF
  // -------------------------------------------------------------------------
  if (!replyText && session.serviceName && !session.receiptSubmitted) {
    const candidateName = extractNameFromText(userMessage, pushName);
    if (candidateName && candidateName !== 'أحمد') {
      session.customerName = candidateName;
    } else if (!session.customerName) {
      session.customerName = candidateName;
    }

    if (!session.customerPhone) {
      session.customerPhone = senderPhone || '01005437633';
    }

    session.depositAmount = session.bookingType === 'vip' ? deposits.vip : deposits.normal;
    session.step = 'awaiting_payment_proof';
    bookingSessions.set(sessionKey, session);

    const defaultBarber = liveCtx.barbers[0]?.name || 'محمد الحداد';
    const assignedBarber = session.barberName || (session.bookingType === 'vip' ? defaultBarber : (liveCtx.barbers[Math.floor(Math.random() * liveCtx.barbers.length)]?.name || 'كريم السيد'));
    session.barberName = assignedBarber;
    const bTypeLabel = session.bookingType === 'vip' ? 'جلسة VIP ملكية 👑' : 'جلسة عادية 💈';

    replyText = `يا هلا بأستاذنا الفاضل *${session.customerName}*! 🌟👑
تم تسجيل بياناتك وتثبيت موعدك المفضل بدقة:

🧾 *فاتورة وبيانات الحجز:*
• *نوع الجلسة:* ${bTypeLabel}
• *الكابتن:* ${session.barberName} ✂️
• *الخدمة:* ${session.serviceName}
• *الميعاد:* ${session.dateTimeStr || 'اليوم'} ⏰
• *إجمالي الخدمة:* ${session.servicePrice} جنيه
• *العربون المطلوب لتأكيد الحجز:* *${session.depositAmount} جنيه*

⚠️ *تنبيه مهم:* رسوم الحجز (العربون) غير قابلة للاسترداد لأي سبب لضمان حجز وتجهيز الكرسي والموعد لحضرتك.

💳 *طرق تحويل وتأكيد العربون:*
• *InstaPay:* \`${liveCtx.paymentAccounts.instapay}\`
• *Vodafone Cash:* \`${liveCtx.paymentAccounts.vodafoneCash}\`

📸 *يرجى تحويل العربون وإرسال صورة إيصال التحويل (اسكرين شوت) هنا على الواتساب فوراً* لاعتماد الحجز وتجهيز الكرسي لك! ✨`;
  }

  // -------------------------------------------------------------------------
  // 8. GENERAL INTENT TO BOOK (Start booking flow if completely idle)
  // -------------------------------------------------------------------------
  else if (!replyText && session.step === 'idle' && (textLower.includes('احجز') || textLower.includes('حجز') || textLower.includes('احلق') || textLower.includes('ميعاد') || textLower.includes('دور'))) {
    session.step = 'choosing_session_type';
    bookingSessions.set(sessionKey, session);

    replyText = `يا هلا يا باشا منورنا في ${liveCtx.salonName}! 💈👑
يسعدنا جداً خدمتك! تحب تختار نوع الجلسة:

1️⃣ **جلسة عادية (Normal):** اختيار اليوم، والنظام يحدد لك دور وساعة ومقعد متاح تلقائياً (العربون *${deposits.normal} ج*).
2️⃣ **جلسة VIP ملكية (VIP):** اختيار الكابتن المفضل والميعاد بالتحديد بالساعة والدقيقة + كرسي VIP مخصص وأولوية دخول فورية (العربون *${deposits.vip} ج*).

*(لو حابب تعرف الفرق بينهم قولي "إيه الفرق ما بينهم")* ✨`;
  }

  // -------------------------------------------------------------------------
  // 9. FALLBACK TO GEMINI FLASH AI (Dynamic Prompt with Live MySQL Data & 90-Min Active Booking Memory)
  // -------------------------------------------------------------------------
  if (!replyText) {
    const servicesListStr = liveCtx.services.map((s) => `• ${s.name}: ${s.price} جنيه`).join('\n');
    const barbersListStr = liveCtx.barbers.map((b) => `• ${b.name}`).join('\n');

    let currentBookingContext = '';
    if (session.receiptSubmitted || session.bookingId) {
      currentBookingContext = `
# ⚠️ تنبيه فائق الأهمية عن حالة العميل الحالي:
- العميل الحالي (${session.customerName || 'المميز'}) **قام بإرسال صورة إيصال التحويل بالفعل** وتم تسجيل حجزه برقم (#${session.bookingId || 'مسجل'}).
- الكابتن المسجل والمخصص له هو: **${session.barberName || 'كابتن الصالون'}**.
- نوع الجلسة: **${session.bookingType === 'vip' ? 'جلسة VIP ملكية' : 'جلسة عادية'}**.
- الخدمة المختارة: **${session.serviceName || 'الخدمة المختارة'}**.
- الميعاد المسجل: **${session.dateTimeStr || 'اليوم'}**.
- الحجز والإيصال حالياً قيد المراجعة والاعتماد لدى موظف الاستقبال.
- ❌ **ممنوع منعاً باتاً** أن تطلب من العميل إرسال صورة الإيصال أو تحويل العربون مرة أخرى، لأنه أرسله بالفعل!
- إذا سأل العميل عن الحلاق أو الموعد، طمئنه بالبيانات المسجلة أعلاه وأخبره أن الإيصال قيد الاعتماد من الاستقبال.`;
    } else if (session.serviceName) {
      currentBookingContext = `
# سياق الحجز الحالي قيد الإنشاء:
- العميل اختار خدمة: ${session.serviceName} (${session.servicePrice} جنيه).
- نوع الجلسة: ${session.bookingType === 'vip' ? 'جلسة VIP ملكية' : 'جلسة عادية'}.
- الكابتن: ${session.barberName || 'كابتن الصالون'}.
- الميعاد: ${session.dateTimeStr || 'اليوم'}.
- العربون المطلوب: ${session.depositAmount || 50} جنيه.
- الخطوة التالية: تحويل العربون وإرسال الاسكرين شوت.`;
    }

    const systemInstruction = `أنت المساعد الذكي الرسمي لصالون (${liveCtx.salonName}).
أسلوبك: مصري راقي، محترم، ذكي، سريع ومفيد ("يا هلا يا فندم", "منورنا يا باشا", "تحت أمرك يا غالي").

# قائمة الخدمات والأسعار المتاحة حالياً في قاعدة البيانات:
${servicesListStr}

# قائمة الكباتن الحلاقين المتاحين حالياً:
${barbersListStr}

# بيانات العربون والحسابات:
- عربون الجلسة العادية: ${deposits.normal} جنيه
- عربون الجلسة VIP: ${deposits.vip} جنيه
- إنستاباي / فودافون كاش: ${liveCtx.paymentAccounts.instapay}
- رقم واتساب العميل الحالي: ${senderPhone || 'رقم الواتساب الحالي'}.
- ميزة تحديد الساعة متاحة فقط في الـ VIP (إذا طلب العميل في العادية ساعة، اعرض عليه الترقية لـ VIP).
- العربون غير قابل للاسترداد.
- رابط التتبع: https://trimmind.up.railway.app/track.
${currentBookingContext}

رد دائماً بالبيانات الحقيقية أعلاه باللهجة المصرية الودودة.`;

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
    replyText = `أهلاً بك في ${liveCtx.salonName} 💈👑\nنورتنا يا غالي! نقدر نساعدك في حجز جلسة عادية أو جلسة VIP، ومعرفة قائمة الأسعار والخدمات.\nتحب نساعدك بإيه النهارده؟`;
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
