import React, { useState, useMemo, useEffect } from 'react';
import { useSalonStore } from '../../lib/store';
import { Booking, BookingStatus } from '../../types';
import {
  BOOKING_STATUS_CONFIG,
  formatCurrency,
  formatDateTime,
  formatDate,
  format12Hour,
} from '../../lib/utils';
import {
  Search,
  Clock,
  MapPin,
  User,
  Scissors,
  Coffee,
  Receipt,
  Star,
  AlertCircle,
  QrCode,
  Printer,
  Sparkles,
  Check,
  Phone,
  MessageCircle,
  Users,
  Building2,
  CheckCircle2,
  Archive,
  Hourglass,
  AlertTriangle,
  XCircle,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { RatingModal } from './RatingModal';
import toast from 'react-hot-toast';

// Helper to check if a booking tracking session has expired (after 1 hour of completion or cancellation)
export const isBookingTrackingExpired = (booking: Booking): boolean => {
  if (booking.status === 'completed') {
    const finishTime = booking.completed_at || booking.updated_at;
    if (!finishTime) return false;
    const diffMs = Date.now() - new Date(finishTime).getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes >= 60; // Expired 1 hour after completion
  }
  if (booking.status === 'cancelled') {
    const cancelTime = booking.cancelled_at || booking.updated_at;
    if (!cancelTime) return false;
    const diffMs = Date.now() - new Date(cancelTime).getTime();
    return diffMs / (1000 * 60) >= 60; // Expired 1 hour after cancellation
  }
  if (booking.status === 'rejected') {
    return true;
  }
  return false;
};

// Calculate remaining minutes in 1-hour grace period after completion
const getRemainingGraceMinutes = (booking: Booking): number => {
  if (booking.status !== 'completed') return 60;
  const finishTime = booking.completed_at || booking.updated_at;
  if (!finishTime) return 60;
  const diffMs = Date.now() - new Date(finishTime).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  return Math.max(0, 60 - diffMinutes);
};

export const TrackBookingSection: React.FC = () => {
  const { bookings, branches, barbers, services, queue, settings, cancelBooking } = useSalonStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [matchedBookings, setMatchedBookings] = useState<Booking[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [searchStatus, setSearchStatus] = useState<'idle' | 'found' | 'expired' | 'not_found'>('idle');
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Check URL query params if user navigated from booking confirmation (e.g. ?q=BK-9021)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryParam = params.get('q') || params.get('id') || params.get('token');
    if (queryParam) {
      setSearchQuery(queryParam);
      const query = queryParam.trim().toLowerCase();
      const rawResults = bookings.filter(
        (b) =>
          b.id.toLowerCase() === query ||
          b.customer_phone.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')) ||
          b.secure_token.toLowerCase() === query
      );

      if (rawResults.length > 0) {
        const activeResults = rawResults.filter((b) => !isBookingTrackingExpired(b));
        if (activeResults.length > 0) {
          setMatchedBookings(activeResults);
          setSelectedBookingId(activeResults[0].id);
          setSearchStatus('found');
          return;
        }
      }

      // Fetch from backend server API
      fetch(`/api/bookings/track?q=${encodeURIComponent(query)}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const remoteBookings: Booking[] = json.data.map((b: any) => ({
              id: b.id || b.bookingId,
              customer_id: b.customer_id || 'usr-remote',
              customer_name: b.customer_name || b.customerName || 'عميل الصالون',
              customer_phone: b.customer_phone || b.customerPhone || '',
              branch_id: b.branch_id || 'branch-elhdad',
              barber_id: b.barber_id || null,
              service_id: b.service_id || 'srv-haircut',
              booking_type: b.booking_type || 'normal',
              status: b.status || 'pending_review',
              starts_at: b.starts_at || b.startsAt || new Date().toISOString(),
              service_price_at_booking: b.service_price_at_booking || b.total_at_booking || b.totalAmount || 180,
              booking_fee_at_booking: b.booking_fee_at_booking || b.depositRequired || 50,
              discount_at_booking: 0,
              items_total_at_booking: 0,
              total_at_booking: b.total_at_booking || b.totalAmount || 180,
              secure_token: b.secure_token || `TK-${b.id}`,
              queue_number: b.queue_number || b.queueNumber || 1,
              payment_proof: typeof b.payment_proof === 'string' ? JSON.parse(b.payment_proof) : b.payment_proof,
              created_at: b.created_at || new Date().toISOString(),
              updated_at: b.updated_at || new Date().toISOString(),
            }));
            setMatchedBookings(remoteBookings);
            setSelectedBookingId(remoteBookings[0].id);
            setSearchStatus('found');
          } else {
            setMatchedBookings([]);
            setSelectedBookingId('');
            setSearchStatus('not_found');
          }
        })
        .catch(() => {
          setMatchedBookings([]);
          setSelectedBookingId('');
          setSearchStatus('not_found');
        });
    } else {
      setSearchStatus('idle');
    }
  }, [bookings]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    // Search by Booking ID, Secret Token, or Phone Number in local state
    const rawResults = bookings.filter(
      (b) =>
        b.id.toLowerCase() === query ||
        b.customer_phone.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')) ||
        b.secure_token.toLowerCase() === query
    );

    if (rawResults.length > 0) {
      const activeResults = rawResults.filter((b) => !isBookingTrackingExpired(b));
      if (activeResults.length > 0) {
        setMatchedBookings(activeResults);
        setSelectedBookingId(activeResults[0].id);
        setSearchStatus('found');
        return;
      }
    }

    // Query backend API for WhatsApp and online bookings
    try {
      const res = await fetch(`/api/bookings/track?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const remoteBookings: Booking[] = json.data.map((b: any) => ({
          id: b.id || b.bookingId,
          customer_id: b.customer_id || 'usr-remote',
          customer_name: b.customer_name || b.customerName || 'عميل الصالون',
          customer_phone: b.customer_phone || b.customerPhone || '',
          branch_id: b.branch_id || 'branch-elhdad',
          barber_id: b.barber_id || null,
          service_id: b.service_id || 'srv-haircut',
          booking_type: b.booking_type || 'normal',
          status: b.status || 'pending_review',
          starts_at: b.starts_at || b.startsAt || new Date().toISOString(),
          service_price_at_booking: b.service_price_at_booking || b.total_at_booking || b.totalAmount || 180,
          booking_fee_at_booking: b.booking_fee_at_booking || b.depositRequired || 50,
          discount_at_booking: 0,
          items_total_at_booking: 0,
          total_at_booking: b.total_at_booking || b.totalAmount || 180,
          secure_token: b.secure_token || `TK-${b.id}`,
          queue_number: b.queue_number || b.queueNumber || 1,
          payment_proof: typeof b.payment_proof === 'string' ? JSON.parse(b.payment_proof) : b.payment_proof,
          created_at: b.created_at || new Date().toISOString(),
          updated_at: b.updated_at || new Date().toISOString(),
        }));
        setMatchedBookings(remoteBookings);
        setSelectedBookingId(remoteBookings[0].id);
        setSearchStatus('found');
      } else {
        setMatchedBookings([]);
        setSelectedBookingId('');
        setSearchStatus('not_found');
      }
    } catch {
      setMatchedBookings([]);
      setSelectedBookingId('');
      setSearchStatus('not_found');
    }
  };

  const selectedBooking = useMemo(
    () => matchedBookings.find((b) => b.id === selectedBookingId) || bookings.find((b) => b.id === selectedBookingId) || null,
    [matchedBookings, bookings, selectedBookingId]
  );

  const branch = branches.find((b) => b.id === selectedBooking?.branch_id) || {
    id: selectedBooking?.branch_id || 'branch-elhdad',
    name: 'الحداد - ELHDAD',
    address: 'سقيل - مركز أوسيم',
    phone: '01005437633',
    opening_time: '10:00',
    closing_time: '23:30',
    total_chairs: 4,
    is_active: true,
  };
  const barber = barbers.find((b) => b.id === selectedBooking?.barber_id) || {
    id: selectedBooking?.barber_id || 'barber-lead',
    full_name: 'كابتن الصالون الرئيسي',
    specialty: 'خبير قص وتصفيف وتسريحات VIP',
    is_active: true,
    rating: 4.9,
    rating_count: 38,
    branch_id: 'branch-elhdad',
  };
  const service = services.find((s) => s.id === selectedBooking?.service_id) || {
    id: selectedBooking?.service_id || 'srv-haircut',
    name: (selectedBooking as any)?.service_name || 'قص وتصفيف الشعر الاحترافي',
    price: selectedBooking?.service_price_at_booking || 180,
    duration_minutes: 30,
    category: 'hair',
    is_active: true,
    is_vip_only: false,
  };
  const queueEntry = queue.find((q) => q.booking_id === selectedBooking?.id);

  // Dynamic Live Queue calculation for remaining clients ahead
  const queueStats = useMemo(() => {
    if (!selectedBooking) return { clientsAhead: 0, estimatedWait: 0, isCurrentInService: false, myQueueNumber: 1 };

    const bookingDate = selectedBooking.starts_at?.split('T')[0];

    // All active confirmed/in_service bookings for this barber on this booking date (excluding cancelled)
    const barberDayBookings = bookings.filter(
      (b) =>
        b.barber_id === selectedBooking.barber_id &&
        b.starts_at?.split('T')[0] === bookingDate &&
        (b.status === 'confirmed' ||
          b.status === 'customer_arrived' ||
          b.status === 'in_service' ||
          b.status === 'completed')
    );

    const isCurrentInService = selectedBooking.status === 'in_service';
    const myQueueNumber = selectedBooking.queue_number || (queueEntry?.position || 1);

    // Count remaining waiting clients ahead in line
    const pendingBeforeMe = barberDayBookings.filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'customer_arrived' || b.status === 'in_service') &&
        b.id !== selectedBooking.id &&
        ((b.queue_number || 1) < myQueueNumber ||
          ((b.queue_number || 1) === myQueueNumber && b.created_at < selectedBooking.created_at))
    );

    const clientsAhead = pendingBeforeMe.length;
    const estimatedWait = Math.max(0, clientsAhead * 25);

    return { clientsAhead, estimatedWait, isCurrentInService, myQueueNumber };
  }, [bookings, selectedBooking, queueEntry]);

  const customerServicePhone = branch?.phone || settings.primary_phone || '01000000000';

  const statusConfig = selectedBooking
    ? BOOKING_STATUS_CONFIG[selectedBooking.status]
    : BOOKING_STATUS_CONFIG.confirmed;

  const PIPELINE_STEPS: { status: BookingStatus; label: string; stepNumber: number }[] = [
    { status: 'awaiting_payment', label: 'في انتظار الدفع', stepNumber: 1 },
    { status: 'pending_review', label: 'مراجعة الإيصال', stepNumber: 2 },
    { status: 'confirmed', label: 'حجز مؤكد', stepNumber: 3 },
    { status: 'customer_arrived', label: 'وصل للصالون', stepNumber: 4 },
    { status: 'in_service', label: 'على الكرسي الآن', stepNumber: 5 },
    { status: 'completed', label: 'مكتمل بنجاح', stepNumber: 6 },
  ];

  const getStepState = (stepStatus: BookingStatus, stepNumber: number) => {
    if (!selectedBooking) return 'pending';
    const currentStepIndex = PIPELINE_STEPS.findIndex((s) => s.status === selectedBooking.status);
    const targetStepIndex = PIPELINE_STEPS.findIndex((s) => s.status === stepStatus);

    if (currentStepIndex > targetStepIndex) return 'completed';
    if (currentStepIndex === targetStepIndex) return 'current';
    return 'pending';
  };

  const remainingMinutesGrace = selectedBooking ? getRemainingGraceMinutes(selectedBooking) : 0;

  const handleConfirmCancelBooking = () => {
    if (!selectedBooking) return;
    cancelBooking(selectedBooking.id, 'إلغاء من قبل العميل من شاشة التتبع');
    setIsCancelModalOpen(false);
    toast.success('تم إلغاء الحجز بنجاح وتحديث قائمة الانتظار فورياً');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6 sm:space-y-8 font-sans text-ink">
      {/* Header */}
      <div className="text-center space-y-2 sm:space-y-3">
        <span className="text-xs font-mono font-bold text-forest uppercase tracking-wider block">
          LIVE QUEUE & REAL-TIME TRACKING
        </span>
        <h1 className="font-serif text-2xl sm:text-4xl font-bold text-ink">
          تتبع حالة الحجز والدور المباشر
        </h1>
        <p className="text-xs text-ink-mute max-w-lg mx-auto leading-relaxed">
          استعلم برقم هاتفك أو رمز التتبع السري لمعرفة رقم دورك وعدد العملاء المتبقين بدقة لحظة بلحظة.
        </p>
      </div>

      {/* Search Input Box */}
      <form onSubmit={handleSearch} className="max-w-xl mx-auto">
        <div className="clinic-card p-2 shadow-clinic-2 flex items-center gap-2 bg-white">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-mute absolute right-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث برقم الهاتف (010...) أو رقم الحجز (BK-...) أو الرمز السري"
              className="w-full bg-transparent pr-10 pl-3 py-2.5 text-xs text-ink placeholder:text-ink-mute outline-none"
            />
          </div>
          <button type="submit" className="btn-clinic-primary text-xs py-2.5 px-5 sm:px-6 font-bold shrink-0">
            استعلام
          </button>
        </div>
      </form>

      {/* Multi-booking phone match selector */}
      {matchedBookings.length > 1 && (
        <div className="clinic-card p-4 bg-paper-warm border border-border space-y-2">
          <p className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
            <Users className="w-4 h-4 text-forest" />
            <span>تم العثور على أكثر من حجز نشط لهذا الرقم، اختر الحجز المراد تتبعه:</span>
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {matchedBookings.map((b) => {
              const bService = services.find((s) => s.id === b.service_id);
              const isSelected = b.id === selectedBookingId;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBookingId(b.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                    isSelected
                      ? 'bg-forest text-paper border-forest shadow-clinic-1'
                      : 'bg-white text-ink border-border hover:border-forest/40'
                  }`}
                >
                  <span className="font-mono">{b.id}</span>
                  <span className="mx-1.5 opacity-60">•</span>
                  <span>{bService?.name || 'خدمة حلاقة'}</span>
                  <span className="mx-1.5 opacity-60">•</span>
                  <span className="text-[10px] opacity-80">{b.booking_type === 'vip' ? 'VIP' : 'عادي'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Case 1: Active Booking Found */}
      {searchStatus === 'found' && selectedBooking && (
        <div className="clinic-card p-5 sm:p-8 shadow-clinic-3 bg-white/95 space-y-6 animate-in fade-in duration-300">
          {/* Top Status and Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-paper-warm text-ink border border-border">
                  #{selectedBooking.id}
                </span>
                <span
                  className={`text-xs font-bold px-3.5 py-1 rounded-full border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                >
                  {statusConfig.label}
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    selectedBooking.booking_type === 'vip'
                      ? 'bg-[#fef3c7] text-[#b45309] border-[#f59e0b]/30'
                      : 'bg-paper-deep text-ink border-border'
                  }`}
                >
                  {selectedBooking.booking_type === 'vip' ? 'جناح VIP الملكي' : 'حجز عادي'}
                </span>
              </div>
              <p className="text-xs text-ink-mute">
                تاريخ التسجيل: <strong className="font-mono">{formatDateTime(selectedBooking.created_at)}</strong>
              </p>
            </div>

            {/* Actions: Cancel Booking & Print */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {/* Cancel Booking Button */}
              {selectedBooking.status !== 'completed' &&
                selectedBooking.status !== 'cancelled' &&
                selectedBooking.status !== 'rejected' && (
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="btn-clinic-ghost text-xs text-rose-700 hover:bg-rose-50 border-rose-200 font-bold flex items-center gap-1.5 shadow-xs"
                    title="إلغاء هذا الحجز"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>إلغاء الحجز</span>
                  </button>
                )}

              <button
                onClick={() => window.print()}
                className="btn-clinic-ghost text-xs px-3 py-2 flex items-center gap-1 font-bold"
                title="طباعة التذكرة والإيصال"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة</span>
              </button>
            </div>
          </div>

          {/* Cancelled Banner if cancelled */}
          {selectedBooking.status === 'cancelled' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3.5 text-right">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
                <XCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 text-xs">
                <h4 className="font-serif font-bold text-rose-900 text-sm">تم إلغاء هذا الحجز</h4>
                <p className="text-rose-700 leading-relaxed">
                  تم إلغاء هذا الحجز مسبقاً وتحديث منظومة الطابور فورياً وترحيل الأدوار للعملاء التاليين.
                </p>
                {selectedBooking.cancellation_reason && (
                  <p className="text-rose-800 font-bold">
                    السبب: {selectedBooking.cancellation_reason}
                  </p>
                )}
                <div className="mt-2 p-2.5 rounded-xl bg-rose-100/80 border border-rose-300 text-rose-900 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    ⚠️ <strong>تنبيه مالي وسياسة الصالون:</strong> قيمة رسم الحجز والعربون المدفوع (50 ج.م) غير قابلة للاسترداد بعد تثبيت الموعد، نظراً لحجز وقت ومقعد مخصص لكم في الصالون.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Live Queue Banner (For normal confirmed / arrived bookings) */}
          {selectedBooking.status !== 'completed' && selectedBooking.status !== 'cancelled' && (
            <div className="p-5 rounded-2xl bg-forest/5 border border-forest/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-forest text-paper flex items-center justify-center font-mono font-extrabold text-xl shrink-0 shadow-clinic-1">
                  #{queueStats.myQueueNumber}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-sm sm:text-base text-ink">
                    {queueStats.isCurrentInService ? (
                      <span className="text-forest flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-forest animate-spin" />
                        <span>أنت على الكرسي الآن! نتمنى لك تجربة حلاقة ملكية فاخرة.</span>
                      </span>
                    ) : queueStats.clientsAhead === 0 ? (
                      <span className="text-forest">أنت التالي مباشرة! استعد للجلوس على الكرسي.</span>
                    ) : (
                      <span>
                        أمامك حالياً <strong className="text-forest font-mono text-base">{queueStats.clientsAhead}</strong> عملاء في قائمة الانتظار
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-ink-mute mt-0.5">
                    رقم دورك المسجل: <strong className="font-mono text-forest">#{queueStats.myQueueNumber}</strong> مع كابتن <strong>{barber?.full_name}</strong>
                  </p>
                </div>
              </div>

              {/* Waiting info & Help phone */}
              <div className="flex items-center gap-3 text-xs shrink-0 self-start sm:self-auto">
                {queueStats.clientsAhead > 0 && (
                  <div className="text-center bg-white p-2.5 rounded-xl border border-border shadow-sm">
                    <span className="text-[10px] text-ink-mute block">الوقت التقديري:</span>
                    <strong className="text-forest font-mono text-xs">~{queueStats.estimatedWait} دقيقة</strong>
                  </div>
                )}
                <div className="text-right">
                  <span className="text-[10px] text-ink-mute block">للاستفسار عن الحضور الدقيق:</span>
                  <a
                    href={`tel:${customerServicePhone}`}
                    className="font-mono font-bold text-terra hover:underline text-xs flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{customerServicePhone}</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* 6-Step Visual Timeline */}
          {selectedBooking.status !== 'cancelled' && (
            <div className="space-y-3 py-2">
              <h3 className="font-serif font-bold text-xs text-ink-soft">مراحل الحجز والخدمة:</h3>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {PIPELINE_STEPS.map((step) => {
                  const state = getStepState(step.status, step.stepNumber);
                  return (
                    <div
                      key={step.status}
                      className={`p-3 rounded-2xl text-center border transition-all ${
                        state === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-forest shadow-sm'
                          : state === 'current'
                          ? 'bg-forest text-paper border-forest ring-2 ring-forest/30 shadow-clinic-2 scale-105'
                          : 'bg-paper-warm/50 border-border text-ink-mute'
                      }`}
                    >
                      <div className="flex justify-center mb-1.5">
                        {state === 'completed' ? (
                          <div className="w-5 h-5 rounded-full bg-forest text-paper flex items-center justify-center shadow-xs">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : state === 'current' ? (
                          <span className="w-2.5 h-2.5 rounded-full bg-paper animate-ping" />
                        ) : (
                          <span className="font-mono text-[10px] font-bold opacity-60">
                            {step.stepNumber}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold block leading-tight">{step.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Booking Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-paper-warm/80 p-4 rounded-2xl border border-border space-y-2.5">
              <p className="font-serif font-bold text-ink text-sm flex items-center gap-1.5">
                <Scissors className="w-4 h-4 text-forest" />
                <span>تفاصيل الموعد والفرع:</span>
              </p>
              <div className="space-y-1.5 text-ink-soft">
                <div className="flex justify-between">
                  <span>الفرع:</span>
                  <strong className="text-ink">{branch?.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span>كابتن الحلاقة:</span>
                  <strong className="text-ink">{barber?.full_name}</strong>
                </div>
                <div className="flex justify-between">
                  <span>الخدمة الأساسية:</span>
                  <strong className="text-ink">{service?.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ والوقت:</span>
                  <strong className="font-mono text-ink">
                    {selectedBooking.starts_at ? formatDate(selectedBooking.starts_at) : 'اليوم المحدد'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="bg-paper-warm/80 p-4 rounded-2xl border border-border space-y-2.5">
              <p className="font-serif font-bold text-ink text-sm flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-forest" />
                <span>تفاصيل الحساب والفاتورة:</span>
              </p>
              <div className="space-y-2 text-ink-soft">
                <div className="flex justify-between items-center">
                  <span>إجمالي قيمة الخدمة:</span>
                  <strong className="text-ink font-mono text-sm">
                    {formatCurrency(selectedBooking.total_at_booking || service?.price || 180)}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span>العربون المسدد (رسم الحجز):</span>
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {formatCurrency(selectedBooking.booking_fee_at_booking || 50)} ✓
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-border/80 pt-1.5">
                  <span className="font-bold text-ink">المتبقي للدفع بالصالون:</span>
                  <strong className="text-forest font-serif font-bold text-base">
                    {formatCurrency(
                      Math.max(0, (selectedBooking.total_at_booking || service?.price || 180) - (selectedBooking.booking_fee_at_booking || 50))
                    )}
                  </strong>
                </div>
                <div className="flex justify-between text-[11px] pt-1">
                  <span>حالة الدفع:</span>
                  <span className="text-forest font-bold">
                    {selectedBooking.status === 'cancelled' ? 'ملغي (عربون غير مسترد)' : 'عربون مؤكد بالخزينة ✓'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Completed Rating Banner */}
          {selectedBooking.status === 'completed' && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-[#fef3c7] to-[#fffbeb] border border-[#f59e0b]/30 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-right">
                <div className="w-12 h-12 rounded-2xl bg-[#f59e0b] text-white flex items-center justify-center shrink-0 shadow-md">
                  <Star className="w-6 h-6 fill-white" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-ink text-base">
                    {selectedBooking.rating ? 'شكراً لتقييمك الرائع!' : 'كيف كانت تجربة حلاقتك اليوم؟'}
                  </h4>
                  <p className="text-xs text-ink-mute">
                    {selectedBooking.rating
                      ? `تم تقييم الكابتن والمكان بـ (${selectedBooking.rating.stars || 5} من 5 نجوم)`
                      : 'شاركنا تقييم الكابتن والخدمة والمكان لمساعدتنا على تقديم أرقى مستوى.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsRatingModalOpen(true)}
                className="btn-clinic-primary bg-[#f59e0b] hover:bg-[#d97706] text-white text-xs px-6 py-3 font-bold shrink-0 shadow-md"
              >
                <Star className="w-4 h-4 fill-white" />
                <span>{selectedBooking.rating ? 'تعديل التقييم' : 'تقييم التجربة الآن'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Case 0: Idle State - Waiting for user search query */}
      {searchStatus === 'idle' && (
        <div className="clinic-card border border-border/80 p-8 sm:p-12 text-center space-y-6 bg-white/95 shadow-clinic-2 animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-forest/10 border border-forest/20 text-forest flex items-center justify-center mx-auto shadow-sm">
            <Sparkles className="w-8 h-8 text-forest" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-ink">
              منظومة التتبع اللحظي جاهزة للاستعلام
            </h3>
            <p className="text-xs text-ink-soft leading-relaxed">
              أدخل <strong className="text-forest">رقم هاتفك</strong> المسجل بالحجز، أو <strong className="text-forest">رقم الحجز</strong> (مثل <code className="font-mono bg-paper-warm px-1.5 py-0.5 rounded border border-border">BK-9021</code>)، أو <strong className="text-forest">رمز التتبع السري</strong> في شريط البحث بالأعلى، ثم اضغط على زر <strong className="text-terra">استعلام</strong> لمعرفة رقم دورك والوقت المتبقي بدقة.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 max-w-2xl mx-auto text-right">
            <div className="p-4 bg-paper-warm/80 rounded-2xl border border-border space-y-1">
              <div className="flex items-center gap-2 text-forest font-bold text-xs">
                <Phone className="w-4 h-4 text-forest shrink-0" />
                <span>برقم الهاتف المحمول</span>
              </div>
              <p className="text-[11px] text-ink-mute leading-relaxed">
                استعلم برقم هاتفك للوصول لكافة حجوزاتك الحالية في الفرع
              </p>
            </div>

            <div className="p-4 bg-paper-warm/80 rounded-2xl border border-border space-y-1">
              <div className="flex items-center gap-2 text-terra-deep font-bold text-xs">
                <Clock className="w-4 h-4 text-terra shrink-0" />
                <span>عداد زمني ودور لحظي</span>
              </div>
              <p className="text-[11px] text-ink-mute leading-relaxed">
                معرفة عدد العملاء أمامك وتوقيت حضورك الفعلي دون انتظار
              </p>
            </div>

            <div className="p-4 bg-paper-warm/80 rounded-2xl border border-border space-y-1">
              <div className="flex items-center gap-2 text-forest font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-forest shrink-0" />
                <span>إشعار استدعاء الكرسي</span>
              </div>
              <p className="text-[11px] text-ink-mute leading-relaxed">
                تنبيه وتحديث فوري بمجرد استدعاء كابتن الحلاقة لدورك
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Case 2: Expired State */}
      {searchStatus === 'expired' && (
        <div className="clinic-card border-dashed border-2 border-border p-12 text-center text-ink-mute space-y-4 bg-white/95 animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-full bg-paper-warm border border-border flex items-center justify-center mx-auto text-ink-mute shadow-xs">
            <Archive className="w-8 h-8 opacity-70" />
          </div>
          <h4 className="font-serif text-lg font-bold text-ink">هذا الحجز منتهي أو تمت أرشفته</h4>
          <p className="text-xs max-w-md mx-auto leading-relaxed text-ink-soft">
            تم إتمام جلسة الحلاقة الخاصة بهذا الحجز واستدعاء العميل التالي. وفقاً لسياسة الخصوصية وحماية البيانات، تنتهي جلسة التتبع المباشر بعد ساعة من اكتمال الخدمة.
          </p>
          <div className="pt-2">
            <Link to="/book" className="btn-clinic-primary text-xs font-bold px-6 py-2.5">
              حجز موعد جديد
            </Link>
          </div>
        </div>
      )}

      {/* Case 3: Not Found State */}
      {searchStatus === 'not_found' && (
        <div className="clinic-card border-dashed border-2 border-border p-12 text-center text-ink-mute space-y-3 bg-white/95 animate-in fade-in duration-300">
          <AlertCircle className="w-12 h-12 text-terra mx-auto opacity-80" />
          <h4 className="font-serif text-lg font-bold text-ink">لم يتم العثور على أي حجز مطابق</h4>
          <p className="text-xs max-w-md mx-auto text-ink-soft">
            تأكد من كتابة رقم الهاتف بشكل صحيح، أو أدخل رقم الحجز مثل <strong className="font-mono">BK-9021</strong>.
          </p>
        </div>
      )}

      {/* Cancellation Warning Modal (Exact Request with Centered Warning Icon) */}
      {isCancelModalOpen && selectedBooking && (
        <div className="modal-overlay">
          <div className="modal-container max-w-md p-6 sm:p-8 space-y-5 text-center">
            {/* Centered Top Warning Icon */}
            <div className="w-16 h-16 rounded-full bg-amber-500/15 text-amber-700 border border-amber-500/30 flex items-center justify-center mx-auto shadow-sm">
              <AlertTriangle className="w-8 h-8 text-amber-600 animate-pulse" />
            </div>

            <div className="space-y-2">
              <h4 className="font-serif font-bold text-lg text-ink">
                تأكيد إلغاء الحجز
              </h4>
              <p className="text-xs text-ink-soft leading-relaxed">
                هل أنت متأكد من إلغاء الحجز؟ علماً بأنه لا يمكنك استرداد رسوم وعربون الحجز لأي سبب من الأسباب وفقاً لسياسة وشروط الصالون.
              </p>
            </div>

            <div className="p-3 bg-paper-warm rounded-2xl border border-border text-xs text-ink-mute space-y-1">
              <p>رقم الحجز: <strong className="font-mono text-ink">#{selectedBooking.id}</strong></p>
              <p>رقم الدور: <strong className="font-mono text-forest">#{selectedBooking.queue_number || queueStats.myQueueNumber}</strong></p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleConfirmCancelBooking}
                className="btn-clinic-primary bg-rose-700 hover:bg-rose-800 text-white flex-1 py-3 text-xs font-bold shadow-md"
              >
                تأكيد إلغاء الحجز نهائياً
              </button>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="btn-clinic-ghost text-xs px-5 font-bold"
              >
                التراجع والاحتفاظ بالحجز
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-criteria Rating Modal */}
      {selectedBooking && (
        <RatingModal
          bookingId={selectedBooking.id}
          isOpen={isRatingModalOpen}
          onClose={() => setIsRatingModalOpen(false)}
        />
      )}
    </div>
  );
};
