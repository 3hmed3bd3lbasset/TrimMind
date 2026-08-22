import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  BufferJSON,
  initAuthCreds,
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import https from 'https';
import { query } from '../config/database.js';

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL || 'https://n8n-server-production-bdce.up.railway.app/webhook/whatsapp-webhook';

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

// 1. Persistent MySQL Auth State Store
async function useMySQLAuthState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  await query(`
    CREATE TABLE IF NOT EXISTS whatsapp_auth (
      id VARCHAR(191) PRIMARY KEY,
      data LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const writeData = async (id: string, value: any) => {
    try {
      const jsonStr = JSON.stringify(value, BufferJSON.replacer);
      await query(`INSERT INTO whatsapp_auth (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?`, [
        id,
        jsonStr,
        jsonStr,
      ]);
    } catch (e: any) {
      console.error(`Error saving auth key ${id}:`, e.message);
    }
  };

  const readData = async (id: string) => {
    try {
      const rows = await query<any[]>(`SELECT data FROM whatsapp_auth WHERE id = ? LIMIT 1`, [id]);
      if (rows && rows.length > 0 && rows[0].data) {
        return JSON.parse(rows[0].data, BufferJSON.reviver);
      }
      return null;
    } catch {
      return null;
    }
  };

  const removeData = async (id: string) => {
    try {
      await query(`DELETE FROM whatsapp_auth WHERE id = ?`, [id]);
    } catch {}
  };

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category as keyof SignalDataTypeMap]) {
              const value = data[category as keyof SignalDataTypeMap]?.[id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(key, value));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
}

export function getWhatsAppState(): WhatsAppState {
  return { ...state };
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

  for (let i = 0; i < 15; i++) {
    if (sock && !sock.authState?.creds?.registered) {
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  if (sock && !sock.authState?.creds?.registered) {
    try {
      const code = await sock.requestPairingCode(cleanPhone);
      state.pairingCode = code;
      state.status = 'qr_ready';
      console.log(`📲 Generated fresh pairing code for ${cleanPhone}: ${code}`);
      return code;
    } catch (err: any) {
      console.error('Pairing code generation error:', err.message);
    }
  }

  if (state.pairingCode) return state.pairingCode;
  throw new Error('جاري تجهيز الاتصال، يرجى المحاولة بعد قليل.');
}

export async function initWhatsApp(): Promise<WhatsAppState> {
  if (isInitializing) {
    return getWhatsAppState();
  }

  isInitializing = true;
  state.status = 'connecting';

  try {
    const { state: authState, saveCreds } = await useMySQLAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: authState,
      browser: ['TrimMind Salon', 'Chrome', '120.0.0'],
    });

    sock.ev.on('creds.update', saveCreds);

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
        isInitializing = false;

        if (shouldReconnect) {
          setTimeout(() => initWhatsApp(), 4000);
        }
      } else if (connection === 'open') {
        state.status = 'connected';
        state.qrCodeDataUrl = null;
        state.pairingCode = null;
        state.lastConnectedAt = new Date().toISOString();
        isInitializing = false;
        console.log('🎉 WhatsApp Connected Successfully (Persistent MySQL Session)!');
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
