import { Router, Request, Response } from 'express';
import { getWhatsAppState, initWhatsApp, sendWhatsAppText } from '../services/whatsapp.service.js';
import QRCode from 'qrcode';

const router = Router();

// 1. Get WhatsApp status
router.get('/status', async (_req: Request, res: Response) => {
  let state = getWhatsAppState();
  if (state.status === 'disconnected') {
    initWhatsApp();
    state = getWhatsAppState();
  }
  res.json({
    success: true,
    data: state,
  });
});

// 2. Direct Static PNG Image (Never changes or blinks in the browser)
router.get('/qr.png', async (_req: Request, res: Response) => {
  let state = getWhatsAppState();
  if (!state.qrCodeRaw && state.status === 'disconnected') {
    await initWhatsApp();
    for (let i = 0; i < 10; i++) {
      state = getWhatsAppState();
      if (state.qrCodeRaw) break;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (state.qrCodeRaw) {
    res.setHeader('Content-Type', 'image/png');
    const buffer = await QRCode.toBuffer(state.qrCodeRaw, { width: 320, margin: 2 });
    return res.send(buffer);
  }

  res.status(503).send('QR is being generated, please refresh in 2 seconds.');
});

// 3. Static, Non-Refreshing Web Page with Permanent QR Code
router.get('/qr', async (_req: Request, res: Response) => {
  let state = getWhatsAppState();
  if (state.status === 'disconnected') {
    initWhatsApp();
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>رمز QR ربط واتساب الصالون</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Cairo', sans-serif;
          background: #090e0d;
          color: #e6ede8;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }
        .card {
          background: #111a17;
          border: 1px solid #1e332d;
          border-radius: 28px;
          padding: 32px;
          max-width: 440px;
          width: 100%;
          text-align: center;
          box-shadow: 0 24px 48px rgba(0,0,0,0.6);
        }
        .badge {
          display: inline-block;
          padding: 6px 16px;
          border-radius: 999px;
          background: #192c25;
          color: #34d399;
          font-size: 0.85rem;
          font-weight: 700;
          margin-bottom: 16px;
          border: 1px solid #28473c;
        }
        h1 { font-size: 1.4rem; font-weight: 800; margin-bottom: 8px; color: #ffffff; }
        p { font-size: 0.92rem; color: #9bb3aa; margin-bottom: 20px; line-height: 1.5; }
        .qr-wrapper {
          background: #ffffff;
          padding: 16px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }
        .qr-img { width: 250px; height: 250px; display: block; border-radius: 8px; }
        .steps {
          text-align: right;
          background: #0a110f;
          padding: 16px 20px;
          border-radius: 16px;
          font-size: 0.88rem;
          color: #a7c2b8;
          border: 1px solid #192b25;
        }
        .steps ol { padding-right: 20px; }
        .steps li { margin-bottom: 8px; }
        .success-box {
          background: #0f2b20;
          border: 1px solid #22c55e;
          color: #86efac;
          padding: 28px;
          border-radius: 22px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">💈 صالون TrimMind - ربط رقم واتساب</div>
        <div id="mainContainer">
          <h1>امسح رمز QR لربط الرقم</h1>
          <p>لربط رقم الواتساب: <strong style="color:#5eead4;">01005437633</strong></p>
          
          <div class="qr-wrapper">
            <!-- Static Image that NEVER changes or reloads in DOM -->
            <img id="qrImg" class="qr-img" src="/api/whatsapp-session/qr.png?t=${Date.now()}" alt="WhatsApp QR Code" />
          </div>

          <div class="steps">
            <ol>
              <li>افتح تطبيق <strong>WhatsApp</strong> على هاتفك (01005437633).</li>
              <li>اضغط على <strong>الثلاث نقاط ⚙️</strong> ثم <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</li>
              <li>اضغط على <strong>ربط جهاز (Link a Device)</strong> ووجّه الكاميرا نحو الرمز.</li>
            </ol>
          </div>
        </div>
      </div>

      <script>
        // Only check if connected in background, NEVER touch or refresh the QR image
        async function pollConnection() {
          try {
            const res = await fetch('/api/whatsapp-session/status');
            const json = await res.json();
            if (json.data && json.data.status === 'connected') {
              document.getElementById('mainContainer').innerHTML = \`
                <div class="success-box">
                  <h2 style="font-size: 1.5rem; margin-bottom: 8px; color:#4ade80;">✅ تم ربط الواتساب بنجاح!</h2>
                  <p style="color:#bbf7d0; margin-bottom:0;">الرقم <strong>01005437633</strong> متصل بالسيرفر ومحفوظ في قاعدة البيانات، ومساعد الذكاء الاصطناعي يستقبل الرسائل ويرد عليها تلقائياً 👑💈</p>
                </div>
              \`;
            }
          } catch (e) {}
        }
        setInterval(pollConnection, 3000);
      </script>
    </body>
    </html>
  `);
});

// 4. Send text message endpoint
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({ success: false, error: 'رقم المستلم ونص الرسالة مطلوبان.' });
    }
    await sendWhatsAppText(to, text);
    res.json({ success: true, message: 'تم إرسال الرسالة بنجاح.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
