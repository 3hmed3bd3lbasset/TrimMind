import { Router, Request, Response } from 'express';
import { getWhatsAppState, initWhatsApp, resetWhatsAppSession, generatePairingCode, sendWhatsAppText } from '../services/whatsapp.service.js';
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

// 2. Request both fresh Pairing Code and QR simultaneously
router.post('/pair', async (req: Request, res: Response) => {
  try {
    const { phone = '01005437633' } = req.body;
    await resetWhatsAppSession();
    const code = await generatePairingCode(phone);
    const state = getWhatsAppState();
    res.json({
      success: true,
      message: 'تم توليد كود الربط ورمز QR بنجاح.',
      data: {
        phone,
        pairingCode: code,
        qrCodeDataUrl: state.qrCodeDataUrl,
        status: state.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Static Web Page with BOTH Pairing Code and QR Code together + Manual Refresh Button
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
      <title>ربط واتساب الصالون الذكي</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Cairo', sans-serif;
          background: #080d0c;
          color: #e6ede8;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
        }
        .card {
          background: #101917;
          border: 1px solid #1c3029;
          border-radius: 28px;
          padding: 32px;
          max-width: 500px;
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
        h1 { font-size: 1.4rem; font-weight: 900; margin-bottom: 6px; color: #ffffff; }
        p { font-size: 0.92rem; color: #9bb3aa; margin-bottom: 20px; line-height: 1.5; }
        
        .code-section {
          background: #0a1210;
          border: 2px solid #10b981;
          border-radius: 20px;
          padding: 20px;
          margin-bottom: 24px;
        }
        .code-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #a7f3d0;
          margin-bottom: 8px;
        }
        .pairing-code {
          font-size: 2.3rem;
          font-weight: 900;
          letter-spacing: 6px;
          color: #34d399;
          font-family: monospace;
          background: #101a18;
          padding: 12px;
          border-radius: 12px;
          display: inline-block;
          min-width: 240px;
          margin: 8px 0;
          border: 1px dashed #285446;
          user-select: all;
        }
        
        .divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: #5eead4;
          font-size: 0.85rem;
          font-weight: 800;
          margin: 20px 0;
        }
        .divider::before, .divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid #1e332d;
        }
        .divider:not(:empty)::before { margin-left: .5em; }
        .divider:not(:empty)::after { margin-right: .5em; }

        .qr-wrapper {
          background: #ffffff;
          padding: 14px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }
        .qr-img { width: 220px; height: 220px; display: block; border-radius: 8px; }

        .btn-manual-refresh {
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
          margin-bottom: 20px;
          box-shadow: 0 4px 14px rgba(16,185,129,0.3);
          transition: all 0.15s;
        }
        .btn-manual-refresh:hover { background: #34d399; }
        .btn-manual-refresh:active { transform: scale(0.98); }

        .steps {
          text-align: right;
          background: #0a110f;
          padding: 18px 20px;
          border-radius: 18px;
          font-size: 0.88rem;
          color: #a7c2b8;
          border: 1px solid #192b25;
        }
        .steps ol { padding-right: 20px; }
        .steps li { margin-bottom: 8px; }
        .steps li:last-child { margin-bottom: 0; }

        .success-box {
          background: #0f2b20;
          border: 1px solid #22c55e;
          color: #86efac;
          padding: 32px;
          border-radius: 24px;
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">💈 صالون TrimMind - ربط واتساب</div>
        <div id="mainContainer">
          <h1>اختر طريقة الربط المناسبة لك</h1>
          <p>لربط الرقم: <strong style="color:#5eead4;">01005437633</strong></p>

          <!-- 1. PAIRING CODE SECTION -->
          <div class="code-section">
            <div class="code-title">1️⃣ كود الربط المباشر (بدون كاميرا):</div>
            <div id="codeDisplay" class="pairing-code">اضغط للتوليد</div>
            <div style="font-size:0.82rem; color:#85a89d; margin-top:4px;">انسخ هذا الكود أو اكتبه في واتساب هاتفك</div>
          </div>

          <!-- MANUAL REFRESH BUTTON (NO AUTO REFRESH) -->
          <button id="btnRefresh" class="btn-manual-refresh" onclick="fetchNewCodes()">
            🔄 توليد كود و QR جديد الآن
          </button>

          <div class="divider">أو استخدام الكاميرا</div>

          <!-- 2. QR CODE SECTION -->
          <div class="qr-wrapper">
            <img id="qrImg" class="qr-img" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'><rect width='220' height='220' fill='%23ffffff'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23666'>اضغط على الزر لتوليد الرمز</text></svg>" alt="WhatsApp QR Code" />
          </div>

          <!-- 3. STEP BY STEP GUIDE -->
          <div class="steps">
            <strong style="color:#ffffff; display:block; margin-bottom:8px;">💡 طريقة الربط من تطبيق WhatsApp:</strong>
            <ol>
              <li>افتح تطبيق <strong>WhatsApp</strong> على هاتفك (01005437633).</li>
              <li>اذهب إلى <strong>الإعدادات ⚙️</strong> ⬅️ <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</li>
              <li>اضغط على <strong>ربط جهاز</strong>:
                <br>• إذا أردت استخدام الكود: اختر <strong>"الربط باستخدام رقم الهاتف"</strong> واكتب الكود الأخضر.
                <br>• إذا أردت الكاميرا: وجّه الكاميرا نحو رمز الـ QR أعلاه.
              </li>
            </ol>
          </div>
        </div>
      </div>

      <script>
        let isFetching = false;

        async function fetchNewCodes() {
          if (isFetching) return;
          isFetching = true;
          const btn = document.getElementById('btnRefresh');
          const codeDisplay = document.getElementById('codeDisplay');
          const qrImg = document.getElementById('qrImg');

          btn.innerText = '⏳ جاري التوليد من واتساب...';
          btn.disabled = true;
          codeDisplay.innerText = '⏳ جاري التحميل...';

          try {
            const res = await fetch('/api/whatsapp-session/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: '01005437633' })
            });
            const json = await res.json();
            const data = json.data || {};

            if (data.pairingCode) {
              codeDisplay.innerText = data.pairingCode;
            } else {
              codeDisplay.innerText = 'تعذر توليد الكود';
            }

            if (data.qrCodeDataUrl) {
              qrImg.src = data.qrCodeDataUrl;
            }
          } catch (e) {
            codeDisplay.innerText = 'حدث خطأ';
            alert('حدث خطأ أثناء التوليد، يرجى المحاولة بعد قليل.');
          } finally {
            btn.innerText = '🔄 توليد كود و QR جديد الآن';
            btn.disabled = false;
            isFetching = false;
          }
        }

        // Silent connection check without modifying QR or Code
        async function checkConnection() {
          try {
            const res = await fetch('/api/whatsapp-session/status');
            const json = await res.json();
            if (json.data && json.data.status === 'connected') {
              document.getElementById('mainContainer').innerHTML = \`
                <div class="success-box">
                  <h2 style="font-size: 1.6rem; margin-bottom: 10px; color:#4ade80;">✅ تم ربط الواتساب بنجاح!</h2>
                  <p style="color:#bbf7d0; font-size:1rem; margin-bottom:0;">الرقم <strong>01005437633</strong> متصل بالسيرفر الآن ومحفوظ في قاعدة البيانات، والمساعد الذكي جاهز للرد على العملاء تلقائياً 👑💈</p>
                </div>
              \`;
            }
          } catch (e) {}
        }

        // Auto load once on open
        fetchNewCodes();
        setInterval(checkConnection, 3000);
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
