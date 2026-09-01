import React, { useState, useMemo } from 'react';
import { useSalonStore } from '../../lib/store';
import { QueueEntry, Booking } from '../../types';
import { Users, Clock, UserCheck, Scissors, Calendar, Sparkles } from 'lucide-react';
import { playCallChime, format12Hour } from '../../lib/utils';
import toast from 'react-hot-toast';

interface QueueListProps {
  branchId: string;
}

export const QueueList: React.FC<QueueListProps> = ({ branchId }) => {
  const { queue, transitionBookingStatus, bookings, chairs, barbers, updateChair } = useSalonStore();

  // Helper to format ISO date string (YYYY-MM-DD)
  const getTodayIso = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayIso());

  // Generate Week Days Options (Today + surrounding days)
  const weekDays = useMemo(() => {
    const days = [];
    const today = new Date();
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const dayName = i === 0 ? 'اليوم' : arabicDays[date.getDay()];
      const subLabel = `${arabicDays[date.getDay()]} ${date.getDate()} ${arabicMonths[date.getMonth()]}`;

      days.push({
        dateStr,
        dayName,
        subLabel,
        fullDayName: arabicDays[date.getDay()],
        dayNum: date.getDate(),
        isToday: i === 0,
      });
    }
    return days;
  }, []);

  // Compute Active Live Queue dynamically for the Selected Date
  const activeQueueList = useMemo(() => {
    // 1. Get confirmed bookings for this date and branch
    const dayBookings = bookings.filter((b) => {
      if (branchId && b.branch_id && b.branch_id !== branchId && b.branch_id !== 'branch-elhdad' && b.branch_id !== 'branch-1') {
        return false;
      }

      const bookingDate = (b as any).booking_date || (b.starts_at ? b.starts_at.slice(0, 10) : '');
      const isDateMatch = bookingDate === selectedDate || (b.starts_at && b.starts_at.startsWith(selectedDate));
      if (!isDateMatch) return false;

      // Only show confirmed bookings waiting for their turn on the chair
      return b.status === 'confirmed' || b.status === 'customer_arrived';
    });

    // 2. Sort bookings by queue number or starts_at time
    dayBookings.sort((a, b) => {
      if (a.queue_number && b.queue_number) {
        return a.queue_number - b.queue_number;
      }
      const timeA = new Date(a.starts_at || 0).getTime();
      const timeB = new Date(b.starts_at || 0).getTime();
      return timeA - timeB;
    });

    // 3. Map into Queue Entries
    const resolvedEntries = dayBookings.map((b, index) => {
      const barberObj = barbers.find((bar) => bar.id === b.barber_id);
      const displayBarber =
        barberObj?.full_name ||
        (b as any)?.barber_name ||
        (b as any)?.barberName ||
        'محمد الحداد';

      const displayService =
        b.service_name ||
        (b as any)?.serviceName ||
        (b.custom_line_items && b.custom_line_items.length > 0 ? b.custom_line_items.map((i: any) => i.name).join(' + ') : 'قص وتصفيف كلاسيكي');

      const cleanName = (b.customer_name || 'عميلنا الكريم').replace(/عميل واتساب|\(|\)|\d+/g, '').trim();

      return {
        id: b.id,
        booking_id: b.id,
        branch_id: b.branch_id,
        customer_name: cleanName,
        customer_phone: b.customer_phone,
        service_name: displayService,
        barber_name: displayBarber,
        position: b.queue_number || index + 1,
        starts_at: b.starts_at,
        booking_type: b.booking_type,
        estimated_wait_minutes: Math.max(10, (index + 1) * 15),
        originalBooking: b,
      };
    });

    return resolvedEntries;
  }, [bookings, branchId, selectedDate, barbers]);

  const handleCallNext = async (entry: any) => {
    const targetBookingId = entry.booking_id || entry.id;
    const booking = entry.originalBooking || bookings.find((b) => b.id === targetBookingId);

    const bookingIdToUse = booking?.id || targetBookingId;

    // 1. Remove from in-memory queue
    useSalonStore.setState((state) => ({
      queue: state.queue.filter((q) => q.id !== entry.id && q.booking_id !== bookingIdToUse),
    }));

    // 2. Play audio chime locally
    playCallChime();

    // 3. Find chair for barber
    const matchingChair =
      chairs.find(
        (c) =>
          (c.branch_id === branchId || !branchId) &&
          booking?.barber_id &&
          c.barber_id === booking.barber_id &&
          c.status !== 'in_service' &&
          c.status !== 'cleaning'
      ) ||
      chairs.find((c) => (c.branch_id === branchId || !branchId) && c.status === 'available') ||
      chairs.find((c) => c.status !== 'in_service') ||
      chairs[0];

    const chosenChairId = matchingChair?.id;

    // 4. Transition booking status with explicit chairId
    transitionBookingStatus(bookingIdToUse, 'in_service', 'تم استدعاء العميل وبدء الحلاقة على الكرسي', chosenChairId);

    if (matchingChair) {
      updateChair(matchingChair.id, {
        status: 'in_service',
        current_booking_id: bookingIdToUse,
      });
    }

    // 5. Send API status update
    try {
      await fetch(`/api/bookings/${encodeURIComponent(bookingIdToUse)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_service',
          chair_id: chosenChairId,
          note: 'تم استدعاء العميل وتسكينه على الكرسي',
        }),
      });
    } catch (err) {
      console.warn('API call notice:', err);
    }

    const barberDisplay = entry.barber_name || (booking as any)?.barber_name || 'الكابتن المخصص';
    toast.success(`تم استدعاء ${entry.customer_name} وتسكينه على كرسي كابتن ${barberDisplay} ✂️👑`);
  };

  const selectedDayInfo = weekDays.find((d) => d.dateStr === selectedDate) || weekDays[0];

  return (
    <div className="clinic-card p-4 sm:p-5 space-y-4 shadow-clinic-2 bg-white/95 border border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-forest text-paper flex items-center justify-center shadow-clinic-1 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-ink text-sm sm:text-base">طابور الحجز والانتظار الحي</h3>
            <p className="text-[11px] text-ink-mute">
              حجوزات يوم <strong className="text-forest">{selectedDayInfo.subLabel}</strong>
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-forest bg-forest/10 border border-forest/20 px-3 py-1 rounded-full font-mono shadow-xs">
          {activeQueueList.length} عملاء
        </span>
      </div>

      {/* Week Days Filter Bar */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-ink-soft flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-forest" />
          <span>اختر يوم الطابور:</span>
        </label>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
          {weekDays.map((day) => {
            const isSelected = selectedDate === day.dateStr;
            return (
              <button
                key={day.dateStr}
                onClick={() => setSelectedDate(day.dateStr)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs flex flex-col items-center gap-0.5 cursor-pointer ${
                  isSelected
                    ? 'bg-forest text-paper shadow-clinic-1 scale-[1.02]'
                    : 'bg-paper-warm text-ink-soft hover:bg-white border border-border/80'
                }`}
              >
                <span>{day.dayName}</span>
                <span className={`text-[10px] font-mono ${isSelected ? 'text-amber-200' : 'text-ink-mute'}`}>
                  {day.dayNum}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Queue Cards List */}
      {activeQueueList.length > 0 ? (
        <div className="space-y-3">
          {activeQueueList.map((entry) => {
            return (
              <div
                key={entry.id}
                className="bg-white p-3.5 sm:p-4 rounded-2xl border border-border space-y-3 text-xs shadow-clinic-1 hover:border-forest/40 transition-all"
              >
                {/* Header Row: Position + Customer Info + Time/VIP Badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-forest text-paper font-mono font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                      #{entry.position}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-serif font-bold text-ink text-sm sm:text-base truncate leading-snug">
                        {entry.customer_name}
                      </h4>
                      {entry.customer_phone && (
                        <span className="text-[11px] text-ink-mute font-mono block">
                          {entry.customer_phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.booking_type === 'vip' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                        👑 VIP
                      </span>
                    )}
                    {entry.starts_at && (
                      <span className="text-[11px] font-mono font-bold text-forest bg-forest/10 px-2 py-0.5 rounded-md border border-forest/20">
                        {format12Hour(entry.starts_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Dedicated Service & Barber Box */}
                <div className="bg-paper-warm/80 p-2.5 sm:p-3 rounded-xl border border-border/80 space-y-1.5 text-xs">
                  <div className="flex items-start gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-forest shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-ink-mute text-[10px] block">الخدمة المطلوبة:</span>
                      <p className="font-bold text-ink text-xs leading-relaxed">
                        {entry.service_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-[11px]">
                    <span className="text-ink-mute">الكابتن المخصص:</span>
                    <strong className="text-forest font-bold">{entry.barber_name}</strong>
                  </div>
                </div>

                {/* Footer Action Row (Mobile Optimized) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                  <span className="flex items-center gap-1.5 text-ink-mute text-[11px] font-mono">
                    <Clock className="w-3.5 h-3.5 text-forest" />
                    <span>متبقي في الطابور: ~{entry.estimated_wait_minutes} دقيقة</span>
                  </span>

                  <button
                    onClick={() => handleCallNext(entry)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-forest hover:bg-forest-soft text-paper font-bold flex items-center justify-center gap-1.5 text-xs shadow-xs transition-all cursor-pointer active:scale-95"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>استدعاء للكرسي</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-10 text-center text-ink-mute text-xs space-y-1.5 bg-paper-warm/50 rounded-2xl border border-dashed border-border">
          <Calendar className="w-8 h-8 text-forest/40 mx-auto" />
          <p className="font-bold text-ink font-serif text-sm">
            لا توجد حجوزات مؤكدة في طابور يوم {selectedDayInfo.fullDayName}
          </p>
          <p className="text-[11px]">
            يمكنك الانتقال للأيام الأخرى أو قبول الحجوزات المعلقة لإدراجها في الطابور ✨
          </p>
        </div>
      )}
    </div>
  );
};

