import { Router, Request, Response } from 'express';
import { getWhatsAppState, initWhatsApp, generatePairingCode, sendWhatsAppText } from '../services/whatsapp.service.js';

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

// 2. Request 8-Digit Pairing Code for phone number
router.post('/pair', async (req: Request, res: Response) => {
  try {
    const { phone = '01005437633' } = req.body;
    const code = await generatePairingCode(phone);
    res.json({
      success: true,
      message: 'تم إنشاء كود الربط بنجاح.',
      data: {
        phone,
        pairingCode: code,
      },
    });
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

// 4. Interactive, Dual-Mode Connection Portal (Live QR + Pairing Code)
router.get('/qr', async (_req: Request, res: Response) => {
  const state = getWhatsAppState();
  if (state.status === 'disconnected') {
    initWhatsApp();
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
          max-width: 480px;
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
        h1 { font-size: 1.35rem; font-weight: 800; margin-bottom: 8px; color: #ffffff; }
        p { font-size: 0.95rem; color: #9bb3aa; margin-bottom: 20px; line-height: 1.6; }
        .qr-wrapper {
          background: #ffffff;
          padding: 16px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          min-height: 230px;
          min-width: 230px;
        }
        .qr-img { width: 210px; height: 210px; display: block; }
        .btn-code {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #10b981;
          color: #06281e;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 800;
          padding: 14px 28px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          width: 100%;
          margin: 14px 0;
          box-shadow: 0 6px 0 #059669;
          transition: all 0.15s;
        }
        .btn-code:hover { background: #34d399; }
        .btn-code:active { transform: translateY(3px); box-shadow: none; }
        .pairing-box {
          background: #0d1714;
          border: 2px dashed #10b981;
          border-radius: 18px;
          padding: 20px;
          margin: 16px 0;
        }
        .pairing-code {
          font-size: 2.2rem;
          font-weight: 900;
          letter-spacing: 8px;
          color: #34d399;
          font-family: monospace;
          margin: 10px 0;
        }
        .steps {
          text-align: right;
          background: #0d1714;
          padding: 16px 20px;
          border-radius: 16px;
          font-size: 0.88rem;
          color: #a7c2b8;
          margin-top: 18px;
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
        <div class="badge">💈 صالون TrimMind - ربط رقم واتساب</div>
        <div id="content">
          <div style="padding: 30px 0;">
            <div class="spinner"></div>
            <p style="margin-top: 16px; color: #5eead4;">جاري تجهيز الاتصال برقم 01005437633...</p>
          </div>
        </div>
      </div>

      <script>
        let isGettingCode = false;

        async function requestCode() {
          if (isGettingCode) return;
          isGettingCode = true;
          const btn = document.getElementById('btnCode');
          if (btn) {
            btn.innerHTML = '⏳ جاري طلب الكود من واتساب...';
            btn.disabled = true;
          }
          try {
            const res = await fetch('/api/whatsapp-session/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: '01005437633' })
            });
            const json = await res.json();
            if (json.data && json.data.pairingCode) {
              renderPairingCode(json.data.pairingCode);
            }
          } catch (e) {
            alert('حدث خطأ أثناء طلب الكود، جرب مرة أخرى.');
          } finally {
            isGettingCode = false;
          }
        }

        function renderPairingCode(code) {
          const codeContainer = document.getElementById('codeContainer');
          if (codeContainer) {
            codeContainer.innerHTML = \`
              <div class="pairing-box">
                <span style="font-size:0.9rem; color:#85a89d; font-weight:700;">كود الربط الخاص برقمك:</span>
                <div class="pairing-code">\${code}</div>
                <p style="font-size:0.85rem; color:#6ee7b7; margin-bottom:0;">افتح واتساب ⬅️ الأجهزة المرتبطة ⬅️ ربط باستخدام رقم الهاتف ⬅️ واكتب الكود أعلاه.</p>
              </div>
            \`;
          }
        }

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
                  <p style="color:#bbf7d0; margin-bottom:0;">الرقم <strong>01005437633</strong> متصل بالسيرفر الآن، ومساعد الذكاء الاصطناعي يستقبل الرسائل ويرد عليها تلقائياً 👑💈</p>
                </div>
              \`;
              return;
            }

            if (data.qrCodeDataUrl) {
              const existingCode = document.getElementById('codeContainer')?.innerHTML || '';
              content.innerHTML = \`
                <h1>اختر طريقة الربط المناسبة</h1>
                <p>لرقم الواتساب: <strong style="color:#5eead4;">01005437633</strong></p>
                
                <button id="btnCode" class="btn-code" onclick="requestCode()">
                  📲 اضغط هنا لإظهار كود الربط (بدون كاميرا)
                </button>
                <div id="codeContainer">\${existingCode}</div>

                <div style="margin: 16px 0; color:#5eead4; font-size:0.85rem; font-weight:700;">─── أو امسح الـ QR Code ───</div>
                <div class="qr-wrapper">
                  <img class="qr-img" src="\${data.qrCodeDataUrl}" alt="QR Code" />
                </div>

                <div class="steps">
                  <ol>
                    <li>افتح تطبيق <strong>WhatsApp</strong> على هاتفك.</li>
                    <li>اضغط على <strong>الثلاث نقاط ⚙️</strong> ثم <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</li>
                    <li>اختر <strong>ربط باستخدام رقم الهاتف</strong> (واكتب الكود) أو <strong>ربط جهاز</strong> (وامسح الرمز).</li>
                  </ol>
                </div>
              \`;
            }
          } catch (e) {
            console.error(e);
          }
        }

        checkStatus();
        setInterval(checkStatus, 2500);
      </script>
    </body>
    </html>
  `);
});

export default router;
