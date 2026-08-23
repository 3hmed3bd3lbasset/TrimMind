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

// Global persistent de-duplication cache across reconnects
const processedMessageIds = new Map<string, number>();
const processedContentKeys = new Map<string, number>();

// In-memory conversation history per phone number for conversational context
const chatHistories = new Map<string, Array<{ role: string; parts: Array<{ text: string }> }>>();

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
          console.log(`📲 Generated pairing code for ${cleanPhone}: ${code}`);
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
    console.log(`Using Baileys v${version.join('.')}, isLatest: ${isLatest}`);

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
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 2000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.qrCodeRaw = qr;
        state.qrCodeDataUrl = await QRCode.toDataURL(qr);
        state.status = 'qr_ready';
        console.log('📲 New WhatsApp QR Code Generated for Pairing!');
      }

      if (connection === 'close') {
        isSocketOpen = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        state.status = 'disconnected';
        state.qrCodeDataUrl = null;
        state.pairingCode = null;
        isInitializing = false;
        console.log(`WhatsApp connection closed (status: ${statusCode}). Reconnecting: ${shouldReconnect}`);

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
        console.log('🎉 WhatsApp Connected Successfully on Persistent Storage!');
      }
    });

    // Handle Incoming Messages & Dispatch Live AI Replies
    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type !== 'notify') return;

      const now = Date.now();

      for (const msg of m.messages) {
        if (!msg || !msg.message) continue;

        const remoteJid = msg.key?.remoteJid || '';
        const msgId = msg.key?.id;
        const isFromMe = Boolean(msg.key?.fromMe);

        // Ignore broadcast status updates
        if (remoteJid.includes('status@broadcast')) continue;

        // If sent from the same phone (self-chat testing), allow only 1-to-1 chats to bot number
        if (isFromMe && !remoteJid.includes('201005437633') && !remoteJid.includes('01005437633')) {
          // Outgoing message sent to an external contact from phone, ignore
          continue;
        }

        if (msgId) {
          if (processedMessageIds.has(msgId)) {
            console.log(`⚠️ Ignored duplicate message ID (memory cache): ${msgId}`);
            continue;
          }
          try {
            await query(
              'INSERT INTO webhook_events (id, source, event_type, processed_at) VALUES (?, "whatsapp_baileys", "message", NOW())',
              [msgId]
            );
          } catch (err: any) {
            if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
              console.log(`⚠️ Ignored duplicate message ID (database idempotency): ${msgId}`);
              continue;
            }
          }
          processedMessageIds.set(msgId, now);
        }

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          '';

        const isImage = Boolean(msg.message.imageMessage);
        if (!text.trim() && !isImage) {
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
            console.log('Error downloading WhatsApp image buffer:', err.message);
          }
        }

        const textKey = (text || 'img_attachment').trim().toLowerCase();
        const dedupKey = `${remoteJid}:${textKey}`;
        if (textKey && processedContentKeys.has(dedupKey)) {
          const lastTime = processedContentKeys.get(dedupKey)!;
          if (now - lastTime < 3000) {
            console.log(`⚠️ Ignored duplicate WhatsApp text (${remoteJid}): ${text}`);
            continue;
          }
        }
        if (textKey) processedContentKeys.set(dedupKey, now);

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

        // Prune cache
        if (processedMessageIds.size > 2000) {
          for (const [id, time] of processedMessageIds.entries()) {
            if (now - time > 10 * 60 * 1000) processedMessageIds.delete(id);
          }
        }
        if (processedContentKeys.size > 2000) {
          for (const [k, time] of processedContentKeys.entries()) {
            if (now - time > 10 * 60 * 1000) processedContentKeys.delete(k);
          }
        }

        console.log(`📩 Incoming WhatsApp from ${senderPhone || remoteJid}: ${text || '[Image Receipt]'}`);

        // 1. Forward asynchronously to n8n
        forwardToN8nWebhook(msg, base64ImageUrl, senderPhone, text);

        // 2. Direct Intelligent AI Reply Engine
        handleIncomingWithAI(remoteJid, senderPhone, text, isImage).catch((err) => {
          console.error('AI Reply error:', err.message);
        });
      }
    });

    isInitializing = false;
    return getWhatsAppState();
  } catch (err: any) {
    isInitializing = false;
    state.status = 'disconnected';
    console.error('Failed to init WhatsApp:', err.message);
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
    console.error('WhatsApp socket is null, cannot send message.');
    return false;
  }

  let jid = to;
  if (!jid.includes('@')) {
    let clean = to.replace(/\D+/g, '');
    if (clean.startsWith('01')) clean = '20' + clean.substring(1);
    jid = `${clean}@s.whatsapp.net`;
  }

  console.log(`📤 Sending WhatsApp reply to ${jid}: ${text.substring(0, 60)}...`);
  try {
    await sock.sendMessage(jid, { text });
    return true;
  } catch (err: any) {
    console.error(`Failed to send WhatsApp to ${jid}:`, err.message);
    if (to !== jid) {
      try {
        await sock.sendMessage(to, { text });
        return true;
      } catch (err2: any) {
        console.error(`Fallback failed to ${to}:`, err2.message);
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
          console.log(`📡 n8n Webhook status: ${res.statusCode}`);
        });
      }
    );

    req.on('error', (e) => {
      console.error('Failed to forward to n8n webhook:', e.message);
    });

    req.write(payload);
    req.end();
  } catch (e: any) {
    console.error('Error forwarding message to n8n:', e.message);
  }
}

// Direct Native AI Agent Response Logic
async function handleIncomingWithAI(
  remoteJid: string,
  senderPhone: string,
  userMessage: string,
  isImage: boolean
) {
  if (!userMessage.trim() && !isImage) return;

  const sessionKey = senderPhone || remoteJid;
  const history = chatHistories.get(sessionKey) || [];

  const systemInstruction = `أنت المساعد الذكي الرسمي لصالون (TrimMind - صالون الحداد VIP).
أسلوبك: مصري راقي، محترم، ذكي، سريع ومفيد ("يا هلا يا فندم", "منورنا يا باشا", "تحت أمرك يا غالي").

# معلومات صالون TrimMind الحقيقية:
- الفرع: فرع الحداد VIP (متاح يومياً من 10:00 صباحاً حتى 12:00 منتصف الليل).
- الكباتن الحلاقين: كابتن أحمد، كابتن محمد، كابتن عمر (جميعهم متاحون وجاهزون لخدمتك).
- أهم الخدمات والأسعار:
  • حلاقة شعر VIP ملكي: 150 جنيه
  • تحديد وحلاقة ذقن بالبخار: 80 جنيه
  • باقة VIP كاملة (شعر + ذقن + حمام كريم + ماسك وجه): 300 جنيه
  • صبغة شعر / تنظيف بشرة عميق: 120 جنيه
- رابط الحجز المباشر واختيار الموعد: https://trimmind.up.railway.app
- رابط تتبع الدور المباشر في الصالون (Live Queue): https://trimmind.up.railway.app/track
- قائمة الانتظار الذكية (Smart Waitlist): لو المواعيد زحمة، بنسجل العميل في الانتظار وأول ما حد يلغي بنبلغه فوراً بفرصة الحجز.
- إثباتات الدفع (إنستاباي / فودافون كاش): عند استلام إثبات الدفع، بنبلغه إن الإيصال وصل وجارٍ اعتماده من موظف الاستقبال خلال دقائق وتأكيد الحجز.

# قواعد الرد:
1. رد دائماً باللهجة المصرية الودودة.
2. لا تكرر الكلام ولا تطلب أي معلومة قالها العميل.
3. كن مختصراً وواضحاً وقدم روابط الحجز أو التتبع عند الحاجة.`;

  let promptText = userMessage;
  if (isImage) {
    promptText = 'أرسل العميل صورة إيصال تحويل أو صورة استفسار.';
  }

  history.push({ role: 'user', parts: [{ text: promptText }] });
  if (history.length > 10) history.splice(0, history.length - 10);

  const candidateModels = ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];

  let replyText = '';

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
      console.error(`Gemini model ${model} error:`, e.message);
    }
  }

  if (!replyText) {
    const textLower = userMessage.toLowerCase();
    if (textLower.includes('حلاق') || textLower.includes('مين') || textLower.includes('متاح') || textLower.includes('كابتن')) {
      replyText = `أهلاً بك يا فندم! 💈 الكباتن المتاحين اليوم في صالون الحداد VIP:\n- كابتن أحمد ✂️\n- كابتن محمد ✂️\n- كابتن عمر ✂️\n\nتقدر تختار حلاقك المفضل وتحجز موعدك فوراً من هنا:\nhttps://trimmind.up.railway.app 👑`;
    } else if (textLower.includes('سعر') || textLower.includes('اسعار') || textLower.includes('خدمات') || textLower.includes('بكام') || textLower.includes('احلق') || textLower.includes('حلاقة')) {
      replyText = `يا هلا بك يا فندم! 💈 قائمة خدمات وباقات صالون الحداد VIP:\n• حلاقة شعر VIP ملكي: 150 جنيه\n• حلاقة وتحديد ذقن بالبخار: 80 جنيه\n• باقة VIP كاملة (شعر + ذقن + حمام كريم + ماسك): 300 جنيه\n\nللحجز المباشر واختيار الموعد المناسب:\nhttps://trimmind.up.railway.app 👑`;
    } else if (isImage) {
      replyText = `أهلاً بك يا فندم! 💈 تم استلام صورة الإيصال بنجاح وجارٍ مراجعتها وتأكيد حجزك من الاستقبال فوراً 👑✨`;
    } else {
      replyText = `أهلاً بك في صالون TrimMind (الحداد VIP) 💈👑\nنورتنا يا غالي! نقدر نساعدك في حجز موعد، معرفة قائمة الأسعار والخدمات، أو متابعة دورك المباشر في الصالون.\nتحب نساعدك بإيه النهارده؟`;
    }
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
