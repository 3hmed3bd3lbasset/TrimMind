import { Router, Request, Response } from 'express';
import { getWhatsAppState, initWhatsApp, sendWhatsAppText } from '../services/whatsapp.service.js';

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

// 2. Restart socket for fresh QR code
router.post('/refresh-qr', async (_req: Request, res: Response) => {
  try {
    await initWhatsApp();
    // Wait for new QR
    for (let i = 0; i < 10; i++) {
      const state = getWhatsAppState();
      if (state.qrCodeDataUrl || state.status === 'connected') {
        return res.json({ success: true, data: state });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    res.json({ success: true, data: getWhatsAppState() });
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

// 4. Interactive Live QR Scanner Portal with Countdown & Refresh Button
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
        h1 { font-size: 1.35rem; font-weight: 800; margin-bottom: 6px; color: #ffffff; }
        p { font-size: 0.92rem; color: #9bb3aa; margin-bottom: 16px; line-height: 1.5; }
        .qr-wrapper {
          background: #ffffff;
          padding: 14px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
          position: relative;
        }
        .qr-img { width: 220px; height: 220px; display: block; border-radius: 8px; }
        .timer-bar-bg {
          width: 100%;
          height: 6px;
          background: #1c2b26;
          border-radius: 999px;
          overflow: hidden;
          margin: 10px 0 18px 0;
        }
        .timer-bar {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #34d399);
          width: 100%;
          transition: width 1s linear;
        }
        .btn-refresh {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #10b981;
          color: #06281e;
          font-family: inherit;
          font-size: 0.95rem;
          font-weight: 800;
          padding: 10px 24px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          margin-bottom: 16px;
          transition: all 0.15s;
        }
        .btn-refresh:hover { background: #34d399; }
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
        .spinner {
          display: inline-block;
          width: 40px;
          height: 40px;
          border: 4px solid #1c2b26;
          border-top-color: #34d399;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
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
        <div class="badge">💈 صالون TrimMind - مساعد الحجز الذكي</div>
        <div id="content">
          <div style="padding: 40px 0;">
            <div class="spinner"></div>
            <p style="margin-top: 16px; color: #5eead4;">جاري تجهيز رمز الربط لـ 01005437633...</p>
          </div>
        </div>
      </div>

      <script>
        let currentQr = '';
        let timerSeconds = 20;
        let timerInterval = null;

        function startTimer() {
          timerSeconds = 20;
          if (timerInterval) clearInterval(timerInterval);
          timerInterval = setInterval(() => {
            timerSeconds--;
            const bar = document.getElementById('timerBar');
            const txt = document.getElementById('timerText');
            if (bar) bar.style.width = (timerSeconds / 20 * 100) + '%';
            if (txt) txt.innerText = 'صلاحية الرمز: ' + timerSeconds + ' ثانية';
            if (timerSeconds <= 0) {
              clearInterval(timerInterval);
              checkStatus();
            }
          }, 1000);
        }

        async function manualRefresh() {
          const btn = document.getElementById('btnRefresh');
          if (btn) {
            btn.innerText = '⏳ جاري تحديث الرمز...';
            btn.disabled = true;
          }
          await fetch('/api/whatsapp-session/refresh-qr', { method: 'POST' });
          await checkStatus();
        }

        async function checkStatus() {
          try {
            const res = await fetch('/api/whatsapp-session/status');
            const json = await res.json();
            const data = json.data || {};
            const content = document.getElementById('content');

            if (data.status === 'connected') {
              if (timerInterval) clearInterval(timerInterval);
              content.innerHTML = \`
                <div class="success-box">
                  <h2 style="font-size: 1.5rem; margin-bottom: 8px; color:#4ade80;">✅ تم ربط الواتساب بنجاح!</h2>
                  <p style="color:#bbf7d0; margin-bottom:0;">الرقم <strong>01005437633</strong> متصل بالسيرفر ومحفوظ في قاعدة البيانات، ومساعد الذكاء الاصطناعي يستقبل الرسائل ويرد عليها تلقائياً 👑💈</p>
                </div>
              \`;
              return;
            }

            if (data.qrCodeDataUrl) {
              if (data.qrCodeDataUrl !== currentQr) {
                currentQr = data.qrCodeDataUrl;
                startTimer();
              }

              content.innerHTML = \`
                <h1>امسح رمز QR لربط الرقم</h1>
                <p>لربط رقم الصالون: <strong style="color:#5eead4;">01005437633</strong></p>
                
                <div class="qr-wrapper">
                  <img class="qr-img" src="\${data.qrCodeDataUrl}" alt="QR Code" />
                </div>

                <div class="timer-bar-bg"><div id="timerBar" class="timer-bar"></div></div>
                <div id="timerText" style="font-size:0.8rem; color:#85a89d; margin-bottom:12px;">صلاحية الرمز: \${timerSeconds} ثانية</div>

                <button id="btnRefresh" class="btn-refresh" onclick="manualRefresh()">
                  🔄 توليد رمز QR جديد طازج
                </button>

                <div class="steps">
                  <ol>
                    <li>افتح تطبيق <strong>WhatsApp</strong> على هاتفك (01005437633).</li>
                    <li>اضغط على <strong>الثلاث نقاط ⚙️</strong> ثم <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</li>
                    <li>اضغط على <strong>ربط جهاز (Link a Device)</strong> ووجّه الكاميرا نحو الرمز أعلاه.</li>
                  </ol>
                </div>
              \`;
            }
          } catch (e) {
            console.error(e);
          }
        }

        checkStatus();
        setInterval(checkStatus, 3000);
      </script>
    </body>
    </html>
  `);
});

export default router;
