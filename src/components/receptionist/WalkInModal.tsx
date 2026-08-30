import React, { useState, useEffect } from 'react';
import { useSalonStore } from '../../lib/store';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { Chair, Booking } from '../../types';
import { formatCurrency, format12Hour } from '../../lib/utils';
import {
  UserPlus,
  Calendar,
  X,
  Scissors,
  Armchair,
  Phone,
  CheckCircle2,
  Sparkles,
  Check,
  DollarSign,
  Receipt,
  Wallet,
  Copy,
  MessageCircle,
  ExternalLink,
  Clock,
  Shield,
  Crown,
  ChevronRight,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface WalkInModalProps {
  branchId: string;
  isOpen: boolean;
  onClose: () => void;
  preSelectedChair?: Chair | null;
}

export const WalkInModal: React.FC<WalkInModalProps> = ({
  branchId,
  isOpen,
  onClose,
  preSelectedChair,
}) => {
  const {
    services,
    barbers,
    chairs,
    bookings,
    settings,
    addWalkInBooking,
    createBooking,
  } = useSalonStore();

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const branchBarbers = barbers.filter(
    (b) => b.is_active && (b.branch_id === branchId || !b.branch_id)
  );
  const branchChairs = chairs.filter(
    (c) => c.is_active && c.branch_id === branchId
  );

  // Form Mode: 'walkin_seat' (تسكين فوري على الكرسي) vs 'new_booking' (إنشاء حجز في الطابور/المواعيد)
  const [modalMode, setModalMode] = useState<'walkin_seat' | 'new_booking'>('walkin_seat');

  // Customer info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('01');
  const [bookingType, setBookingType] = useState<'normal' | 'vip'>('normal');

  // Service & Custom pricing
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [isCustomService, setIsCustomService] = useState(false);
  const [customServiceName, setCustomServiceName] = useState('');
  const [customPrice, setCustomPrice] = useState<number | ''>(250);

  // Barber & Chair
  const [barberId, setBarberId] = useState(branchBarbers[0]?.id || '');
  const [chairId, setChairId] = useState(
    preSelectedChair?.id || branchChairs[0]?.id || ''
  );
  const [notes, setNotes] = useState('');

  // Manual Deposit Collection State
  const [isManualDepositCollected, setIsManualDepositCollected] = useState(true);
  const [depositPaymentMethod, setDepositPaymentMethod] = useState<'cash' | 'vodafone_cash' | 'instapay'>('cash');
  const [depositAmount, setDepositAmount] = useState<number | ''>(50);

  // Submitting & Created Booking Receipt state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSuccessBooking, setCreatedSuccessBooking] = useState<{
    id: string;
    customerName: string;
    customerPhone: string;
    serviceName: string;
    barberName: string;
    bookingType: 'normal' | 'vip';
    queueNumber?: number;
    startsAt: string;
    totalAmount: number;
    depositAmount: number;
    secureToken: string;
    trackingUrl: string;
  } | null>(null);

  // Adjust default deposit when booking type or service price changes
  useEffect(() => {
    if (bookingType === 'vip') {
      setDepositAmount(settings.booking_fee_vip || 100);
    } else {
      setDepositAmount(settings.booking_fee_normal || 50);
    }
  }, [bookingType, settings]);

  if (!isOpen) return null;

  const currentBarber = branchBarbers.find((b) => b.id === barberId);
  const currentService = services.find((s) => s.id === serviceId);
  const resolvedServicePrice = isCustomService
    ? Number(customPrice || 250)
    : currentService?.price || 180;
  const resolvedServiceName = isCustomService
    ? customServiceName.trim() || 'خدمة وباقة مخصصة'
    : currentService?.name || 'قص شعر وتصفيف كلاسيكي';

  const resetForm = () => {
    setCustomerName('');
    setCustomerPhone('01');
    setIsCustomService(false);
    setCustomServiceName('');
    setCustomPrice(250);
    setNotes('');
    setCreatedSuccessBooking(null);
  };

  const handleModalClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }

    let cleanPhone = customerPhone.trim();
    if (!cleanPhone || cleanPhone === '01') {
      cleanPhone = '01000000000';
    }

    if (isCustomService && (!customServiceName.trim() || !customPrice || Number(customPrice) <= 0)) {
      toast.error('يرجى إدخال اسم الخدمة والسعر المخصص بشكل صحيح');
      return;
    }

    setIsSubmitting(true);

    try {
      const numericDeposit = isManualDepositCollected ? Number(depositAmount || 50) : 0;
      const nowISO = new Date().toISOString();

      if (modalMode === 'walkin_seat') {
        // Mode 1: Instant Walk-in Seating on Chair (starts immediately)
        addWalkInBooking({
          branchId,
          customerName: customerName.trim(),
          customerPhone: cleanPhone,
          serviceId: isCustomService ? 'srv-custom' : serviceId,
          barberId: barberId || branchBarbers[0]?.id || '',
          chairId: chairId || branchChairs[0]?.id || '',
          serviceName: isCustomService ? customServiceName.trim() : undefined,
          customPrice: isCustomService && typeof customPrice === 'number' ? customPrice : undefined,
          notes: notes.trim(),
        });

        toast.success(`تم تسكين العميل ${customerName} بنجاح على الكرسي ✂️`);
        handleModalClose();
      } else {
        // Mode 2: New In-Salon Booking with Secret Tracking Token
        const newBooking = await createBooking({
          customerName: customerName.trim(),
          customerPhone: cleanPhone,
          branchId,
          barberId: barberId || branchBarbers[0]?.id || '',
          chairId: chairId || branchChairs[0]?.id || '',
          serviceId: isCustomService ? 'srv-custom' : serviceId,
          bookingType,
          startsAt: nowISO,
          endsAt: new Date(Date.now() + (currentService?.duration_minutes || 30) * 60000).toISOString(),
          notes: notes.trim() || (isManualDepositCollected ? `تم استلام عربون يدوي (${numericDeposit} ج.م - ${depositPaymentMethod})` : undefined),
          paymentProof: isManualDepositCollected
            ? {
                paymentMethod: depositPaymentMethod,
                senderPhone: cleanPhone,
                imagePath: 'manual_reception_receipt',
                amount: numericDeposit,
              }
            : undefined,
        });

        const bId = (newBooking as any)?.id || `BK-${Math.floor(1000 + Math.random() * 9000)}`;
        const secToken = (newBooking as any)?.secure_token || `SEC-${bId.replace(/\D+/g, '')}`;
        const trackLink = `https://trimmind.up.railway.app/track?q=${bId}`;

        setCreatedSuccessBooking({
          id: bId,
          customerName: customerName.trim(),
          customerPhone: cleanPhone,
          serviceName: resolvedServiceName,
          barberName: currentBarber?.full_name || 'طاقم الصالون',
          bookingType,
          queueNumber: (newBooking as any)?.queue_number || 1,
          startsAt: nowISO,
          totalAmount: resolvedServicePrice,
          depositAmount: numericDeposit,
          secureToken: secToken,
          trackingUrl: trackLink,
        });

        toast.success(`تم إنشاء وتأكيد الحجز بنجاح #${bId} 🎟️`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء حفظ الحجز');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyTrackingLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('تم نسخ رابط التتبع السري بنجاح! 📋');
  };

  const shareViaWhatsApp = (booking: NonNullable<typeof createdSuccessBooking>) => {
    let cleanPhone = booking.customerPhone.replace(/\D+/g, '');
    if (cleanPhone.startsWith('01') && cleanPhone.length === 11) {
      cleanPhone = '20' + cleanPhone.substring(1);
    }
    const message = `👑 *مرحباً بك يا ${booking.customerName} في صالون TrimMind VIP* 💈✨\n\nتم تسجيل حجزك بنجاح في الفرع:\n📋 *رقم الحجز:* #${booking.id}\n💈 *الكابتن المختص:* ${booking.barberName}\n✂️ *الخدمة:* ${booking.serviceName}\n🎟️ *رقم الدور في الطابور:* #${booking.queueNumber || 1}\n💰 *العربون المستلم:* ${booking.depositAmount} ج.م (تم التأكيد ✅)\n\n📍 *رابط التتبع السري المباشر لموقعك في الدور:*\n${booking.trackingUrl}\n\nنتشرف بزيارتك ❤️`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs font-sans"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleModalClose();
        }
      }}
    >
      <div className="modal-container bg-white border border-border rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-clinic-3 space-y-4 animate-in zoom-in-95 duration-200 text-ink">
        
        {/* SUCCESS VIEW AFTER BOOKING CREATION */}
        {createdSuccessBooking ? (
          <div className="space-y-4 text-center py-2 animate-in fade-in-50 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-forest/10 border border-forest/20 text-forest mx-auto flex items-center justify-center shadow-clinic-1">
              <CheckCircle2 className="w-8 h-8 text-forest" />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold text-terra uppercase tracking-wider block">
                BOOKING CONFIRMED & REGISTERED
              </span>
              <h3 className="font-serif font-bold text-xl text-forest">
                تم تسجيل وتأكيد الحجز بنجاح!
              </h3>
              <p className="text-xs text-ink-soft">
                تم حفظ الحجز وتعيين رمز التتبع السري للعميل <strong>{createdSuccessBooking.customerName}</strong>
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-paper-warm p-4 rounded-2xl border border-border text-xs space-y-2.5 text-right">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-ink-mute">كود الحجز الرسمي:</span>
                <span className="font-mono font-extrabold text-forest text-sm bg-white px-2.5 py-0.5 rounded-lg border border-border">
                  #{createdSuccessBooking.id}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-mute">الدور في الطابور:</span>
                <span className="font-mono font-bold text-terra text-sm">
                  #{createdSuccessBooking.queueNumber || 1}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-mute">الكابتن والخدمة:</span>
                <span className="font-bold text-ink">
                  {createdSuccessBooking.barberName} ({createdSuccessBooking.serviceName})
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-ink-mute">حالة العربون:</span>
                <span className="text-ok font-bold">
                  {createdSuccessBooking.depositAmount > 0 ? `تم استلام ${formatCurrency(createdSuccessBooking.depositAmount)} يدوي ✅` : 'بدون عربون'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-ink-mute">رمز التتبع السري:</span>
                <span className="font-mono font-bold text-forest text-xs bg-white px-2 py-0.5 rounded border border-border">
                  {createdSuccessBooking.secureToken}
                </span>
              </div>
            </div>

            {/* Quick Actions for Receptionist */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => shareViaWhatsApp(createdSuccessBooking)}
                className="w-full py-3 rounded-xl bg-[#25D366] hover:bg-[#1ebd59] text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>إرسال تفاصيل الحجز ورابط التتبع للعميل عبر الواتساب</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyTrackingLink(createdSuccessBooking.trackingUrl)}
                  className="flex-1 btn-clinic-ghost py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-forest" />
                  <span>نسخ رابط التتبع</span>
                </button>

                <button
                  type="button"
                  onClick={handleModalClose}
                  className="flex-1 btn-clinic-primary py-2.5 text-xs font-bold"
                >
                  <span>إغلاق وإنهاء</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* STANDARD BOOKING / SEATING FORM */
          <>
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-forest text-paper flex items-center justify-center shadow-clinic-1">
                  {modalMode === 'walkin_seat' ? (
                    <Armchair className="w-5 h-5" />
                  ) : (
                    <Calendar className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-base">
                    {modalMode === 'walkin_seat'
                      ? 'تسكين فوري مباشر على الكرسي'
                      : 'إضافة حجز جديد في الاستقبال'}
                  </h3>
                  <p className="text-[11px] text-ink-mute">
                    {modalMode === 'walkin_seat'
                      ? 'بدء الخدمة فوراً وتسكين العميل على كراسي الصالون الشاغرة'
                      : 'حجز دور جديد مع رمز تتبع واستلام العربون يدوياً'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleModalClose}
                className="p-1.5 text-ink-mute hover:text-ink rounded-xl hover:bg-paper-warm transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-paper-warm rounded-2xl border border-border text-xs">
              <button
                type="button"
                onClick={() => setModalMode('walkin_seat')}
                className={`py-2 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  modalMode === 'walkin_seat'
                    ? 'bg-forest text-paper shadow-clinic-1'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                <Armchair className="w-3.5 h-3.5" />
                <span>تسكين فوري على الكرسي</span>
              </button>

              <button
                type="button"
                onClick={() => setModalMode('new_booking')}
                className={`py-2 px-3 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  modalMode === 'new_booking'
                    ? 'bg-forest text-paper shadow-clinic-1'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>إضافة حجز جديد + تتبع</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              {/* Customer Name & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-soft font-bold">اسم العميل:</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثال: يوسف ماهر"
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-2.5 text-ink outline-none text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-soft font-bold">رقم هاتف العميل:</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-2.5 text-ink font-mono outline-none text-xs"
                  />
                </div>
              </div>

              {/* In New Booking Mode: Booking Type Selection (Normal vs VIP) */}
              {modalMode === 'new_booking' && (
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setBookingType('normal')}
                    className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                      bookingType === 'normal'
                        ? 'border-forest bg-forest/10 text-forest font-bold shadow-xs'
                        : 'border-border bg-paper-warm text-ink-soft'
                    }`}
                  >
                    <span className="block text-xs font-bold">🎟️ حجز عادي (طابور ذكي)</span>
                    <span className="block text-[10px] text-ink-mute">عربون: 50 ج.م</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBookingType('vip')}
                    className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                      bookingType === 'vip'
                        ? 'border-terra bg-terra/10 text-terra font-bold shadow-xs'
                        : 'border-border bg-paper-warm text-ink-soft'
                    }`}
                  >
                    <span className="block text-xs font-bold">👑 حجز VIP ملكي</span>
                    <span className="block text-[10px] text-ink-mute">عربون: 100 ج.م</span>
                  </button>
                </div>
              )}

              {/* Service Selection with "مخصص" Option */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-ink-soft font-bold">الخدمة المطلوبة:</label>
                  <button
                    type="button"
                    onClick={() => setIsCustomService(!isCustomService)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isCustomService
                        ? 'bg-terra text-paper border-terra shadow-xs'
                        : 'bg-paper-warm text-ink-soft hover:text-ink border-border'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                        isCustomService
                          ? 'border-white bg-white text-terra'
                          : 'border-border bg-white'
                      }`}
                    >
                      {isCustomService && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span>مخصص (تحديد يدوي)</span>
                  </button>
                </div>

                {!isCustomService ? (
                  <select
                    value={serviceId}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomService(true);
                      } else {
                        setServiceId(e.target.value);
                      }
                    }}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-2.5 text-ink outline-none cursor-pointer text-xs"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({formatCurrency(s.price)} - {s.duration_minutes} دقيقة)
                      </option>
                    ))}
                    <option value="custom">✨ مخصص - كتابة طلب وسعر محدد يدوي...</option>
                  </select>
                ) : (
                  <div className="p-3 bg-terra/5 rounded-2xl border border-terra/30 space-y-2.5 animate-in fade-in-50 duration-200">
                    <div className="flex items-center gap-1.5 text-terra font-bold text-[11px]">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>تخصيص الخدمة وحساب الإيراد:</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-ink-soft text-[11px] font-medium block">
                          الخدمة / طلبات العميل:
                        </label>
                        <input
                          type="text"
                          required={isCustomService}
                          value={customServiceName}
                          onChange={(e) => setCustomServiceName(e.target.value)}
                          placeholder="مثال: قص وتدريج + سنفرة وبخار بشرة"
                          className="w-full bg-white border border-border focus:border-terra rounded-xl p-2 text-ink outline-none text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-ink-soft text-[11px] font-medium block">
                          السعر الإجمالي:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            required={isCustomService}
                            min="1"
                            step="5"
                            value={customPrice}
                            onChange={(e) =>
                              setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))
                            }
                            placeholder="250"
                            className="w-full bg-white border border-border focus:border-terra rounded-xl p-2 pl-8 text-terra font-mono font-bold outline-none text-xs"
                          />
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-mute font-bold">
                            ج.م
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Barber & Chair Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-soft font-bold">الحلاق المختص:</label>
                  <select
                    value={barberId}
                    onChange={(e) => setBarberId(e.target.value)}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-2.5 text-ink outline-none cursor-pointer text-xs"
                  >
                    {branchBarbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {modalMode === 'walkin_seat' ? (
                  <div className="space-y-1">
                    <label className="text-ink-soft font-bold">الكرسي المراد التسكين عليه:</label>
                    <select
                      value={chairId}
                      onChange={(e) => setChairId(e.target.value)}
                      className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-2.5 text-ink outline-none cursor-pointer text-xs"
                    >
                      {branchChairs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.status === 'available' ? 'شاغر متاح' : c.status})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-ink-soft font-bold">توقيت الحجز:</label>
                    <div className="p-2.5 bg-paper-warm rounded-xl border border-border text-xs text-ink flex items-center justify-between">
                      <span className="text-ink-mute">موعد اليوم الحي:</span>
                      <strong className="text-forest font-mono">أقرب دور متاح في الطابور</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* MANUAL DEPOSIT COLLECTION TOGGLE & BOX */}
              <div className="p-3 bg-paper-warm rounded-2xl border border-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-ink text-xs flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isManualDepositCollected}
                      onChange={(e) => setIsManualDepositCollected(e.target.checked)}
                      className="rounded text-forest focus:ring-forest w-4 h-4 cursor-pointer"
                    />
                    <Receipt className="w-4 h-4 text-forest" />
                    <span>استلام العربون يدوياً في الاستقبال</span>
                  </label>

                  {isManualDepositCollected && (
                    <span className="text-[10px] font-bold text-ok bg-ok/10 px-2 py-0.5 rounded-full border border-ok/20">
                      تأكيد فوري للحجز ✅
                    </span>
                  )}
                </div>

                {isManualDepositCollected && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="space-y-1">
                      <label className="text-ink-mute text-[11px]">طريقة استلام المبلغ:</label>
                      <select
                        value={depositPaymentMethod}
                        onChange={(e) => setDepositPaymentMethod(e.target.value as any)}
                        className="w-full bg-white border border-border focus:border-forest rounded-xl p-2 text-ink outline-none text-xs"
                      >
                        <option value="cash">💵 كاش (نقدي بالصالون)</option>
                        <option value="vodafone_cash">📱 فودافون كاش</option>
                        <option value="instapay">💳 إنستاباي (تحويل)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-ink-mute text-[11px]">قيمة العربون المحصل (ج.م):</label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={depositAmount}
                        onChange={(e) =>
                          setDepositAmount(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        className="w-full bg-white border border-border focus:border-forest rounded-xl p-2 text-forest font-mono font-bold outline-none text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-ink-soft font-bold">ملاحظات إضافية:</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: يفضل موس حاد، تصفيف خاص..."
                  className="w-full bg-paper-warm border border-border rounded-xl p-2.5 text-ink outline-none text-xs"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 btn-clinic-primary py-3 text-xs font-bold shadow-clinic-1 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <span>جاري الحفظ والتشغيل...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {modalMode === 'walkin_seat'
                          ? 'بدء الخدمة والتسكين على الكرسي'
                          : 'إنشاء الحجز وتوليد كود التتبع'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleModalClose}
                  className="btn-clinic-ghost px-4 py-3 text-xs font-bold"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

