import https from 'https';

const host = 'trimmind.up.railway.app';

function sendChat(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: host,
      path: '/api/ai/chat',
      method: 'POST',
      headers: {
        'x-agent-secret': 'trim-mind-agent-secret-key-2026',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch(e) { resolve(buf); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testScenario(title, messages) {
  console.log(`\n==================================================\n🧪 سيناريو: ${title}\n==================================================`);
  const remoteJid = 'test_cairo_' + Math.random().toString(36).substring(7) + '@s.whatsapp.net';
  const phone = '01005437633';
  const pushName = 'أحمد';

  for (let i = 0; i < messages.length; i++) {
    const userMsg = messages[i];
    console.log(`\n👤 العميل: "${userMsg}"`);
    const res = await sendChat({
      messageId: `msg_${Date.now()}_${i}`,
      remoteJid,
      phone,
      pushName,
      text: userMsg
    });
    console.log(`🤖 المساعد:\n${res.text}`);
  }
}

async function run() {
  await testScenario('تجربة رسائل الصورة: ازيك -> ايوا -> تمام', [
    'ازيك',
    'ايوا',
    'تمام'
  ]);
}

run().catch(console.error);
