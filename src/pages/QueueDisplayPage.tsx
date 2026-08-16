import React, { useState, useEffect } from 'react';
import { useSalonStore } from '../lib/store';
import {
  Crown,
  Clock,
  Scissors,
  Users,
  Maximize2,
  Minimize2,
  Sparkles,
  Volume2,
  VolumeX,
  Building2,
  CheckCircle,
  Timer,
} from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ar';
import { playCallChime, format12Hour } from '../lib/utils';

dayjs.locale('ar');

export default function QueueDisplayPage() {
  const {
    branches,
    selectedBranchId,
    setSelectedBranchId,
    chairs,
    barbers,
    bookings,
    queue,
    settings,
    lastCalledCustomer,
  } = useSalonStore();

  const salonName = settings.salon_name || 'صالون النخبة VIP';
  const [currentTime, setCurrentTime] = useState(dayjs());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showCallAlert, setShowCallAlert] = useState(false);
  const [mobileTab, setMobileTab] = useState<'all' | 'chairs' | 'queue'>('all');

  // Digital clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(dayjs());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen to last called customer for popup alert & chime
  useEffect(() => {
    if (lastCalledCustomer && Date.now() - lastCalledCustomer.timestamp < 12000) {
      setShowCallAlert(true);
      if (soundEnabled) {
        playCallChime();
      }
      const timeout = setTimeout(() => {
        setShowCallAlert(false);
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [lastCalledCustomer, soundEnabled]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const currentBranch =
    branches.find((b) => b.id === selectedBranchId) || branches[0] || {
      id: '',
      name: salonName,
      address: '',
    };

  const branchChairs = chairs.filter(
    (c) => !c.branch_id || c.branch_id === currentBranch.id
  );

  const branchQueue = queue.filter(
    (q) => !q.branch_id || q.branch_id === currentBranch.id
  );

  return (
    <div className="min-h-screen bg-forest text-paper flex flex-col font-sans select-none overflow-x-hidden relative">
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-terra/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-forest-soft/40 rounded-full blur-[140px] pointer-events-none" />

      {/* 1. TOP HEADER BAR (Compact & Responsive) */}
      <header className="bg-forest-deep/90 border-b border-paper/15 px-3.5 py-3 sm:px-8 sm:py-4 backdrop-blur-md shadow-clinic-2 relative z-20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Brand & Branch Info */}
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-paper text-forest flex items-center justify-center font-bold shadow-clinic-1 shrink-0">
                <Scissors className="w-5 h-5 sm:w-6 sm:h-6 -rotate-45" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-serif font-bold text-paper tracking-wide">
                    {salonName}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-terra text-paper text-[10px] font-bold font-mono shadow-sm">
                    LIVE
                  </span>
                </div>
                <p className="text-[11px] text-paper/80 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-terra-soft" />
                  <span>{currentBranch.name}</span>
                </p>
              </div>
            </div>

            {/* Branch Selector (if multiple) */}
            {branches.length > 1 && (
              <div className="flex sm:hidden items-center gap-1 bg-paper/10 px-2 py-1 rounded-full border border-paper/20 text-[11px]">
                <select
                  value={currentBranch.id}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-transparent text-paper font-bold outline-none cursor-pointer max-w-[100px] truncate text-[11px]"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-forest text-paper">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Controls & Clock */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5">
            {branches.length > 1 && (
              <div className="hidden sm:flex items-center gap-1 bg-paper/10 px-3 py-1.5 rounded-full border border-paper/20 text-xs">
                <Building2 className="w-3.5 h-3.5 text-terra-soft mr-1" />
                <select
                  value={currentBranch.id}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-transparent text-paper font-bold outline-none cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-forest text-paper">
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all ${
                soundEnabled
                  ? 'bg-paper text-forest border-paper shadow-sm'
                  : 'bg-paper/10 border-paper/20 text-paper/60'
              }`}
              title={soundEnabled ? 'صوت التنبيه مفعل' : 'صوت التنبيه مكتوم'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-2 sm:p-2.5 rounded-xl bg-paper/10 hover:bg-paper/20 border border-paper/20 text-paper transition-all"
              title="ملء الشاشة"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Digital Clock */}
            <div className="bg-paper text-ink px-3 py-1 sm:px-5 sm:py-1.5 rounded-xl text-center shadow-clinic-2">
              <p className="text-base sm:text-2xl font-serif font-bold text-forest font-mono tracking-wider leading-none">
                {currentTime.format('hh:mm:ss A')}
              </p>
              <p className="text-[9.5px] sm:text-[11px] text-ink-mute mt-0.5 font-medium">
                {currentTime.format('dddd، D MMMM')}
              </p>
            </div>
          </div>
        </div>

        {/* Mobile View Switcher Tabs (Only visible on mobile) */}
        <div className="grid grid-cols-3 gap-1.5 mt-2.5 lg:hidden pt-2 border-t border-paper/10">
          <button
            onClick={() => setMobileTab('all')}
            className={`py-1.5 px-2 rounded-xl font-bold text-[11px] transition-all text-center ${
              mobileTab === 'all'
                ? 'bg-paper text-forest shadow-xs'
                : 'bg-paper/10 text-paper/80 hover:bg-paper/15'
            }`}
          >
            الكل معاً
          </button>
          <button
            onClick={() => setMobileTab('chairs')}
            className={`py-1.5 px-2 rounded-xl font-bold text-[11px] transition-all text-center ${
              mobileTab === 'chairs'
                ? 'bg-paper text-forest shadow-xs'
                : 'bg-paper/10 text-paper/80 hover:bg-paper/15'
            }`}
          >
            الكراسي ({branchChairs.length})
          </button>
          <button
            onClick={() => setMobileTab('queue')}
            className={`py-1.5 px-2 rounded-xl font-bold text-[11px] transition-all text-center ${
              mobileTab === 'queue'
                ? 'bg-paper text-forest shadow-xs'
                : 'bg-paper/10 text-paper/80 hover:bg-paper/15'
            }`}
          >
            طابور الانتظار ({branchQueue.length})
          </button>
        </div>
      </header>

      {/* 2. MAIN DISPLAY BODY (Space-Efficient & Compact on Mobile) */}
      <main className="flex-1 p-3 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 relative z-10 max-w-7xl mx-auto w-full">
        {/* LEFT COLUMN: ACTIVE CHAIRS MONITOR (7 COLS) */}
        {(mobileTab === 'all' || mobileTab === 'chairs') && (
          <div className="lg:col-span-7 flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-paper/15">
              <h2 className="text-base sm:text-xl font-serif font-bold text-paper flex items-center gap-2">
                <Scissors className="w-4.5 h-4.5 text-terra-soft" />
                <span>كراسي الحلاقة والخدمة الحالية</span>
              </h2>
              <span className="text-xs font-mono text-paper/80 font-bold bg-paper/10 px-2 py-0.5 rounded-full">
                {branchChairs.length} كراسي
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              {branchChairs.map((chair) => {
                const barber = barbers.find((b) => b.id === chair.barber_id);
                const booking = bookings.find(
                  (b) =>
                    b.id === chair.current_booking_id ||
                    (b.chair_id === chair.id && b.status === 'in_service')
                );

                const isInService = chair.status === 'in_service' || !!booking;
                const isCleaning = chair.status === 'cleaning';

                return (
                  <div
                    key={chair.id}
                    className={`rounded-2xl p-3.5 sm:p-5 flex flex-col justify-between transition-all duration-500 border ${
                      isInService
                        ? 'bg-paper text-ink border-paper shadow-clinic-2'
                        : isCleaning
                        ? 'bg-forest-deep/90 border-paper/20 text-paper'
                        : 'bg-paper/10 border-paper/20 text-paper'
                    }`}
                  >
                    {/* Top: Chair Name & Status Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base sm:text-lg font-serif font-bold">{chair.name}</span>
                        {chair.mode === 'vip' && (
                          <span className="px-1.5 py-0.2 rounded-full bg-terra text-paper text-[9.5px] font-bold font-mono">
                            VIP
                          </span>
                        )}
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-bold flex items-center gap-1 ${
                          isInService
                            ? 'bg-terra text-paper animate-pulse'
                            : isCleaning
                            ? 'bg-paper/20 text-paper'
                            : 'bg-emerald-600 text-paper'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-paper" />
                        <span>
                          {isInService ? 'في الخدمة' : isCleaning ? 'تنظيف وتعقيم' : 'متاح للعميل التالي'}
                        </span>
                      </span>
                    </div>

                    {/* Middle: Barber & Client Info */}
                    <div className="py-2.5 space-y-1">
                      {isInService && booking ? (
                        <div>
                          <p className="text-[10.5px] text-ink-mute">العميل الحالي:</p>
                          <h3 className="text-lg sm:text-xl font-serif font-bold text-forest truncate">
                            {booking.customer_name}
                          </h3>
                          <p className="text-xs text-ink-soft flex items-center gap-1 pt-0.5 font-semibold">
                            <span>كابتن: </span>
                            <strong className="text-terra-deep">{barber?.full_name || 'فريق النخبة'}</strong>
                          </p>
                        </div>
                      ) : isCleaning ? (
                        <div className="text-center py-2 text-paper/80">
                          <p className="font-bold text-xs">جاري التعقيم والتجهيز</p>
                          <p className="text-[10.5px] text-paper/60">جاهز خلال دقائق معدودة</p>
                        </div>
                      ) : (
                        <div className="text-center py-2 text-paper/70">
                          <p className="font-serif font-bold text-sm text-paper">جاهز لاستقبال العميل التالي</p>
                          <p className="text-[10.5px] text-paper/60">{barber?.full_name}</p>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Expected End Time / Ready Notice */}
                    <div className="pt-2 border-t border-current/15 flex items-center justify-between text-xs">
                      {isInService && booking ? (
                        <>
                          <span className="opacity-75 flex items-center gap-1 text-[11px]">
                            <Clock className="w-3 h-3" />
                            <span>الانتهاء المتوقع:</span>
                          </span>
                          <span className="font-mono font-bold text-terra-deep text-xs sm:text-sm">
                            {format12Hour(booking.ends_at)}
                          </span>
                        </>
                      ) : (
                        <span className="w-full text-center font-bold text-[11px] opacity-80">
                          كابتن الحلاقة في انتظار نداء العميل
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: QUEUE TICKET BOARD (5 COLS) */}
        {(mobileTab === 'all' || mobileTab === 'queue') && (
          <div className="lg:col-span-5 flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-paper/15">
              <h2 className="text-base sm:text-xl font-serif font-bold text-paper flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-terra-soft" />
                <span>طابور الانتظار (Live Queue)</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-paper text-forest font-bold text-xs font-mono">
                {branchQueue.length} في الانتظار
              </span>
            </div>

            <div className="bg-forest-deep/90 border border-paper/15 rounded-2xl p-3 sm:p-5 flex-1 space-y-2.5 overflow-y-auto shadow-clinic-2 max-h-[550px]">
              {branchQueue.length > 0 ? (
                branchQueue.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                      idx === 0
                        ? 'bg-paper text-ink border-paper shadow-clinic-2 scale-[1.01]'
                        : 'bg-paper/10 border-paper/15 text-paper'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg font-mono font-bold flex items-center justify-center text-xs sm:text-sm shrink-0 ${
                          idx === 0
                            ? 'bg-forest text-paper shadow-sm'
                            : 'bg-paper/20 text-paper'
                        }`}
                      >
                        #{entry.position}
                      </div>

                      <div>
                        <h4 className="font-serif font-bold text-xs sm:text-sm truncate max-w-[140px] sm:max-w-none">
                          {entry.customer_name}
                        </h4>
                        <p className={`text-[10.5px] ${idx === 0 ? 'text-ink-mute' : 'text-paper/70'}`}>
                          كابتن: <strong className={idx === 0 ? 'text-forest font-bold' : 'text-terra-soft'}>{entry.barber_name}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="text-left font-mono shrink-0">
                      <span className={`text-xs font-bold block ${idx === 0 ? 'text-terra-deep' : 'text-terra-soft'}`}>
                        ~{entry.estimated_wait_minutes} دقيقة
                      </span>
                      <span className={`text-[9.5px] ${idx === 0 ? 'text-ink-mute' : 'text-paper/60'}`}>
                        {idx === 0 ? 'الدور القادم' : 'في الانتظار'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 sm:py-20 text-center text-paper/60 space-y-2">
                  <CheckCircle className="w-10 h-10 text-paper mx-auto opacity-70" />
                  <p className="font-serif text-sm sm:text-base font-bold text-paper">لا توجد أدوار انتظار حالياً</p>
                  <p className="text-[11px]">تفضل بالاستراحة والطلب من كافيه الصالون.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 3. POPUP OVERLAY ALERT (CHIME & CALLOUT) */}
      {showCallAlert && lastCalledCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-forest-deep/90 backdrop-blur-xl animate-in zoom-in-95 duration-300">
          <div className="bg-paper text-ink rounded-3xl p-6 sm:p-10 max-w-lg w-full text-center space-y-4 shadow-clinic-3 border-4 border-terra">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-terra text-paper flex items-center justify-center mx-auto shadow-clinic-2 animate-bounce">
              <Scissors className="w-7 h-7 sm:w-8 sm:h-8 -rotate-45" />
            </div>

            <div className="space-y-1">
              <span className="px-3 py-1 rounded-full bg-terra/15 text-terra-deep font-mono font-bold text-xs tracking-wider uppercase">
                ATTENTION • نداء عميل
              </span>
              <h2 className="text-2xl sm:text-4xl font-serif font-bold text-forest pt-1">
                {lastCalledCustomer.customerName}
              </h2>
            </div>

            <div className="bg-paper-warm p-4 sm:p-5 rounded-2xl border border-border space-y-1.5 max-w-sm mx-auto">
              <p className="text-xs text-ink-mute">يرجى التوجه فوراً إلى:</p>
              <p className="text-xl sm:text-2xl font-serif font-bold text-forest">
                {lastCalledCustomer.chairName}
              </p>
              <p className="text-xs sm:text-sm font-bold text-terra-deep pt-0.5">
                مع كابتن الحلاقة: {lastCalledCustomer.barberName}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
