import https from 'https';

const host = 'n8n-server-production-bdce.up.railway.app';

function triggerWebhook(text, phone) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      data: {
        key: {
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
          id: `TEST-${Date.now()}`
        },
        pushName: 'أحمد عبد الباسط',
        message: {
          conversation: text
        }
      }
    });

    const req = https.request({
      hostname: host,
      path: '/webhook/whatsapp-webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: buf }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('Sending message to WhatsApp Webhook...');
  const res = await triggerWebhook('سلام عليكم عايز اعرف اسعار الحلاقة عندكم', '201005437633');
  console.log('Webhook Response:', res);
}

run().catch(console.error);
