import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Plus,
  Copy,
  ShieldCheck,
  Zap,
  Clock,
  KeyRound,
  Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const WhatsAppConnectionManager: React.FC = () => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'qr_ready'>('disconnected');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [inputPhone, setInputPhone] = useState<string>('01005437633');
  const [loading, setLoading] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<'qr' | 'code'>('qr');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);

  const pollTimerRef = useRef<any>(null);

  // Fetch status on load
  const fetchStatus = async () => {
    try {
      const res: any = await api.getWhatsAppStatus();
      if (res?.success && res?.data) {
        setStatus(res.data.status);
        setPhoneNumber(res.data.phoneNumber || res.data.phone || null);
        setLastConnectedAt(res.data.lastConnectedAt || null);
        if (res.data.qrCodeDataUrl) setQrCodeDataUrl(res.data.qrCodeDataUrl);
        if (res.data.pairingCode) setPairingCode(res.data.pairingCode);
      }
    } catch (err) {
      console.warn('WhatsApp status fetch note:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll status every 4 seconds while awaiting connection
    pollTimerRef.current = setInterval(() => {
      fetchStatus();
    }, 4000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Watch for status changes to clear QR on connection
  useEffect(() => {
    if (status === 'connected') {
      setQrCodeDataUrl(null);
      setPairingCode(null);
    }
  }, [status]);

  // Generate QR Code
  const handleGenerateQR = async (force = true) => {
    setLoading(true);
    setPairingCode(null);
    try {
      const res: any = await api.getWhatsAppQR(force);
      if (res?.success && res?.data) {
        if (res.data.qrCodeDataUrl) {
          setQrCodeDataUrl(res.data.qrCodeDataUrl);
          setStatus('qr_ready');
          toast.success('تم توليد رمز الـ QR بنجاح! امسح الرمز من هاتفك الآن');
        } else if (res.data.status === 'connected') {
          setStatus('connected');
          toast.success('الرقم متصل ومربوط بالفعل!');
        } else {
          toast('جاري تجهيز الكود من السيرفر، يرجى الانتظار ثواني...', { icon: '⏳' });
          setTimeout(fetchStatus, 2000);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل توليد رمز الـ QR، يرجى المحاولة ثانية');
    } finally {
      setLoading(false);
    }
  };

  // Generate Pairing Code (8 digits)
  const handleGeneratePairingCode = async () => {
    if (!inputPhone || inputPhone.trim().length < 9) {
      toast.error('يرجى إدخال رقم هاتف واتساب صحيح');
      return;
    }
    setLoading(true);
    setQrCodeDataUrl(null);
    try {
      const res: any = await api.pairWhatsAppPhone(inputPhone.trim());
      if (res?.success && res?.data?.pairingCode) {
        setPairingCode(res.data.pairingCode);
        setStatus('qr_ready');
        toast.success('تم توليد كود الربط بنجاح!');
      } else {
        toast('جاري تجهيز كود الربط، اضغط مرة أخرى بعد ثوانٍ', { icon: '⏳' });
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل توليد كود الربط');
    } finally {
      setLoading(false);
    }
  };

  // Reset / Disconnect Session
  const handleResetSession = async () => {
    setIsDeleting(true);
    try {
      const res: any = await api.resetWhatsAppSession();
      if (res?.success) {
        setStatus('disconnected');
        setPhoneNumber(null);
        setQrCodeDataUrl(null);
        setPairingCode(null);
        setShowConfirmDelete(false);
        toast.success('تم حذف وإلغاء ربط رقم الواتساب بنجاح ✅');
        fetchStatus();
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل إلغاء ربط الرقم');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ الكود للحافظة');
  };

  const isConnected = status === 'connected';

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-forest" />
            <span>ربط وإدارة رقم الواتساب (WhatsApp Connection)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">
            ربط رقم واتساب الصالون لتأكيد الحجوزات، إرسال الفواتير التلقائية، وحملات إعادة جذب العملاء
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-paper-warm border border-border text-ink-soft hover:text-ink hover:border-forest transition-colors font-bold text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث الحالة</span>
          </button>
        </div>
      </div>

      {/* 1. Live Connection Status Card */}
      <div className="clinic-card p-6 shadow-clinic-2 bg-white/95 border border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-clinic-1 ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
              }`}
            >
              {isConnected ? <CheckCircle2 className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-serif font-bold text-base text-ink">
                  {isConnected ? 'رقم الواتساب متصل ومربوط بنجاح' : 'لا يوجد رقم واتساب مربوط حالياً'}
                </h4>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isConnected
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {isConnected ? 'متصل وشغال (Online)' : 'غير متصل (Disconnected)'}
                </span>
              </div>

              <div className="mt-1 text-[11px] text-ink-mute flex flex-wrap items-center gap-x-4 gap-y-1">
                {phoneNumber && (
                  <span className="font-mono font-bold text-ink-soft bg-paper-warm px-2 py-0.5 rounded-md border border-border">
                    رقم الهاتف: {phoneNumber}
                  </span>
                )}
                {lastConnectedAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-forest" />
                    <span>تاريخ آخر اتصال: {new Date(lastConnectedAt).toLocaleString('ar-EG')}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف / إلغاء ربط الرقم</span>
              </button>
            ) : (
              <button
                onClick={() => handleGenerateQR(true)}
                disabled={loading}
                className="btn-clinic-primary text-xs font-bold shadow-clinic-1 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة وربط رقم جديد</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Deleting/Disconnecting */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-border space-y-4 text-right">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="font-serif font-bold text-base text-ink">تأكيد إلغاء ربط رقم الواتساب</h4>
              <p className="text-[11px] text-ink-mute">
                هل أنت متأكد من رغبتك في حذف جلسة الواتساب الحالية؟ سيتوقف إرسال الرسائل التلقائية حتى يتم ربط رقم جديد.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl border border-border bg-paper-warm hover:bg-paper text-ink font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleResetSession}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>تأكيد الحذف والقطع</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Link / Pair WhatsApp Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Card: Dynamic QR Code & Code Generator */}
        <div className="lg:col-span-7 clinic-card p-6 shadow-clinic-2 bg-white/95 border border-border space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2">
              <QrCode className="w-4 h-4 text-forest" />
              <span>طريقة ربط رقم الواتساب:</span>
            </h4>

            <div className="flex items-center gap-1 bg-paper-warm p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setActiveMode('qr')}
                className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                  activeMode === 'qr'
                    ? 'bg-forest text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>رمز الـ QR</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('code')}
                className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                  activeMode === 'code'
                    ? 'bg-forest text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>كود التحقق (8 أرقام)</span>
              </button>
            </div>
          </div>

          {/* Mode 1: QR Code */}
          {activeMode === 'qr' && (
            <div className="space-y-4 text-center">
              <p className="text-[11px] text-ink-mute">
                اضغط على زر التوليد لتوليد رمز QR خاص برقمك، ثم امسحه بكاميرا الواتساب لربطه فوراً.
              </p>

              {qrCodeDataUrl ? (
                <div className="space-y-3">
                  <div className="p-4 bg-white inline-block rounded-3xl border-2 border-forest/30 shadow-lg">
                    <img
                      src={qrCodeDataUrl}
                      alt="WhatsApp QR Code"
                      className="w-56 h-56 mx-auto object-contain rounded-2xl"
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[11px] font-bold text-forest">
                      في انتظار المسح من هاتفك... سيتم الربط تلقائياً
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleGenerateQR(true)}
                      disabled={loading}
                      className="px-4 py-2 rounded-xl bg-paper-warm hover:bg-paper border border-border text-ink-soft font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      <span>تحديث رمز الـ QR</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-border rounded-3xl bg-paper-warm/50 flex flex-col items-center justify-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-forest/10 text-forest flex items-center justify-center">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h5 className="font-bold text-ink text-sm">جاهز لتوليد رمز الـ QR</h5>
                    <p className="text-[11px] text-ink-mute">اضغط على الزر بالأسفل لبدء جلسة جديدة وربط أي رقم هاتف</p>
                  </div>
                  <button
                    onClick={() => handleGenerateQR(true)}
                    disabled={loading}
                    className="btn-clinic-primary text-xs font-bold shadow-clinic-1 px-6 py-2.5 flex items-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>توليد رمز QR لتسجيل الدخول</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: 8-Digit Pairing Code */}
          {activeMode === 'code' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="font-bold text-ink-soft">أدخل رقم هاتف الواتساب المطلوب ربطه:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputPhone}
                    onChange={(e) => setInputPhone(e.target.value)}
                    placeholder="مثال: 01005437633"
                    dir="ltr"
                    className="flex-1 bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink font-mono outline-none text-left"
                  />
                  <button
                    onClick={handleGeneratePairingCode}
                    disabled={loading}
                    className="btn-clinic-primary text-xs font-bold shadow-clinic-1 px-4 py-2.5 flex items-center gap-1.5 shrink-0"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    <span>توليد كود الربط</span>
                  </button>
                </div>
              </div>

              {pairingCode && (
                <div className="p-5 rounded-2xl bg-paper-warm border-2 border-forest/40 text-center space-y-3">
                  <div className="text-[11px] font-bold text-forest">كود الربط الخاص بك المكون من 8 أرقام:</div>
                  <div className="font-mono text-3xl font-black text-forest tracking-widest bg-white py-3 px-4 rounded-xl border border-forest/20 shadow-inner flex items-center justify-center gap-4">
                    <span>{pairingCode}</span>
                    <button
                      onClick={() => copyToClipboard(pairingCode)}
                      className="p-1.5 rounded-lg hover:bg-forest/10 text-forest transition-colors"
                      title="نسخ الكود"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-ink-mute">
                    افتح إشعار الواتساب في هاتفك وأدخل هذا الكود للموافقة على الربط فوراً.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Card: Step-by-Step Instructions */}
        <div className="lg:col-span-5 clinic-card p-6 shadow-clinic-2 bg-white/95 border border-border space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-3">
              <ShieldCheck className="w-4 h-4 text-forest" />
              <span>خطوات الربط خطوة بخطوة:</span>
            </h4>

            <ol className="space-y-3 text-[11px] text-ink-soft pr-4 list-decimal marker:text-forest marker:font-bold">
              <li className="pl-1">
                افتح تطبيق <strong className="text-ink">WhatsApp</strong> على الهاتف الخاص بالصالون.
              </li>
              <li className="pl-1">
                اضغط على القائمة <strong>(الثلاث نقاط أو الإعدادات)</strong> ⚙️.
              </li>
              <li className="pl-1">
                اختر <strong className="text-forest font-bold">الأجهزة المرتبطة (Linked Devices)</strong>.
              </li>
              <li className="pl-1">
                اضغط على زر <strong className="text-ink">ربط جهاز (Link a Device)</strong>.
              </li>
              <li className="pl-1">
                وجّه كاميرا الهاتف نحو <strong className="text-forest font-bold">رمز الـ QR</strong> الظاهر بالشاشة.
              </li>
            </ol>
          </div>

          <div className="p-3.5 rounded-2xl bg-forest/5 border border-forest/20 text-[10px] text-forest space-y-1">
            <div className="font-bold flex items-center gap-1">
              <Radio className="w-3 h-3" />
              <span>تنبيه مهم:</span>
            </div>
            <p className="text-ink-mute">
              الربط يعمل بميزة الأجهزة المتعددة (Multi-Device)، مما يعني أن النظام سيظل متصلاً حتى لو كان هاتفك غير متصل بالإنترنت بعد نجاح الربط لأول مرة.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
