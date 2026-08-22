import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import https from 'https';

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || path.resolve(process.env.UPLOAD_DIR || 'uploads', 'whatsapp_auth');
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n-server-production-bdce.up.railway.app/webhook/whatsapp-webhook';

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
  phoneNumber: null,
  lastConnectedAt: null,
};

let sock: any = null;
let isInitializing = false;

// Ensure auth dir exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

export function getWhatsAppState(): WhatsAppState {
  return { ...state };
}

export async function initWhatsApp(requestedPhoneNumber?: string): Promise<WhatsAppState> {
  if (isInitializing) {
    return getWhatsAppState();
  }

  isInitializing = true;
  state.status = 'connecting';

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: authState,
      browser: ['TrimMind Salon', 'Chrome', '120.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

    // If a phone number is requested and not registered yet, generate a Pairing Code
    if (requestedPhoneNumber && !sock.authState.creds.registered) {
      let cleanPhone = requestedPhoneNumber.replace(/\D+/g, '');
      if (cleanPhone.startsWith('01')) {
        cleanPhone = '20' + cleanPhone.substring(1);
      }
      state.phoneNumber = cleanPhone;

      setTimeout(async () => {
        try {
          if (sock && !sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(cleanPhone);
            state.pairingCode = code;
            state.status = 'qr_ready';
            console.log(`\n========================================`);
            console.log(`📲 WHATSAPP PAIRING CODE FOR ${cleanPhone}:`);
            console.log(`👉   ${code}   👈`);
            console.log(`========================================\n`);
          }
        } catch (err: any) {
          console.error('Error requesting pairing code:', err.message);
        }
      }, 3000);
    }

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.qrCodeRaw = qr;
        state.qrCodeDataUrl = await QRCode.toDataURL(qr);
        state.status = 'qr_ready';
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        state.status = 'disconnected';
        state.qrCodeDataUrl = null;
        state.pairingCode = null;
        isInitializing = false;

        if (shouldReconnect) {
          setTimeout(() => initWhatsApp(state.phoneNumber || undefined), 5000);
        }
      } else if (connection === 'open') {
        state.status = 'connected';
        state.qrCodeDataUrl = null;
        state.pairingCode = null;
        state.lastConnectedAt = new Date().toISOString();
        isInitializing = false;
        console.log('🎉 WhatsApp Connected Successfully!');
      }
    });

    // Handle Incoming Messages & Forward to n8n Webhook
    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (!msg.key.fromMe && msg.message) {
          const remoteJid = msg.key.remoteJid;
          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            '';

          console.log(`📩 Incoming WhatsApp from ${remoteJid}: ${text}`);

          // Forward to n8n Webhook
          forwardToN8nWebhook(msg);
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
  if (!sock || state.status !== 'connected') {
    throw new Error('واتساب غير متصل حالياً بالسيرفر.');
  }

  let jid = to;
  if (!jid.includes('@')) {
    let clean = to.replace(/\D+/g, '');
    if (clean.startsWith('01')) clean = '20' + clean.substring(1);
    jid = `${clean}@s.whatsapp.net`;
  }

  await sock.sendMessage(jid, { text });
  return true;
}

// Helper to forward incoming message to n8n Webhook
function forwardToN8nWebhook(msg: proto.IWebMessageInfo) {
  try {
    const payload = JSON.stringify({
      event: 'messages.upsert',
      instance: 'trimmind_salon',
      data: msg,
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
