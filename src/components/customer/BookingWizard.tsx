import React, { useState, useMemo, useEffect } from 'react';
import { useSalonStore } from '../../lib/store';
import { INITIAL_BRANCHES, INITIAL_BARBERS } from '../../lib/seedData';
import { Service, Barber, Chair, Product, Booking } from '../../types';
import { formatCurrency, formatTime, generateToken, format12Hour, compressImage } from '../../lib/utils';
import { ServiceCard } from './ServiceCard';
import { BarberCard } from './BarberCard';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import {
  Building2,
  Scissors,
  UserCheck,
  Calendar,
  Clock,
  Coffee,
  CheckCircle2,
  CreditCard,
  Upload,
  ArrowRight,
  ArrowLeft,
  Crown,
  Sparkles,
  QrCode,
  MapPin,
  Phone,
  FileCheck,
  Plus,
  Minus,
  Check,
  X,
  AlertTriangle,
  Copy,
  Send,
  ExternalLink,
  Home,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

// Smart Cairo-aware normal queue slot calculation helper
export function calculateSmartNormalTimeSlot(
  selectedDate: string,
  queueNumber: number,
  openingTime: string = '10:00',
  closingTime: string = '23:30',
  nowTime: Date = new Date()
): string {
  const cairoDateStr = nowTime.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const isToday = selectedDate === cairoDateStr;

  const [openHourStr, openMinStr] = (openingTime || '10:00').split(':');
  const openHour = parseInt(openHourStr, 10) || 10;
  const openMin = parseInt(openMinStr, 10) || 0;

  const [closeHourStr, closeMinStr] = (closingTime || '23:30').split(':');
  const closeHour = parseInt(closeHourStr, 10) || 23;
  const closeMin = parseInt(closeMinStr, 10) || 30;
  const closeTotalMinutes = closeHour * 60 + closeMin;

  let baseMinutes = openHour * 60 + openMin;

  if (isToday) {
    const cairoTimeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = cairoTimeFormatter.formatToParts(nowTime);
    const nowHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '12', 10);
    const nowMin = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const nowTotalMinutes = nowHour * 60 + nowMin;

    if (nowTotalMinutes >= baseMinutes) {
      baseMinutes = Math.ceil((nowTotalMinutes + 15) / 15) * 15;
    }
  }

  const queueOffsetMinutes = Math.max(0, queueNumber - 1) * 30;
  let targetMinutes = baseMinutes + queueOffsetMinutes;

  if (targetMinutes > closeTotalMinutes - 15) {
    targetMinutes = Math.min(targetMinutes, closeTotalMinutes - 15);
  }

  const resHour = Math.floor(targetMinutes / 60) % 24;
  const resMin = targetMinutes % 60;

  const hh = resHour < 10 ? `0${resHour}` : `${resHour}`;
  const mm = resMin < 10 ? `0${resMin}` : `${resMin}`;
  return `${hh}:${mm}`;
}

export const BookingWizard: React.FC = () => {
  const {
    branches,
    services,
    barbers,
    chairs,
    products,
    bookings,
    settings,
    currentUser,
    createBooking,
    selectedBranchId,
  } = useSalonStore();

  const navigate = useNavigate();

  // Wizard States (Step 1 to 8)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [branchId, setBranchId] = useState<string>(selectedBranchId || branches[0]?.id || 'branch-elhdad');
  const [bookingType, setBookingType] = useState<'normal' | 'vip'>('normal');
  const [selectedServiceId, setSelectedServiceId] = useState<string>(services[0]?.id || '');
  const [additionalServiceIds, setAdditionalServiceIds] = useState<string[]>([]);
  const [barberId, setBarberId] = useState<string>(barbers[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('15:30');
  const [selectedProducts, setSelectedProducts] = useState<{ [productId: string]: number }>({});
  const [customerName, setCustomerName] = useState<string>(
    currentUser.role === 'customer' ? currentUser.full_name : ''
  );
  const [customerPhone, setCustomerPhone] = useState<string>(
    currentUser.role === 'customer' ? currentUser.phone || '' : ''
  );
  const [notes, setNotes] = useState<string>('');

  // Payment Proof upload state
  const [paymentMethod, setPaymentMethod] = useState<'instapay' | 'vodafone_cash'>('instapay');
  const [senderPhone, setSenderPhone] = useState<string>('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [isVipPromptOpen, setIsVipPromptOpen] = useState<boolean>(false);

  const effectiveBranchId = branchId || selectedBranchId || branches[0]?.id || 'branch-elhdad';
  const currentBranch = branches.find((b) => b.id === effectiveBranchId) || branches[0] || INITIAL_BRANCHES[0];

  // Auto-sync branchId & serviceId when data loads
  useEffect(() => {
    if (!branchId && branches.length > 0) {
      setBranchId(branches[0].id);
    }
  }, [branches, branchId]);

  useEffect(() => {
    if (!selectedServiceId && services.length > 0) {
      setSelectedServiceId(services[0].id);
    }
  }, [services, selectedServiceId]);

  // Robust Barbers list resolution: always shows all active barbers for the branch
  const branchBarbers = useMemo(() => {
    const rawList = barbers && barbers.length > 0 ? barbers : INITIAL_BARBERS;
    const activeBarbers = rawList.filter((b) => b.is_active !== false);
    const matched = activeBarbers.filter((b) => !b.branch_id || b.branch_id === effectiveBranchId);
    return matched.length > 0 ? matched : activeBarbers;
  }, [barbers, effectiveBranchId]);

  useEffect(() => {
    if ((!barberId || !branchBarbers.some((b) => b.id === barberId)) && branchBarbers.length > 0) {
      setBarberId(branchBarbers[0].id);
    }
  }, [branchBarbers, barberId]);

  const currentBarber = branchBarbers.find((b) => b.id === barberId) || branchBarbers[0] || INITIAL_BARBERS[0];

  // Calculate pricing
  const primaryService = services.find((s) => s.id === selectedServiceId);
  const additionalServices = services.filter((s) => additionalServiceIds.includes(s.id));

  const totalServicePrice =
    (primaryService?.price || 0) +
    additionalServices.reduce((sum, s) => sum + s.price, 0);

  const totalDurationMinutes =
    (primaryService?.duration_minutes || 30) +
    additionalServices.reduce((sum, s) => sum + s.duration_minutes, 0);

  const bookingFee =
    bookingType === 'vip' ? settings.booking_fee_vip : settings.booking_fee_normal;

  const productsTotal = Object.entries(selectedProducts).reduce((sum, [pId, qty]) => {
    const p = products.find((prod) => prod.id === pId);
    return sum + (p ? p.price * qty : 0);
  }, 0);

  const grandTotal = totalServicePrice + productsTotal;

  // Real existing date bookings and next queue number
  const existingDateBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.branch_id === branchId &&
          (b.starts_at?.split('T')[0] === selectedDate) &&
          b.status !== 'cancelled'
      ),
    [bookings, branchId, selectedDate]
  );
  const nextQueueNumber = existingDateBookings.length + 1;
  const customerServicePhone = currentBranch?.phone || settings.primary_phone || '01000000000';

  // Available Time Slots generator (11:00 to 22:30 in 30-min intervals)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 11; hour <= 22; hour++) {
      const hStr = hour < 10 ? `0${hour}` : `${hour}`;
      slots.push(`${hStr}:00`);
      slots.push(`${hStr}:30`);
    }
    return slots;
  }, []);

  // Detect already booked VIP slots across days to guarantee full transparency & conflict prevention
  const bookedVipSlots = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === 'cancelled' || b.status === 'rejected') return false;
        const matchesBarber = !barberId || b.barber_id === barberId || (!b.barber_id && b.branch_id === branchId);
        const bookingDateStr = b.starts_at?.split('T')[0] || b.starts_at?.slice(0, 10);
        return matchesBarber && bookingDateStr === selectedDate;
      })
      .map((b) => {
        let timePart = '';
        if (b.starts_at?.includes('T')) {
          timePart = b.starts_at.split('T')[1].slice(0, 5);
        } else if (b.starts_at) {
          const match = b.starts_at.match(/(\d{2}:\d{2})/);
          if (match) timePart = match[1];
        }
        return timePart;
      })
      .filter(Boolean);
  }, [bookings, barberId, branchId, selectedDate]);

  // Live Cairo Time Clock & Expiration Tracker
  const [liveCairoTime, setLiveCairoTime] = useState<Date>(new Date());

  // Lock background scroll when VIP modal is open
  useBodyScrollLock(isVipPromptOpen);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setLiveCairoTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const cairoTimeFormatted = useMemo(() => {
    return liveCairoTime.toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Africa/Cairo',
    });
  }, [liveCairoTime]);

  const todayCairoDate = useMemo(() => {
    return liveCairoTime.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  }, [liveCairoTime]);

  const smartNormalTimeSlot = useMemo(() => {
    return calculateSmartNormalTimeSlot(
      selectedDate,
      nextQueueNumber,
      currentBranch?.opening_time || '10:00',
      currentBranch?.closing_time || '23:30',
      liveCairoTime
    );
  }, [selectedDate, nextQueueNumber, currentBranch?.opening_time, currentBranch?.closing_time, liveCairoTime]);

  const effectiveTimeSlot = bookingType === 'vip' ? selectedTimeSlot : smartNormalTimeSlot;

  const isSlotExpired = (slot: string) => {
    if (selectedDate !== todayCairoDate) return false;
    const [slotHour, slotMinute] = slot.split(':').map(Number);
    const slotTotalMinutes = slotHour * 60 + slotMinute;

    const nowHour = liveCairoTime.getHours();
    const nowMinute = liveCairoTime.getMinutes();
    const currentTotalMinutes = nowHour * 60 + nowMinute;

    return slotTotalMinutes <= currentTotalMinutes;
  };

  const handleSlotClick = (slot: string) => {
    if (isSlotExpired(slot)) {
      toast.error(
        `عفواً، ميعاد (${format12Hour(slot)}) قد انقضى وقته بالفعل اليوم بتوقيت القاهرة (${cairoTimeFormatted}). يرجى اختيار موعد قادم.`
      );
      return;
    }

    if (bookedVipSlots.includes(slot)) {
      toast(
        () => (
          <div className="flex flex-col gap-2 p-1 text-right font-sans">
            <div className="flex items-center gap-2 font-bold text-rose-700 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>عذراً، موعد ({format12Hour(slot)}) محجوز مسبقاً!</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              هذا التوقيت تم حجزه وتأكيده بالفعل لدى الكابتن ({currentBarber?.full_name || 'المختار'}) ليوم ({selectedDate}).
            </p>
            <div className="bg-white/90 p-2.5 rounded-xl border border-rose-200 text-[11px] text-ink font-medium space-y-1">
              <span className="font-bold text-forest block">💡 خياراتك المتاحة الآن:</span>
              <ul className="list-disc list-inside space-y-0.5 text-ink-soft text-[11px]">
                <li>اختر أي موعد متاح آخر من المربعات البيضاء لنفس اليوم.</li>
                <li>أو اضغط على <strong className="text-terra">يوم آخر من شريط الأيام بالأعلى</strong> لحجز الساعة ({format12Hour(slot)}) في يوم بديل 📅.</li>
              </ul>
            </div>
          </div>
        ),
        {
          duration: 6500,
          style: {
            borderRadius: '18px',
            background: '#fff1f2',
            border: '1.5px solid #fecdd3',
            color: '#881337',
            maxWidth: '440px',
            boxShadow: '0 12px 30px -5px rgba(244, 63, 94, 0.25)',
          },
        }
      );
      return;
    }
    setSelectedTimeSlot(slot);
    toast.success(`تم اختيار موعد ${format12Hour(slot)} بنجاح ✅`);
  };

  const handleNextStep = () => {
    if (currentStep === 1 && !branchId) {
      toast.error('يرجى اختيار الفرع أولاً');
      return;
    }
    if (currentStep === 2 && !selectedServiceId) {
      toast.error('يرجى اختيار الخدمة المطلوبة');
      return;
    }
    if (currentStep === 3 && !barberId) {
      toast.error('يرجى اختيار الحلاق المفضل');
      return;
    }
    if (currentStep === 4) {
      if (!selectedTimeSlot) {
        toast.error('يرجى اختيار موعد الحجز');
        return;
      }
      if (bookingType === 'vip' && isSlotExpired(selectedTimeSlot)) {
        toast.error('الموعد الذي قمت باختياره قد انقضى وقته، يرجى اختيار موعد قادم متاح');
        return;
      }
    }
    if (currentStep === 6 && (!customerName.trim() || !customerPhone.trim())) {
      toast.error('يرجى كتابة اسمك ورقم الهاتف لتأكيد الحجز');
      return;
    }

    setCurrentStep((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [isCompressing, setIsCompressing] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        const compressedBase64 = await compressImage(file, 1200, 0.75);
        setProofImage(compressedBase64);
        toast.success('تم ضغط وتحسين صورة الإيصال بنجاح لتسريع الرفع وحفظ المساحة!');
      } catch (err) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setProofImage(reader.result as string);
          toast.success('تم تحميل صورة الإيصال بنجاح!');
        };
        reader.readAsDataURL(file);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleConfirmAndPay = async () => {
    if (!proofImage) {
      toast.error('يرجى رفع صورة إيصال التحويل لإتمام الحجز');
      return;
    }
    if (!senderPhone.trim()) {
      toast.error('يرجى إدخال رقم الهاتف أو الحساب المحول منه');
      return;
    }

    setIsSubmitting(true);

    const startsAtISO = `${selectedDate}T${effectiveTimeSlot}:00.000Z`;
    const endsAtDate = new Date(startsAtISO);
    endsAtDate.setMinutes(endsAtDate.getMinutes() + totalDurationMinutes);

    const prodsPayload = Object.entries(selectedProducts)
      .filter(([_, qty]) => qty > 0)
      .map(([pId, qty]) => ({ productId: pId, quantity: qty }));

    try {
      const newBooking = await createBooking({
        customerName,
        customerPhone,
        branchId,
        barberId,
        serviceId: selectedServiceId,
        additionalServiceIds,
        bookingType,
        startsAt: startsAtISO,
        endsAt: endsAtDate.toISOString(),
        notes,
        selectedProducts: prodsPayload,
        paymentProof: {
          paymentMethod,
          senderPhone,
          imagePath: proofImage,
          amount: bookingFee,
        },
      });

      setConfirmedBooking(newBooking);
      setIsSubmitting(false);
      setCurrentStep(8);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#1e3a2e', '#c2613d', '#f3eee4'],
      });

      toast.success('تم تأكيد حجزك وإرسال الإيصال للاستقبال بنجاح ✅');
    } catch (err: any) {
      setIsSubmitting(false);
      toast.error(err?.message || 'تعذر إرسال الحجز للسيرفر، يرجى إعادة المحاولة');
    }
  };

  return (
    <div className="clinic-card p-6 sm:p-10 max-w-4xl mx-auto shadow-clinic-3 space-y-8">
      {/* ClinicMind Step Indicator Segments */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-terra font-bold tracking-wider">
            STEP {currentStep} OF 8
          </span>
          <span className="font-serif font-bold text-sm text-ink">
            {currentStep === 1 && 'اختيار فرع الصالون'}
            {currentStep === 2 && 'اختيار الخدمة والتجربة'}
            {currentStep === 3 && 'اختيار كابتن الحلاقة'}
            {currentStep === 4 && 'تحديد التاريخ والموعد'}
            {currentStep === 5 && 'كافيه ومنتجات العناية'}
            {currentStep === 6 && 'بيانات العميل والملاحظات'}
            {currentStep === 7 && 'سداد رسوم الحجز والإيصال'}
            {currentStep === 8 && 'تذكرة الحجز الرقمية'}
          </span>
        </div>

        {/* Segmented Progress Bar */}
        <div className="flex gap-1.5 h-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <div
              key={s}
              className={`flex-1 rounded-full transition-all duration-300 ${
                s <= currentStep ? 'bg-forest' : 'bg-paper-deep'
              }`}
            />
          ))}
        </div>
      </div>

      {/* STEP 1: Branch Selection */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-ink">اختر فرع صالون النخبة</h2>
            <p className="text-xs text-ink-mute">حدد الفرع الأقرب والأنسب لك لاستعراض الكراسي والمواعيد المتاحة</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((b) => {
              const isSelected = branchId === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => setBranchId(b.id)}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? 'bg-white border-forest shadow-clinic-2 ring-2 ring-forest/20'
                      : 'bg-white/60 border-border hover:border-forest/40 hover:bg-white'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-forest" />
                      <h3 className="font-serif font-bold text-ink text-base">{b.name}</h3>
                    </div>
                    <p className="text-xs text-ink-soft flex items-start gap-1.5">
                      <MapPin className="w-4 h-4 text-terra shrink-0 mt-0.5" />
                      <span>{b.address}</span>
                    </p>
                    <div className="flex items-center gap-4 text-xs text-ink-mute pt-2 border-t border-border-soft">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-forest" />
                        <span>من {b.opening_time} حتى {b.closing_time}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-forest" />
                        <span dir="ltr">{b.phone}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 2: Service & Experience Selection */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-ink">اختر نوع التجربة والخدمات</h2>
            <p className="text-xs text-ink-mute">حدد التجربة المطلوبة من باقاتنا الفاخرة</p>
          </div>

          {/* Booking Type Segment Switcher with prominent dark active side */}
          <div className="bg-[#e2d8c7] p-1.5 rounded-2xl border-2 border-[#cfc1ac] max-w-xl mx-auto grid grid-cols-2 gap-2 shadow-inner">
            <button
              type="button"
              onClick={() => setBookingType('normal')}
              className={`py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-bold transition-all duration-300 ${
                bookingType === 'normal'
                  ? 'bg-[#1e3a2e] text-white shadow-md scale-[1.02] ring-2 ring-[#1e3a2e]/30'
                  : 'text-[#5a5247] hover:text-[#181613] hover:bg-white/40'
              }`}
            >
              <Scissors className={`w-4 h-4 ${bookingType === 'normal' ? 'text-white' : 'text-[#5a5247]'}`} />
              <span>تجربة عادية</span>
            </button>

            <button
              type="button"
              onClick={() => setBookingType('vip')}
              className={`py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm font-bold transition-all duration-300 ${
                bookingType === 'vip'
                  ? 'bg-[#c2613d] text-white shadow-md scale-[1.02] ring-2 ring-[#c2613d]/30'
                  : 'text-[#5a5247] hover:text-[#181613] hover:bg-white/40'
              }`}
            >
              <Crown className={`w-4 h-4 ${bookingType === 'vip' ? 'text-white' : 'text-[#5a5247]'}`} />
              <span>تجربة VIP</span>
            </button>
          </div>

          {/* Services Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {services
              .filter((s) => s.is_active && (bookingType === 'vip' || !s.is_vip_only))
              .map((service) => {
                const isSelected = selectedServiceId === service.id;
                return (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isSelected={isSelected}
                    onToggleSelect={() => setSelectedServiceId(service.id)}
                  />
                );
              })}
          </div>

          {/* Summary Box */}
          <div className="bg-white/80 p-4 rounded-2xl border border-border flex items-center justify-between text-xs shadow-clinic-1">
            <div>
              <span className="text-ink-mute">الخدمة المختارة: </span>
              <span className="font-bold text-ink">{primaryService?.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-ink-mute">المدة: {totalDurationMinutes} دقيقة</span>
              <span className="text-forest font-serif font-bold text-base">{formatCurrency(totalServicePrice)}</span>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Barber & Chair Selection */}
      {currentStep === 3 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-ink">
              {bookingType === 'normal' ? 'كابتن الحلاقة المخصص' : 'اختر كابتن الحلاقة المفضل'}
            </h2>
            <p className="text-xs text-ink-mute">
              {bookingType === 'normal'
                ? `تم تعيين كابتن الحلاقة تلقائياً لفرع ${currentBranch?.name}`
                : `نخبة من أمهر الخبراء والمصففين المتاحين في ${currentBranch?.name}`}
            </p>
          </div>

          {/* Normal Mode Notice Banner */}
          {bookingType === 'normal' && (
            <div className="bg-forest/10 border border-forest/20 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-forest text-paper flex items-center justify-center shrink-0">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-forest">نظام التوزيع التلقائي الذكي مفعل</p>
                  <p className="text-ink-soft text-[11px]">
                    في التجربة العادية، يتم تعيين الكابتن المتاح تلقائياً لضمان سرعة الخدمة.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsVipPromptOpen(true)}
                className="btn-clinic-terra text-xs py-2 px-4 shrink-0 font-bold"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>الترقية لاختيار كابتن VIP</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {branchBarbers.map((barber) => (
              <BarberCard
                key={barber.id}
                barber={barber}
                isSelected={barberId === barber.id}
                isNormalMode={bookingType === 'normal'}
                onSelect={(b) => setBarberId(b.id)}
                onAttemptLockedSelect={() => setIsVipPromptOpen(true)}
              />
            ))}
          </div>
        </div>
      )}

      {/* STEP 4: Date & Time Slots */}
      {currentStep === 4 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-ink">
              {bookingType === 'normal' ? 'اختر اليوم المناسب للحجز' : 'اختر التاريخ والموعد المناسب'}
            </h2>
            <p className="text-xs text-ink-mute">
              {bookingType === 'normal'
                ? 'حدد اليوم المطلوب وسيمنحك النظام رقم دور ذكي وتذكرة حضور تلقائية'
                : 'حدد اليوم والتوقيت الدقيق لحجز جناح VIP بدون أي انتظار'}
            </p>
          </div>

          {/* Date Selector Pills (Next 7 days) */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
            {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
              const dateObj = new Date();
              dateObj.setDate(dateObj.getDate() + dayOffset);
              const isoStr = dateObj.toISOString().split('T')[0];
              const isSelected = selectedDate === isoStr;
              const dayName = dateObj.toLocaleDateString('ar-EG', { weekday: 'short' });
              const dayNumber = dateObj.getDate();
              const monthName = dateObj.toLocaleDateString('ar-EG', { month: 'short' });

              return (
                <button
                  key={isoStr}
                  type="button"
                  onClick={() => setSelectedDate(isoStr)}
                  className={`flex-1 min-w-[85px] py-4 px-3 rounded-2xl border text-center transition-all duration-200 ${
                    isSelected
                      ? 'bg-[#1e3a2e] text-white border-[#1e3a2e] font-bold shadow-clinic-2 scale-105 ring-2 ring-[#1e3a2e]/30'
                      : 'bg-white/80 border-border text-ink-soft hover:bg-white hover:border-forest/40'
                  }`}
                >
                  <p className={`text-[11px] ${isSelected ? 'text-white/90 font-medium' : 'text-ink-mute'}`}>
                    {dayName}
                  </p>
                  <p className={`text-xl font-serif font-bold my-0.5 ${isSelected ? 'text-white' : 'text-ink'}`}>
                    {dayNumber}
                  </p>
                  <p className={`text-[10px] ${isSelected ? 'text-white/90 font-medium' : 'text-ink-mute'}`}>
                    {monthName}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Normal Mode: Smart Queue Card Assignment */}
          {bookingType === 'normal' ? (
            <div className="bg-paper-warm p-6 rounded-2xl border-2 border-forest/20 text-center space-y-4 shadow-clinic-1">
              <div className="w-12 h-12 rounded-2xl bg-forest text-paper mx-auto flex items-center justify-center shadow-sm">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-serif font-bold text-lg text-forest">
                  نظام حجز الدور الذكي ليوم ({selectedDate})
                </h3>
                <p className="text-xs text-ink-soft max-w-lg mx-auto leading-relaxed">
                  دورك هو <strong className="text-forest font-extrabold text-sm">رقم #{nextQueueNumber}</strong> مع الكابتن ({currentBarber?.full_name})، والموعد المتوقع لدخولك هو <strong className="text-terra font-extrabold text-sm">{format12Hour(effectiveTimeSlot)}</strong> بتوقيت القاهرة.
                </p>
              </div>

              {/* Dynamic Queue Timing Highlight */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                <div className="p-3 bg-white rounded-xl border border-border shadow-xs text-center">
                  <span className="text-[10.5px] text-ink-mute block">رقم الدور في الطابور:</span>
                  <span className="text-forest font-mono font-extrabold text-base">#{nextQueueNumber}</span>
                </div>
                <div className="p-3 bg-white rounded-xl border border-border shadow-xs text-center">
                  <span className="text-[10.5px] text-ink-mute block">الموعد المتوقع للحضور:</span>
                  <span className="text-terra font-mono font-extrabold text-base">{format12Hour(effectiveTimeSlot)}</span>
                </div>
              </div>

              {/* Customer Service Notice */}
              <div className="p-3.5 bg-white rounded-2xl border border-border space-y-1.5 text-xs max-w-md mx-auto text-right shadow-sm">
                <div className="flex items-center gap-2 text-forest font-bold">
                  <Phone className="w-4 h-4 text-forest" />
                  <span>للاستفسار عن التوقيت الدقيق للحضور:</span>
                </div>
                <p className="text-ink-soft text-[11px] leading-relaxed">
                  يمكنك الاتصال مباشرة بخدمة عملاء الفرع على:{' '}
                  <strong dir="ltr" className="text-ink font-mono font-bold text-xs">
                    {customerServicePhone}
                  </strong>{' '}
                  أو من خلال تتبع الحجز المباشر عبر المنصة.
                </p>
              </div>
            </div>
          ) : (
            /* VIP Mode: 12-Hour Exact Time Slots Grid with Full Transparency */
            <div className="bg-white/90 p-5 sm:p-6 rounded-2xl border border-border space-y-4 shadow-clinic-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3.5">
                <div>
                  <h4 className="font-bold text-ink text-sm sm:text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-terra" />
                    <span>جدول مواعيد جناح VIP ليوم ({selectedDate}):</span>
                  </h4>
                  <p className="text-[11px] text-ink-mute mt-0.5">
                    اختر التوقيت المناسب لك مع الكابتن ({currentBarber?.full_name || 'المختار'})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-terra text-paper px-2.5 py-1 rounded-full font-bold font-mono shadow-xs">
                    VIP PRECISE TIME
                  </span>
                </div>
              </div>

              {/* Live Cairo Clock Widget Banner */}
              <div className="bg-paper-warm/80 p-3.5 sm:p-4 rounded-2xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-forest text-paper flex items-center justify-center font-bold shadow-xs shrink-0">
                    <Clock className="w-5 h-5 text-terra-soft" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink">التوقيت الحي الآن:</span>
                      <span className="font-mono font-extrabold text-forest text-base sm:text-lg tracking-wider">
                        {cairoTimeFormatted}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-mute">
                      بتوقيت القاهرة (مصر) • المواعيد السابقة تُغلق وتُحظر تلقائياً
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="bg-white px-3 py-1 rounded-full border border-border text-xs font-bold text-forest shadow-2xs font-mono">
                    {selectedDate === todayCairoDate ? '📅 حجز اليوم' : `📅 حجز يوم ${selectedDate}`}
                  </span>
                </div>
              </div>

              {/* Status Indicator Legend Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 bg-paper-warm/80 p-3 rounded-xl border border-border/80 text-xs">
                <div className="flex items-center gap-3.5 flex-wrap">
                  <div className="flex items-center gap-1.5 font-medium text-ink-soft">
                    <span className="w-3.5 h-3.5 rounded-md bg-white border border-border shadow-2xs inline-block"></span>
                    <span>متاح للحجز</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-gray-500">
                    <span className="w-3.5 h-3.5 rounded-md bg-gray-200 border border-gray-300 inline-block"></span>
                    <span>انتهى وقته اليوم</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-rose-700">
                    <span className="w-3.5 h-3.5 rounded-md bg-rose-100 border border-rose-300 text-rose-700 flex items-center justify-center text-[9px] font-black">
                      ✕
                    </span>
                    <span>محجوز مسبقاً</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-bold text-terra-deep">
                    <span className="w-3.5 h-3.5 rounded-md bg-[#c2613d] shadow-2xs inline-block"></span>
                    <span>الموعد المحدد</span>
                  </div>
                </div>
                <span className="text-[11px] text-ink-mute font-sans font-medium">
                  {selectedDate === todayCairoDate
                    ? '⚡ يتم تحديث المواعيد المتاحة لحظياً'
                    : '✨ كافة مواعيد هذا اليوم متاحة للحجز مسبقاً'}
                </span>
              </div>

              {/* Grid of 30-min Time Slots */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {timeSlots.map((slot) => {
                  const isPast = isSlotExpired(slot);
                  const isSelected = selectedTimeSlot === slot;
                  const isBooked = bookedVipSlots.includes(slot);

                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isPast}
                      onClick={() => handleSlotClick(slot)}
                      className={`relative py-3 px-2 rounded-xl text-xs font-bold border transition-all duration-200 flex flex-col items-center justify-center gap-1 group ${
                        isPast
                          ? 'bg-gray-100/90 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                          : isBooked
                          ? 'bg-rose-50/80 border-rose-300/80 text-rose-800 hover:bg-rose-100 hover:border-rose-400 cursor-pointer shadow-xs'
                          : isSelected
                          ? 'bg-[#c2613d] text-white border-[#c2613d] font-bold shadow-md scale-105 ring-2 ring-[#c2613d]/30'
                          : 'bg-white border-border text-ink-soft hover:bg-forest/5 hover:border-forest/40 hover:text-forest'
                      }`}
                      title={
                        isPast
                          ? `موعد ${format12Hour(slot)} قد انقضى وقته بالفعل اليوم`
                          : isBooked
                          ? `موعد ${format12Hour(slot)} محجوز مسبقاً (اضغط للتفاصيل)`
                          : `اختر موعد ${format12Hour(slot)}`
                      }
                    >
                      <span className={isPast || isBooked ? 'line-through' : ''}>
                        {format12Hour(slot)}
                      </span>
                      {isPast ? (
                        <span className="inline-flex items-center gap-0.5 text-[8.5px] bg-gray-200 text-gray-600 px-1.5 py-0.2 rounded-full font-bold">
                          انتهى
                        </span>
                      ) : isBooked ? (
                        <span className="inline-flex items-center gap-0.5 text-[9px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold shadow-2xs group-hover:scale-105 transition-transform">
                          <X className="w-2.5 h-2.5" />
                          <span>محجوز</span>
                        </span>
                      ) : isSelected ? (
                        <span className="inline-flex items-center gap-0.5 text-[9px] bg-white/25 text-white px-2 py-0.5 rounded-full font-bold">
                          <Check className="w-2.5 h-2.5" />
                          <span>محدد</span>
                        </span>
                      ) : (
                        <span className="text-[9px] text-forest/70 font-normal">متاح</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Guidance Info Alert */}
              <div className="bg-forest/5 border border-forest/20 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-right">
                <Sparkles className="w-4 h-4 text-terra shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-forest">
                    شفافية الحجز والتواجد الفعلي:
                  </p>
                  <p className="text-ink-soft text-[11px] leading-relaxed">
                    المواعيد التي تحمل علامة <span className="font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">✕ محجوز</span> تم حجزها وتأكيدها بالفعل من قبل عملاء آخرين، والمواعيد التي تحمل علامة <span className="font-bold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300">منتهي</span> قد انقضى وقتها اليوم. لحجز موعد في توقيت محدد يمكنك النقر على <strong className="text-forest">الأيام القادمة بالأعلى</strong> 📅.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: Cafe & Care Add-ons */}
      {currentStep === 5 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-ink">كافيه الصالون ومنتجات العناية (اختياري)</h2>
            <p className="text-xs text-ink-mute">استمتع بمشروبك المفضل أثناء الجلسة أو أضف منتجات العناية باللحية والشعر</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((prod) => {
              const qty = selectedProducts[prod.id] || 0;
              return (
                <div
                  key={prod.id}
                  className="bg-white/80 p-4 rounded-2xl border border-border flex items-center justify-between gap-4 shadow-clinic-1"
                >
                  <div className="space-y-1">
                    <p className="font-serif font-bold text-ink text-sm">{prod.name}</p>
                    <p className="text-xs text-ink-mute">{prod.description}</p>
                    <p className="text-forest font-bold text-xs pt-1 font-serif">
                      {formatCurrency(prod.price)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-paper-warm px-2.5 py-1.5 rounded-xl border border-border">
                    <button
                      onClick={() => {
                        if (qty > 0) {
                          setSelectedProducts({
                            ...selectedProducts,
                            [prod.id]: qty - 1,
                          });
                        }
                      }}
                      className="text-ink-mute hover:text-ink font-bold px-1"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono font-bold text-ink text-sm">{qty}</span>
                    <button
                      onClick={() => {
                        setSelectedProducts({
                          ...selectedProducts,
                          [prod.id]: qty + 1,
                        });
                      }}
                      className="text-forest hover:text-forest-soft font-bold px-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 6: Customer Details */}
      {currentStep === 6 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-ink">بيانات الحجز وتأكيد التفاصيل</h2>
            <p className="text-xs text-ink-mute">يرجى كتابة الاسم ورقم الهاتف ليصلك إشعار الحجز ورقم التتبع</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Input Form */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-ink-soft">الاسم الكريم:</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="مثال: عمر الخالد"
                  className="w-full bg-white border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none shadow-clinic-1"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-ink-soft">رقم الهاتف (واتساب):</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="مثال: 01012345678"
                  className="w-full bg-white border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none shadow-clinic-1"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-ink-soft">ملاحظات خاصة (اختياري):</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: يفضل مقعد بجوار النافذة، حساسية معينة..."
                  className="w-full bg-white border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none shadow-clinic-1"
                />
              </div>
            </div>

            {/* Price Breakdown Snapshot */}
            <div className="bg-paper-warm p-5 rounded-2xl border border-border space-y-3.5 shadow-clinic-1">
              <h3 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-3">
                <Sparkles className="w-4 h-4 text-forest" />
                <span>ملخص الفاتورة وتأمين السعر:</span>
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-ink-soft">
                  <span>الفرع:</span>
                  <span className="font-bold text-ink">{currentBranch?.name}</span>
                </div>
                <div className="flex justify-between text-ink-soft">
                  <span>الحلاق المختص:</span>
                  <span className="font-bold text-ink">{currentBarber?.full_name}</span>
                </div>
                <div className="flex justify-between text-ink-soft">
                  <span>التاريخ والوقت:</span>
                  <span className="font-bold text-forest">{selectedDate} في تمام {format12Hour(effectiveTimeSlot)}</span>
                </div>
                <div className="flex justify-between text-ink-soft">
                  <span>الخدمة الأساسية:</span>
                  <span>{formatCurrency(totalServicePrice)}</span>
                </div>
                {productsTotal > 0 && (
                  <div className="flex justify-between text-ink-soft">
                    <span>مشروبات وطلبات إضافية:</span>
                    <span>{formatCurrency(productsTotal)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2 flex justify-between font-bold text-ink text-sm">
                  <span>إجمالي الحساب التقديري:</span>
                  <span className="text-forest font-serif font-bold">{formatCurrency(grandTotal)}</span>
                </div>
                <div className="bg-forest/10 p-2.5 rounded-xl border border-forest/20 text-[11px] text-forest flex justify-between font-bold">
                  <span>عربون تأكيد الحجز المطلوب:</span>
                  <span>{formatCurrency(bookingFee)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 7: Payment Proof Upload */}
      {currentStep === 7 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl text-ink">سداد رسوم تأكيد الحجز</h2>
            <p className="text-xs text-ink-mute">
              سداد عربون الحجز ({formatCurrency(bookingFee)}) لضمان حجز الكرسي والحلاق في الموعد المحدد
            </p>
          </div>

          <div className="bg-white/80 p-6 rounded-3xl border border-border space-y-6 shadow-clinic-2">
            <div className="bg-forest/10 p-3 rounded-2xl border border-forest/20 flex items-center justify-between text-xs font-bold text-forest">
              <span>حسابات تحويل العربون المخصصة لـ ({currentBranch?.name}):</span>
              <span className="text-[10px] bg-forest text-paper px-2 py-0.5 rounded-full font-mono">
                BRANCH SECURE PAY
              </span>
            </div>

            {/* Payment Method Selector (InstaPay & Vodafone Cash with Official Logos) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  id: 'instapay',
                  name: 'إنستاباي (InstaPay)',
                  logo: '/images/instapay-logo.png',
                  badge: 'تحويل لحظي مباشر',
                  badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
                  info: currentBranch?.instapay_username || settings.instapay_username || '01285694670',
                  label: 'عنوان الدفع / رقم إنستاباي:',
                },
                {
                  id: 'vodafone_cash',
                  name: 'فودافون كاش (Vodafone Cash)',
                  logo: '/images/vodafone-cash-logo.png',
                  badge: 'محفظة إلكترونية',
                  badgeColor: 'bg-red-100 text-red-800 border-red-200',
                  info: currentBranch?.vodafone_cash_number || settings.vodafone_cash_number || '010054367633',
                  label: 'رقم محفظة فودافون كاش:',
                },
              ].map((m) => {
                const isSelected = paymentMethod === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col justify-between space-y-3 relative ${
                      isSelected
                        ? 'bg-paper-warm border-forest shadow-clinic-2 ring-2 ring-forest/20'
                        : 'bg-white border-border hover:border-forest/40 hover:bg-paper-warm/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white p-1.5 border border-border shadow-xs flex items-center justify-center overflow-hidden">
                          <img
                            src={m.logo}
                            alt={m.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div>
                          <h4 className="font-serif font-bold text-ink text-sm">{m.name}</h4>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block mt-0.5 ${m.badgeColor}`}
                          >
                            {m.badge}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-forest border-forest text-paper shadow-xs'
                            : 'border-border bg-white text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Account Info Box with Quick Copy */}
                    <div className="bg-white p-2.5 rounded-xl border border-border flex items-center justify-between gap-2">
                      <div className="overflow-hidden">
                        <span className="text-[10px] text-ink-mute block">{m.label}</span>
                        <span className="font-mono font-bold text-forest text-xs truncate block select-all">
                          {m.info}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(m.info);
                          toast.success(`تم نسخ (${m.info}) بنجاح!`);
                        }}
                        className="p-1.5 px-2.5 rounded-lg bg-paper-warm hover:bg-forest hover:text-paper text-ink-soft border border-border text-[11px] font-bold flex items-center gap-1 transition-colors shrink-0 shadow-xs"
                        title="نسخ الرقم"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>نسخ</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Upload Area */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-ink-soft">
                  رقم الهاتف أو اسم الحساب المحول منه:
                </label>
                <input
                  type="text"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="مثال: 01011122233 أو username@instapay"
                  className="w-full bg-white border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-ink-soft">
                  صورة إيصال أو لقطة شاشة التحويل (Screenshot):
                </label>
                <label className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-border bg-paper-warm/50 hover:bg-white cursor-pointer transition-all">
                  {proofImage ? (
                    <div className="flex items-center gap-3">
                      <img src={proofImage} alt="Receipt" className="w-16 h-16 rounded-xl object-cover border border-border shadow-sm" />
                      <div>
                        <p className="font-bold text-forest text-xs">تم رفع صورة الإيصال بنجاح ✓</p>
                        <p className="text-[10px] text-ink-mute">اضغط لتغيير الصورة</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <Upload className="w-8 h-8 text-forest mx-auto" />
                      <p className="font-bold text-ink text-xs">اضغط هنا لرفع صورة الإيصال من جهازك</p>
                      <p className="text-[10px] text-ink-mute">يدعم PNG, JPG, JPEG</p>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrevStep}
                className="btn-clinic-ghost w-full sm:w-auto py-3.5 px-6 text-xs font-bold"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة للخطوة السابقة</span>
              </button>

              <button
                onClick={handleConfirmAndPay}
                disabled={isSubmitting}
                className="btn-clinic-primary flex-1 w-full py-4 text-sm font-bold"
              >
                {isSubmitting ? (
                  <span>جاري إرسال وتأكيد الحجز...</span>
                ) : (
                  <>
                    <span>تأكيد الحجز ورفع الإيصال الآن</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 8: Luxury Digital Ticket Pass */}
      {currentStep === 8 && confirmedBooking && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-forest text-paper rounded-full flex items-center justify-center mx-auto shadow-clinic-2">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <h2 className="font-serif text-3xl text-ink">تم تأكيد حجزك بنجاح!</h2>
            <p className="text-xs text-ink-mute">
              تم إصدار تذكرتك الرقمية وإرسال الإيصال للاستقبال. بانتظار تشريفك في الموعد.
            </p>
          </div>

          <div className="max-w-md mx-auto bg-white p-6 rounded-3xl border border-border shadow-clinic-3 space-y-5 text-xs relative">
            <div className="flex items-center justify-between border-b border-border-soft pb-4">
              <div>
                <h3 className="font-serif font-bold text-ink text-base">صالون النخبة VIP</h3>
                <p className="text-[10px] text-terra font-mono tracking-wider">ELITE BARBER PASS</p>
              </div>
              <span className="font-mono font-bold text-forest bg-forest/10 px-3 py-1 rounded-full border border-forest/20 text-sm">
                {confirmedBooking.id}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 py-2">
              <div className="space-y-2 flex-1">
                <div>
                  <p className="text-ink-mute text-[10px]">العميل:</p>
                  <p className="font-bold text-ink text-sm">{confirmedBooking.customer_name}</p>
                </div>
                <div>
                  <p className="text-ink-mute text-[10px]">الحلاق والكرسي:</p>
                  <p className="font-bold text-ink">{currentBarber?.full_name}</p>
                </div>
                <div>
                  <p className="text-ink-mute text-[10px]">الموعد:</p>
                  <p className="font-bold text-forest">
                    {selectedDate} • {format12Hour(confirmedBooking.starts_at ? (confirmedBooking.starts_at.includes('T') ? confirmedBooking.starts_at.split('T')[1].slice(0, 5) : confirmedBooking.starts_at.slice(11, 16)) : effectiveTimeSlot)}
                  </p>
                </div>
              </div>

              <div className="w-24 h-24 bg-paper-warm p-2 rounded-2xl flex items-center justify-center border border-border">
                <QrCode className="w-full h-full text-forest" />
              </div>
            </div>

            <div className="bg-paper-warm/80 p-3 rounded-xl border border-border space-y-1">
              <div className="flex justify-between">
                <span className="text-ink-mute">رمز التتبع السري:</span>
                <span className="font-mono text-forest font-bold">{confirmedBooking.secure_token}</span>
              </div>
              <div className="flex justify-between font-bold text-ink">
                <span>إجمالي الحساب:</span>
                <span className="text-forest font-serif font-bold">{formatCurrency(confirmedBooking.total_at_booking)}</span>
              </div>
            </div>

            {/* Elegant 5-Minute Review Notice */}
            <div className="bg-amber-500/10 border border-amber-500/25 p-3.5 rounded-2xl flex items-start gap-3 text-right">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-4 h-4 text-amber-800" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-serif font-bold text-amber-950 text-xs">
                  مراجعة واعتماد الحجز خلال 5 دقائق
                </p>
                <p className="text-[11px] text-amber-900/90 leading-relaxed">
                  يقوم فريق الاستقبال حالياً بمراجعة إيصال التحويل وتأكيد الموعد رسمياً. نشكرك على التحلي بالصبر.
                </p>
              </div>
            </div>

            {/* Telegram Queue & Turn Tracking Card */}
            <div className="bg-gradient-to-br from-sky-500/10 via-blue-500/10 to-indigo-500/10 border border-sky-500/30 p-4 rounded-2xl space-y-3 text-right">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#229ED9] text-white flex items-center justify-center shadow-xs shrink-0">
                  <Send className="w-4 h-4 -rotate-45 ml-0.5" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-sky-950 text-xs">
                    استعلام عن الدور ولحظة دخولك عبر بوت التلجرام
                  </h4>
                  <p className="text-[10.5px] text-sky-900/80 font-mono">
                    Official Telegram Queue Bot (@TrimMind_bot)
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-sky-950 leading-relaxed">
                💡 يمكنك الآن متابعة <strong>موقعك في الطابور المباشر</strong> وعدد العملاء المنتظرين قبلك والاستفسار عن أي خدمة في أي وقت عبر بوت التلجرام الرسمي للصالون.
              </p>

              <a
                href={`https://t.me/TrimMind_bot?start=${confirmedBooking.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-xl bg-[#229ED9] hover:bg-[#1e8ec3] text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-clinic-1 hover:shadow-clinic-2 cursor-pointer active:scale-98"
              >
                <Send className="w-4 h-4 -rotate-45" />
                <span>متابعة الدور والاستعلام عبر بوت التلجرام 📲</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            </div>

            {/* Action Buttons: Web Tracking, Print, Cancel / Close */}
            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <Link
                  to={`/track?q=${confirmedBooking.id}`}
                  className="btn-clinic-primary flex-1 py-3 text-xs text-center font-bold shadow-clinic-1"
                >
                  تتبع الحجز على الموقع
                </Link>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-clinic-ghost text-xs font-bold px-4"
                >
                  طباعة
                </button>
              </div>

              {/* Cancel / Dismiss / Return Home Button */}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full py-2.5 rounded-xl border border-border hover:bg-paper-warm text-ink-mute hover:text-ink text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق / إنهاء والعودة للرئيسية</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons (Back & Next) */}
      {currentStep < 7 && (
        <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-border">
          {currentStep > 1 ? (
            <button onClick={handlePrevStep} className="btn-clinic-ghost text-xs">
              <ArrowRight className="w-4 h-4" />
              <span>السابق</span>
            </button>
          ) : (
            <div />
          )}

          <button onClick={handleNextStep} className="btn-clinic-primary text-xs">
            <span>التالي</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VIP Upgrade Notice Modal */}
      {isVipPromptOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsVipPromptOpen(false);
            }
          }}
        >
          <div className="modal-container max-w-md p-6 sm:p-7 shadow-clinic-3 space-y-5 bg-white text-center">
            <div className="w-14 h-14 rounded-2xl bg-terra/15 border border-terra/30 text-terra-deep mx-auto flex items-center justify-center shadow-clinic-1">
              <Crown className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="font-serif font-bold text-lg text-ink">
                ميزة اختيار الكابتن مخصصة لتجربة VIP
              </h3>
              <p className="text-xs text-ink-soft leading-relaxed">
                في <strong>التجربة العادية</strong>، يقوم النظام الذكي بتعيين كابتن الحلاقة المتاح ورقم الدور تلقائياً. 
                <br />
                قم بالتبديل إلى <strong>تجربة VIP الملكية</strong> للاستمتاع باختيار كابتنك المفضل بالاسم وتحديد توقيتك بدقة بالساعة والدقيقة!
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setBookingType('vip');
                  setIsVipPromptOpen(false);
                  toast.success('تم التبديل لتجربة VIP الملكية! يمكنك الآن اختيار الكابتن المفضل.');
                }}
                className="btn-clinic-terra w-full justify-center py-3.5 text-xs font-bold shadow-md"
              >
                <Crown className="w-4 h-4" />
                <span>الترقية لتجربة VIP واختيار الكابتن الآن</span>
              </button>

              <button
                type="button"
                onClick={() => setIsVipPromptOpen(false)}
                className="btn-clinic-ghost w-full py-2.5 text-xs text-ink-soft hover:text-ink"
              >
                المتابعة بالتجربة العادية والكابتن المعين تلقائياً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
