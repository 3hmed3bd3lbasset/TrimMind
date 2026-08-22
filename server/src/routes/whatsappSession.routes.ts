import { Router, Request, Response } from 'express';
import { getWhatsAppState, initWhatsApp, sendWhatsAppText } from '../services/whatsapp.service.js';

const router = Router();

// 1. Get WhatsApp status and ensure it's initializing if disconnected
router.get('/status', async (_req: Request, res: Response) => {
  let state = getWhatsAppState();
  if (state.status === 'disconnected') {
    initWhatsApp('01005437633');
    state = getWhatsAppState();
  }
  res.json({
    success: true,
    data: state,
  });
});

// 2. Request Pairing Code for phone number
router.post('/pair', async (req: Request, res: Response) => {
  try {
    const { phone = '01005437633' } = req.body;
    await initWhatsApp(phone);

    setTimeout(() => {
      const state = getWhatsAppState();
      res.json({
        success: true,
        message: 'تم طلب كود الربط بنجاح.',
        data: {
          phone,
          pairingCode: state.pairingCode,
          status: state.status,
          qrCodeDataUrl: state.qrCodeDataUrl,
        },
      });
    }, 2000);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Send text message
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

// 4. Interactive, Auto-Refreshing WhatsApp Connection Portal (QR + Pairing Code)
router.get('/qr', async (_req: Request, res: Response) => {
  const state = getWhatsAppState();
  if (state.status === 'disconnected') {
    initWhatsApp('01005437633');
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>ربط واتساب الصالون الذكي</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Cairo', sans-serif;
          background: #0d1412;
          color: #e6ede8;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }
        .card {
          background: #14221e;
          border: 1px solid #233b34;
          border-radius: 28px;
          padding: 36px;
          max-width: 460px;
          width: 100%;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .badge {
          display: inline-block;
          padding: 6px 16px;
          border-radius: 999px;
          background: #1c332b;
          color: #5eead4;
          font-size: 0.85rem;
          font-weight: 700;
          margin-bottom: 16px;
          border: 1px solid #2d5246;
        }
        h1 { font-size: 1.4rem; font-weight: 800; margin-bottom: 8px; color: #ffffff; }
        p { font-size: 0.95rem; color: #9bb3aa; margin-bottom: 24px; line-height: 1.6; }
        .qr-wrapper {
          background: #ffffff;
          padding: 16px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          min-height: 240px;
          min-width: 240px;
        }
        .qr-img { width: 220px; height: 220px; display: block; }
        .pairing-box {
          background: #0d1714;
          border: 1px dashed #3a6356;
          border-radius: 16px;
          padding: 16px;
          margin: 16px 0;
        }
        .pairing-code {
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: 6px;
          color: #34d399;
          font-family: monospace;
          margin: 8px 0;
        }
        .steps {
          text-align: right;
          background: #0d1714;
          padding: 16px 20px;
          border-radius: 16px;
          font-size: 0.88rem;
          color: #a7c2b8;
          margin-top: 20px;
          border: 1px solid #1c332b;
        }
        .steps ol { padding-right: 20px; }
        .steps li { margin-bottom: 8px; }
        .spinner {
          display: inline-block;
          width: 36px;
          height: 36px;
          border: 4px solid #1c332b;
          border-top-color: #34d399;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .success-box {
          background: #112d22;
          border: 1px solid #22c55e;
          color: #86efac;
          padding: 24px;
          border-radius: 20px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">💈 صالون TrimMind - مساعد الحجز الذكي</div>
        <div id="content">
          <div style="padding: 40px 0;">
            <div class="spinner"></div>
            <p style="margin-top: 20px; color: #5eead4;">جاري تجهيز رمز الربط لـ 01005437633...</p>
          </div>
        </div>
      </div>

      <script>
        async function checkStatus() {
          try {
            const res = await fetch('/api/whatsapp-session/status');
            const json = await res.json();
            const data = json.data || {};
            const content = document.getElementById('content');

            if (data.status === 'connected') {
              content.innerHTML = \`
                <div class="success-box">
                  <h2 style="font-size: 1.5rem; margin-bottom: 8px; color:#4ade80;">✅ تم ربط الواتساب بنجاح!</h2>
                  <p style="color:#bbf7d0; margin-bottom:0;">الرقم <strong>\${data.phoneNumber || '01005437633'}</strong> متصل بالسيرفر الآن، ومساعد الذكاء الاصطناعي يستقبل الرسائل ويرد عليها تلقائياً 👑💈</p>
                </div>
              \`;
              return;
            }

            if (data.qrCodeDataUrl) {
              content.innerHTML = \`
                <h1>امسح رمز QR لربط الرقم</h1>
                <p>امسح الرمز من خلال تطبيق واتساب على هاتفك للرقم <strong>01005437633</strong></p>
                <div class="qr-wrapper">
                  <img class="qr-img" src="\${data.qrCodeDataUrl}" alt="QR Code" />
                </div>
                \${data.pairingCode ? \`
                  <div class="pairing-box">
                    <span style="font-size:0.8rem; color:#85a89d;">أو استخدم كود الربط:</span>
                    <div class="pairing-code">\${data.pairingCode}</div>
                  </div>
                \` : ''}
                <div class="steps">
                  <ol>
                    <li>افتح تطبيق <strong>WhatsApp</strong> على هاتفك.</li>
                    <li>اضغط على <strong>الثلاث نقاط ⚙️</strong> ثم <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</li>
                    <li>اضغط على <strong>ربط جهاز (Link a Device)</strong> ووجّه الكاميرا نحو الرمز.</li>
                  </ol>
                </div>
              \`;
            }
          } catch (e) {
            console.error(e);
          }
        }

        checkStatus();
        setInterval(checkStatus, 2000);
      </script>
    </body>
    </html>
  `);
});

export default router;
