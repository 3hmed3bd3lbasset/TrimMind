import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { AGENT_API_SECRET } from '../config/jwt.js';
import {
  getWhatsAppState,
  initWhatsApp,
  resetWhatsAppSession,
  generatePairingCode,
  getOrGenerateQRCode,
  sendWhatsAppText,
  getDebugLogs,
} from '../services/whatsapp.service.js';

const router = Router();

function timingSafeStringCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireManagerOrAgent(req: Request, res: Response, next: any) {
  const secretHeader = req.headers['x-agent-secret'] || req.headers['x-api-key'] || (req.query as any)?.secret || (req.query as any)?.key;
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const providedKey = (secretHeader as string) || bearerToken;

  if (providedKey && timingSafeStringCompare(providedKey, AGENT_API_SECRET)) {
    return next();
  }

  // Fallback to Manager JWT Auth
  return requireAuth(req as any, res, () => {
    return requireRoles('manager')(req as any, res, next);
  });
}

// 1. Get WhatsApp status
router.get('/status', async (_req: Request, res: Response) => {
  const state = getWhatsAppState();
  res.json({
    success: true,
    data: state,
  });
});

router.get('/debug-logs', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    state: getWhatsAppState(),
    logs: getDebugLogs(),
  });
});

// 2. Request QR Code
router.post('/get-qr', async (req: Request, res: Response) => {
  try {
    const forceReset = req.body?.force === true;
    const qrDataUrl = await getOrGenerateQRCode(forceReset);
    const state = getWhatsAppState();
    res.json({
      success: true,
      message: 'تم تجهيز رمز الـ QR بنجاح.',
      data: {
        qrCodeDataUrl: qrDataUrl,
        status: state.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Request Pairing Code
router.post('/pair', async (req: Request, res: Response) => {
  try {
    const { phone = '01005437633' } = req.body;
    const code = await generatePairingCode(phone);
    const state = getWhatsAppState();
    res.json({
      success: true,
      message: 'تم توليد كود الربط بنجاح.',
      data: {
        phone,
        pairingCode: code,
        status: state.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Reset Session
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    const state = await resetWhatsAppSession();
    res.json({
      success: true,
      message: 'تمت إعادة تهيئة جلسة الواتساب بنجاح.',
      data: state,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Send Test / Production WhatsApp message (Protected)
router.post('/send', requireManagerOrAgent, async (req: Request, res: Response) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({
        success: false,
        error: 'يجب توفير رقم المستلم (to) ونص الرسالة (text).',
      });
    }

    await sendWhatsAppText(to, text);
    res.json({
      success: true,
      message: 'تم إرسال الرسالة بنجاح.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || 'فشل إرسال الرسالة عبر واتساب.',
    });
  }
});

// 6. Interactive Dual Web UI (QR & Code)
router.get(['/qr', '/page'], async (_req: Request, res: Response) => {
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
      <title>ربط واتساب صالون TrimMind الذكي</title>
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
          max-width: 520px;
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
        
        .tabs {
          display: flex;
          background: #0a1210;
          padding: 4px;
          border-radius: 14px;
          margin-bottom: 20px;
          border: 1px solid #192b25;
        }
        .tab-btn {
          flex: 1;
          padding: 10px;
          font-family: inherit;
          font-size: 0.92rem;
          font-weight: 700;
          background: transparent;
          border: none;
          color: #85a89d;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-btn.active {
          background: #10b981;
          color: #05261d;
          font-weight: 800;
        }

        .tab-content { display: none; }
        .tab-content.active { display: block; }

        .qr-wrapper {
          background: #ffffff;
          padding: 14px;
          border-radius: 20px;
          display: inline-block;
          margin: 10px 0 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }
        .qr-img {
          width: 230px;
          height: 230px;
          display: block;
          object-fit: contain;
          border-radius: 12px;
        }

        .code-section {
          background: #0a1210;
          border: 2px solid #10b981;
          border-radius: 20px;
          padding: 24px 20px;
          margin-bottom: 20px;
        }
        .pairing-code {
          font-size: 2.4rem;
          font-weight: 900;
          letter-spacing: 6px;
          color: #34d399;
          font-family: monospace;
          background: #101a18;
          padding: 12px;
          border-radius: 12px;
          display: inline-block;
          min-width: 240px;
          margin: 12px 0;
          border: 1px dashed #285446;
          user-select: all;
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
          padding: 12px 24px;
          border-radius: 999px;
          border: none;
          cursor: pointer;
          width: 100%;
          margin-bottom: 14px;
          box-shadow: 0 4px 14px rgba(16,185,129,0.3);
          transition: all 0.15s;
        }
        .btn-refresh:hover { background: #34d399; }
        .btn-refresh:active { transform: scale(0.98); }

        .btn-reset {
          background: transparent;
          color: #ef4444;
          border: 1px solid #7f1d1d;
          padding: 8px 16px;
          border-radius: 999px;
          font-family: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          margin-top: 10px;
        }
        .btn-reset:hover { background: rgba(239, 68, 68, 0.1); }

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
        .warning-box {
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid #d97706;
          color: #fde68a;
          padding: 12px;
          border-radius: 14px;
          font-size: 0.85rem;
          margin-bottom: 16px;
          text-align: right;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">💈 صالون TrimMind - ربط واتساب</div>
        <div id="mainContainer">
          <h1>ربط رقم الصالون بالذكاء الاصطناعي</h1>
          <p>الرقم المسجل: <strong style="color:#5eead4;">01005437633</strong></p>

          <div class="warning-box">
            ⚠️ <strong>ملاحظة هامة:</strong> إذا كان هناك جهاز مرتبط سابقاً في واتساب هاتفك، يرجى تسجيل الخروج منه أولاً من تطبيق واتساب (الأجهزة المرتبطة).
          </div>

          <!-- TABS -->
          <div class="tabs">
            <button id="tabQrBtn" class="tab-btn active" onclick="switchTab('qr')">📷 مسح رمز QR (كاميرا)</button>
            <button id="tabCodeBtn" class="tab-btn" onclick="switchTab('code')">🔢 كود بالأرقام (بدون كاميرا)</button>
          </div>

          <!-- TAB 1: QR CODE -->
          <div id="tabQr" class="tab-content active">
            <div class="qr-wrapper">
              <img id="qrImg" class="qr-img" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='230' height='230' viewBox='0 0 230 230'><rect width='230' height='230' fill='%23ffffff'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%23666'>جاري تجهيز رمز الـ QR...</text></svg>" alt="WhatsApp QR Code" />
            </div>
            <button id="btnRefreshQr" class="btn-refresh" onclick="fetchQrCode()">🔄 تحديث رمز الـ QR</button>
            <div class="steps">
              <strong style="color:#ffffff; display:block; margin-bottom:8px;">💡 خطوات مسح الـ QR:</strong>
              <ol>
                <li>افتح <strong>واتساب</strong> على الهاتف (01005437633).</li>
                <li>القائمة (الثلاث نقاط) ⬅️ <strong>الأجهزة المرتبطة (Linked Devices)</strong>.</li>
                <li>اضغط <strong>ربط جهاز (Link a device)</strong> ووجّه الكاميرا للرمز أعلاه.</li>
              </ol>
            </div>
          </div>

          <!-- TAB 2: PAIRING CODE -->
          <div id="tabCode" class="tab-content">
            <div class="code-section">
              <div style="font-weight:700; color:#a7f3d0;">كود الربط برقم الهاتف:</div>
              <div id="codeDisplay" class="pairing-code">اضغط للتوليد</div>
              <div style="font-size:0.82rem; color:#85a89d;">انسخ هذا الكود واكتبه في تطبيق واتساب</div>
            </div>
            <button id="btnRefreshCode" class="btn-refresh" onclick="fetchPairingCode()">🔄 توليد كود جديد</button>
            <div class="steps">
              <strong style="color:#ffffff; display:block; margin-bottom:8px;">💡 خطوات إدخال الكود:</strong>
              <ol>
                <li>افتح واتساب ⬅️ <strong>الأجهزة المرتبطة</strong> ⬅️ <strong>ربط جهاز</strong>.</li>
                <li>اختر <strong>"الربط باستخدام رقم الهاتف بدلاً من ذلك"</strong>.</li>
                <li>أدخل كود الدولة (+20) ورقمك ثم اكتب الكود الأخضر أعلاه.</li>
              </ol>
            </div>
          </div>

          <div>
            <button class="btn-reset" onclick="resetSession()">🗑️ إعادة تعيين الجلسة والبدء من جديد</button>
          </div>
        </div>
      </div>

      <script>
        let activeTab = 'qr';

        function switchTab(tab) {
          activeTab = tab;
          document.getElementById('tabQrBtn').classList.toggle('active', tab === 'qr');
          document.getElementById('tabCodeBtn').classList.toggle('active', tab === 'code');
          document.getElementById('tabQr').classList.toggle('active', tab === 'qr');
          document.getElementById('tabCode').classList.toggle('active', tab === 'code');

          if (tab === 'qr') fetchQrCode();
          else fetchPairingCode();
        }

        async function fetchQrCode(force = false) {
          const btn = document.getElementById('btnRefreshQr');
          const qrImg = document.getElementById('qrImg');
          btn.innerText = '⏳ جاري تجهيز QR من واتساب...';
          btn.disabled = true;

          try {
            const res = await fetch('/api/whatsapp-session/get-qr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ force })
            });
            const json = await res.json();
            if (json.data && json.data.qrCodeDataUrl) {
              qrImg.src = json.data.qrCodeDataUrl;
            } else if (json.data && json.data.status === 'connected') {
              showSuccess();
            }
          } catch (e) {
            console.error(e);
          } finally {
            btn.innerText = '🔄 تحديث رمز الـ QR';
            btn.disabled = false;
          }
        }

        async function fetchPairingCode() {
          const btn = document.getElementById('btnRefreshCode');
          const codeDisplay = document.getElementById('codeDisplay');
          btn.innerText = '⏳ جاري طلب الكود...';
          btn.disabled = true;
          codeDisplay.innerText = '⏳ جاري التحميل...';

          try {
            const res = await fetch('/api/whatsapp-session/pair', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: '01005437633' })
            });
            const json = await res.json();
            if (json.data && json.data.pairingCode) {
              codeDisplay.innerText = json.data.pairingCode;
            } else if (json.data && json.data.status === 'connected') {
              showSuccess();
            } else {
              codeDisplay.innerText = 'اضغط تحديث';
            }
          } catch (e) {
            codeDisplay.innerText = 'حدث خطأ';
          } finally {
            btn.innerText = '🔄 توليد كود جديد';
            btn.disabled = false;
          }
        }

        async function resetSession() {
          if (!confirm('هل تريد بالتأكيد إعادة تهيئة جلسة الواتساب ومسح الروابط السابقة؟')) return;
          try {
            await fetch('/api/whatsapp-session/reset', { method: 'POST' });
            alert('تمت إعادة التهيئة بنجاح، جاري طلب كود/QR جديد.');
            if (activeTab === 'qr') fetchQrCode(true);
            else fetchPairingCode();
          } catch (e) {
            alert('تعذر إعادة التهيئة');
          }
        }

        function showSuccess() {
          document.getElementById('mainContainer').innerHTML = \`
            <div class="success-box">
              <h2 style="font-size: 1.6rem; margin-bottom: 10px; color:#4ade80;">✅ تم ربط الواتساب بنجاح!</h2>
              <p style="color:#bbf7d0; font-size:1rem; margin-bottom:20px;">الرقم <strong>01005437633</strong> متصل بالسيرفر الآن، والمساعد الذكي جاهز للرد على العملاء تلقائياً 👑💈</p>
              <button class="btn-reset" style="background:#991b1b; color:#ffffff; border:none; padding:10px 24px; font-size:0.92rem; border-radius:999px; cursor:pointer;" onclick="resetSession()">🔄 قطع الاتصال وإعادة الربط برقم جديد</button>
            </div>
          \`;
        }

        async function checkConnection() {
          try {
            const res = await fetch('/api/whatsapp-session/status');
            const json = await res.json();
            if (json.data && json.data.status === 'connected') {
              showSuccess();
            }
          } catch (e) {}
        }

        fetchQrCode();
        setInterval(checkConnection, 2500);
      </script>
    </body>
    </html>
  `);
});

export default router;
