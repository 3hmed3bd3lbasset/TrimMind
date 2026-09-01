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

async function run() {
  const remoteJid = '241321411354640@lid';
  const phone = '01285694670';
  const pushName = 'أحمد عبد الباسط';

  console.log('--- Step 1: Turn 1 (Customer selects VIP Executive package 900 EGP) ---');
  const msgId1 = 'TEST-MSG-' + Date.now() + '-1';
  const res1 = await sendChat({
    messageId: msgId1,
    remoteJid,
    phone,
    pushName,
    text: 'عايز باقة VIP Executive ام 900 جنيه'
  });
  console.log('Bot Response 1:\n', res1.text);

  console.log('\n--- Step 2: Turn 2 (Customer answers previous question with "اي واحد") ---');
  const msgId2 = 'TEST-MSG-' + Date.now() + '-2';
  const res2 = await sendChat({
    messageId: msgId2,
    remoteJid,
    phone,
    pushName,
    text: 'اي واحد'
  });
  console.log('Bot Response 2:\n', res2.text);

  console.log('\n--- Step 3: Test Idempotency (Sending same msgId2 again) ---');
  const resDuplicate = await sendChat({
    messageId: msgId2,
    remoteJid,
    phone,
    pushName,
    text: 'اي واحد'
  });
  console.log('Duplicate Check Result:', resDuplicate);
  if (resDuplicate.isDuplicate === true) {
    console.log('✅ SUCCESS: Idempotency gate blocked the duplicate message completely!');
  } else {
    console.log('❌ FAILED: Duplicate was not blocked!');
  }
}

run().catch(console.error);
