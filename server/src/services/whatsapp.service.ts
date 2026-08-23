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
interface UserBookingSession {
  step: 'idle' | 'collecting_info' | 'awaiting_name' | 'awaiting_payment_proof';
  serviceName?: string;
  servicePrice?: number;
  serviceId?: string;
  barberName?: string;
  barberId?: string;
  dateTimeStr?: string;
  customerName?: string;
  customerPhone?: string;
  bookingId?: string;
}

const bookingSessions = new Map<string, UserBookingSession>();
const chatHistories = new Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>();

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
          await handleIncomingWithAI(remoteJid, senderPhone, text, isImage, pushName);
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

// Direct Native Intelligent Interactive AI Agent Response Engine
async function handleIncomingWithAI(
  remoteJid: string,
  senderPhone: string,
  userMessage: string,
  isImage: boolean,
  pushName: string = ''
) {
  if (!userMessage.trim() && !isImage) return;

  const sessionKey = senderPhone || remoteJid;
  const history = chatHistories.get(sessionKey) || [];
  let session = bookingSessions.get(sessionKey) || { step: 'idle' };

  let replyText = '';

  // 1. If Image is sent (Payment Proof Receipt)
  if (isImage) {
    const custName = session.customerName || pushName || 'يا فندم';
    replyText = `📸 *تم استلام صورة إيصال التحويل بنجاح يا أستاذ ${custName}!* 💈👑

وجارٍ مراجعة الإيصال واعتماد الحجز رسمياً من الاستقبال خلال دقائق معدودة. 🌟
سيصلك إشعار تأكيد الموعد فور مراجعته، ونورتنا دائماً في صالون TrimMind الحداد VIP! ✨`;
    session.step = 'idle';
    bookingSessions.set(sessionKey, session);

    let targetJid = remoteJid;
    if (senderPhone && !remoteJid.includes('@s.whatsapp.net')) {
      let clean = senderPhone.replace(/\D+/g, '');
      if (clean.startsWith('01')) clean = '20' + clean.substring(1);
      targetJid = `${clean}@s.whatsapp.net`;
    }
    await sendWhatsAppText(targetJid, replyText);
    return;
  }

  const textLower = userMessage.toLowerCase().trim();

  // Extract info from message
  if (textLower.includes('محمد')) {
    session.barberName = 'كابتن محمد';
    session.barberId = 'barber-mohamed';
  } else if (textLower.includes('أحمد') || textLower.includes('احمد')) {
    session.barberName = 'كابتن أحمد';
    session.barberId = 'barber-ahmed';
  } else if (textLower.includes('عمر')) {
    session.barberName = 'كابتن عمر';
    session.barberId = 'barber-omar';
  }

  if (textLower.includes('300') || textLower.includes('vip') || textLower.includes('كاملة') || textLower.includes('كامله')) {
    session.serviceName = 'باقة VIP كاملة (شعر + ذقن بالبخار + حمام كريم + ماسك)';
    session.servicePrice = 300;
    session.serviceId = 'srv-vip-full';
  } else if (textLower.includes('150') || textLower.includes('شعر')) {
    session.serviceName = 'حلاقة شعر VIP ملكي';
    session.servicePrice = 150;
    session.serviceId = 'srv-haircut';
  } else if (textLower.includes('80') || textLower.includes('ذقن') || textLower.includes('دقن')) {
    session.serviceName = 'تحديد وحلاقة ذقن بالبخار';
    session.servicePrice = 80;
    session.serviceId = 'srv-beard';
  } else if (textLower.includes('120') || textLower.includes('بشرة') || textLower.includes('بشره') || textLower.includes('صبغة')) {
    session.serviceName = 'تنظيف بشرة عميق / صبغة شعر';
    session.servicePrice = 120;
    session.serviceId = 'srv-facial';
  }

  if (textLower.includes('النهارده') || textLower.includes('النهاردة') || textLower.includes('اليوم') || textLower.includes('الساعة') || textLower.includes('الساعه') || textLower.includes('مساء') || textLower.includes('عصر')) {
    session.dateTimeStr = userMessage;
  }

  // Check if user is in awaiting_name state or provided name
  if (session.step === 'awaiting_name' || (session.serviceName && session.barberName && session.dateTimeStr && !session.customerName)) {
    // If the message has a candidate name or confirms phone
    let candidateName = userMessage.replace(/(على نفس الرقم|رقم الواتس|الواتساب|احجزلي|سجل|أيوة|ايوة|تمام|يا ريت)/gi, '').trim();
    if (!candidateName && pushName) candidateName = pushName;
    if (!candidateName) candidateName = 'عميل مميز VIP';

    session.customerName = candidateName;
    session.customerPhone = senderPhone || '01005437633';

    // CREATE REAL BOOKING IN DATABASE!
    try {
      const created = await createBooking({
        customerName: session.customerName,
        customerPhone: session.customerPhone,
        serviceId: session.serviceId || 'srv-vip',
        serviceName: session.serviceName || 'باقة VIP كاملة',
        servicePrice: session.servicePrice || 300,
        totalAmount: session.servicePrice || 300,
        bookingFeeAtBooking: 50,
        barberName: session.barberName || 'كابتن محمد',
        barberId: session.barberId || 'barber-mohamed',
        bookingType: 'normal',
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });

      session.bookingId = created.id;
      session.step = 'awaiting_payment_proof';
      bookingSessions.set(sessionKey, session);

      replyText = `🎉 *تم تسجيل حجزك بنجاح في صالون TrimMind VIP!* 💈👑

يا أستاذ *${session.customerName}*، تم إدراج حجزك على السيستم وقاعدة البيانات رسمياً! 🌟

🧾 *فاتورة وبيانات الحجز الرسمية:*
• *رقم الحجز (Reference ID):* \`#${created.id}\`
• *الكابتن:* ${session.barberName} ✂️
• *الخدمة:* ${session.serviceName}
• *الميعاد:* ${session.dateTimeStr || 'اليوم'}
• *إجمالي الفاتورة:* *${session.servicePrice} جنيه*
• *العربون المطلوب لتأكيد الموعد:* *50 جنيه*

💳 *طرق دفع وتحويل العربون:*
• *InstaPay:* 01005437633
• *Vodafone Cash:* 01005437633

📸 *يرجى إرسال صورة إيصال التحويل (اسكرين شوت) هنا على الواتساب* ليقوم موظف الاستقبال باعتماد الحجز وتثبيت الكرسي فوراً!

📍 *رابط متابعة دورك المباشر في الصالون:*
https://trimmind.up.railway.app/track?q=${created.id}

تنورنا وتطلع أحلى عريس يا باشا! ✨`;
    } catch (e: any) {
      logDebug('CREATE_BOOKING_ERROR', { error: e.message });
      replyText = `أهلاً بك يا أستاذ *${session.customerName}*! 💈 تم استلام طلبك وبنجهزه لحضرتك. تحب تأكد الحجز مع ${session.barberName} على رقم الواتساب ده (${senderPhone})؟`;
    }
  } else if ((session.serviceName || textLower.includes('احجز') || textLower.includes('حجز')) && (!session.customerName || !session.dateTimeStr)) {
    // Missing either barber, date/time or name
    if (!session.barberName) {
      replyText = `يا هلا يا باشا! منورنا في صالون الحداد VIP 💈✨\n\nالكباتن المتاحين اليوم:\n• *كابتن أحمد* ✂️\n• *كابتن محمد* ✂️\n• *كابتن عمر* ✂️\n\nتحب تحجز مع مين فيهم يا غالي؟`;
    } else if (!session.serviceName) {
      replyText = `اختيار ممتاز مع ${session.barberName}! 👑\n\nباقات وخدمات الصالون:\n• *باقة VIP كاملة (الأكثر طلباً):* 300 جنيه\n• *حلاقة شعر VIP ملكي:* 150 جنيه\n• *تحديد وحلاقة ذقن بالبخار:* 80 جنيه\n\nتحب نعملك أنهي باقة فيهم يا باشا؟`;
    } else if (!session.dateTimeStr) {
      replyText = `تمام يا باشا! مع ${session.barberName} لـ ${session.serviceName} 👑\n\nيناسبك تيجي *النهارده ولا يوم تاني؟* والساعة كام بالظبط؟ (مواعيدنا يومياً من 10:00 الصبح لـ 12:00 بالليل)`;
    } else {
      session.step = 'awaiting_name';
      bookingSessions.set(sessionKey, session);
      replyText = `يا هلا يا باشا! لتسجيل الحجز وإصدار الفاتورة فوراً 👑:\n\n1. أتشرف باسم حضرتك الكريم؟\n2. وهل تحب نسجل الحجز على رقم الواتساب ده (*${senderPhone || 'نفس الرقم'}*)؟`;
    }
  }

  // Fallback to Gemini AI if not captured by state machine
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
- رقم الواتساب الحالي للعميل: ${senderPhone || 'رقم الواتساب الحالي'}
- العربون المطلوب لتأكيد الحجز: 50 جنيه
- بيانات تحويل العربون (إنستاباي / فودافون كاش): 01005437633
- رابط الحجز المباشر: https://trimmind.up.railway.app
- رابط تتبع الدور الحي: https://trimmind.up.railway.app/track

# قواعد مهمة لإتمام الحجز:
1. عند الحجز، اسأل العميل بلطف عن اسمه، واسأله هل يحب يسجل الحجز برقم الواتساب ده (${senderPhone}) ولا برقم تاني.
2. اطلب منه تحويل العربون وإرسال صورة إيصال التحويل (اسكرين شوت) على الواتساب لتأكيد الحجز.
3. رد دائماً باللهجة المصرية الودودة.`;

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
    replyText = `أهلاً بك في صالون TrimMind (الحداد VIP) 💈👑\nنورتنا يا غالي! نقدر نساعدك في حجز موعد مع كابتن محمد، أحمد، أو عمر، ومعرفة قائمة الأسعار أو متابعة دورك المباشر في الصالون.\nتحب نساعدك بإيه النهارده؟`;
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
