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

// Global persistent de-duplication cache across reconnects (TTL 10 minutes)
const processedMessageIds = new Map<string, number>();
const processedContentKeys = new Map<string, number>();

export function getWhatsAppState(): WhatsAppState {
  const isTrulyConnected = Boolean(isSocketOpen && sock && sock.user && sock.user.id);
  return {
    ...state,
    status: isTrulyConnected ? 'connected' : state.qrCodeDataUrl || state.pairingCode ? 'qr_ready' : (isInitializing ? 'connecting' : 'disconnected')
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
  if (sock && sock.user && sock.user.id) {
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
    if (sock && sock.user && sock.user.id) {
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
    initWhatsApp();
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

    // Handle Incoming Messages & Forward to n8n Webhook
    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type !== 'notify') return;

      const now = Date.now();

      for (const msg of m.messages) {
        if (!msg.key.fromMe && msg.message) {
          const remoteJid = msg.key.remoteJid || '';
          const msgId = msg.key.id;

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
            // Drop empty status/receipt updates from WhatsApp!
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
          if (textKey && processedContentKeys.has(textKey)) {
            const lastTime = processedContentKeys.get(textKey)!;
            if (now - lastTime < 8000) {
              console.log(`⚠️ Ignored duplicate WhatsApp text (${remoteJid}): ${text}`);
              continue;
            }
          }
          if (textKey) processedContentKeys.set(textKey, now);

          // Resolve real Egyptian mobile number from candidate JIDs if remoteJid is LID
          let senderPhone = '';
          const candidateJids = [
            (msg.key as any).remoteJidAlt,
            (msg.key as any).participant,
            (msg as any).participant,
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

          // Forward to n8n Webhook
          forwardToN8nWebhook(msg, base64ImageUrl, senderPhone);
        }
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
  // Wait up to 8 seconds if connecting
  for (let i = 0; i < 16; i++) {
    if (sock && (state.status === 'connected' || sock.user)) {
      state.status = 'connected';
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!sock) {
    throw new Error('واتساب غير متصل حالياً بالسيرفر.');
  }

  let jid = to;
  if (!jid.includes('@')) {
    let clean = to.replace(/\D+/g, '');
    if (clean.startsWith('01')) clean = '20' + clean.substring(1);
    jid = `${clean}@s.whatsapp.net`;
  }

  console.log(`📤 Sending WhatsApp reply to ${jid}: ${text.substring(0, 60)}...`);
  await sock.sendMessage(jid, { text });
  return true;
}

// Helper to forward incoming message to n8n Webhook
function forwardToN8nWebhook(msg: proto.IWebMessageInfo, imageUrl?: string | null, senderPhone?: string | null) {
  try {
    const payload = JSON.stringify({
      event: 'messages.upsert',
      instance: 'trimmind_salon',
      senderPhone: senderPhone || null,
      imageUrl: imageUrl || null,
      data: {
        ...msg,
        senderPhone: senderPhone || null,
        imageUrl: imageUrl || null,
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
        // Webhook received
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
