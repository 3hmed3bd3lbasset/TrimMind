import { Router, Request, Response } from 'express';
import { getWhatsAppState, initWhatsApp, sendWhatsAppText } from '../services/whatsapp.service.js';

const router = Router();

// 1. Get WhatsApp connection status and active pairing code / QR
router.get('/status', async (_req: Request, res: Response) => {
  const state = getWhatsAppState();
  res.json({
    success: true,
    data: state,
  });
});

// 2. Request WhatsApp Pairing Code for a specific phone number
router.post('/pair', async (req: Request, res: Response) => {
  try {
    const { phone = '01005437633' } = req.body;
    await initWhatsApp(phone);

    // Give Baileys a moment to request the code
    setTimeout(() => {
      const state = getWhatsAppState();
      res.json({
        success: true,
        message: 'تم طلب كود الربط لواتساب بنجاح.',
        data: {
          phone,
          pairingCode: state.pairingCode,
          status: state.status,
          qrCodeDataUrl: state.qrCodeDataUrl,
        },
      });
    }, 3500);
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

// 4. View QR Code HTML page
router.get('/qr', async (_req: Request, res: Response) => {
  const state = getWhatsAppState();
  if (state.status === 'connected') {
    return res.send(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head><meta charset="utf-8"><title>WhatsApp Connected</title>
      <style>body{font-family:sans-serif;background:#0e1614;color:#e8ede9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
      </head>
      <body>
        <div style="text-align:center;background:#182622;padding:40px;border-radius:24px;border:1px solid #2e4a42;">
          <h1 style="color:#4ade80;">✅ واتساب متصل وجاهز للعمل!</h1>
          <p>رقم الهاتف: ${state.phoneNumber || '01005437633'}</p>
          <p>المساعد الذكي يعمل الآن ويرد على الرسائل تلقائياً.</p>
        </div>
      </body>
      </html>
    `);
  }

  if (state.pairingCode) {
    return res.send(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head><meta charset="utf-8"><title>WhatsApp Pairing Code</title>
      <style>body{font-family:sans-serif;background:#0e1614;color:#e8ede9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
      </head>
      <body>
        <div style="text-align:center;background:#182622;padding:40px;border-radius:24px;border:1px solid #2e4a42;">
          <h2 style="color:#d4af37;">📲 كود ربط واتساب للرقم ${state.phoneNumber || '01005437633'}</h2>
          <div style="font-size:36px;font-weight:bold;letter-spacing:6px;background:#0e1614;padding:15px;border-radius:12px;margin:20px 0;color:#6ee7b7;">
            ${state.pairingCode}
          </div>
          <p>افتح واتساب من هاتفك -> الأجهزة المرتبطة -> ربط باستخدام رقم الهاتف -> واكتب هذا الكود.</p>
        </div>
      </body>
      </html>
    `);
  }

  if (state.qrCodeDataUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html dir="rtl">
      <head><meta charset="utf-8"><title>WhatsApp QR Code</title>
      <style>body{font-family:sans-serif;background:#0e1614;color:#e8ede9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
      </head>
      <body>
        <div style="text-align:center;background:#182622;padding:40px;border-radius:24px;border:1px solid #2e4a42;">
          <h2>📷 امسح الـ QR Code من تطبيق واتساب</h2>
          <img src="${state.qrCodeDataUrl}" style="width:280px;height:280px;border-radius:16px;margin:20px 0;" />
          <p>افتح واتساب -> الأجهزة المرتبطة -> ربط جهاز -> ووجه الكاميرا نحو الرمز.</p>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
    <head><meta charset="utf-8"><title>WhatsApp Connecting</title>
    <meta http-equiv="refresh" content="3">
    <style>body{font-family:sans-serif;background:#0e1614;color:#e8ede9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
    </head>
    <body>
      <div style="text-align:center;background:#182622;padding:40px;border-radius:24px;">
        <h2>⏳ جاري إنشاء كود الربط...</h2>
        <p>سيتم تحديث الصفحة تلقائياً خلال ثوانٍ.</p>
      </div>
    </body>
    </html>
  `);
});

export default router;
