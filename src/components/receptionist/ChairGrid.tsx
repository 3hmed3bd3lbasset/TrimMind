import React from 'react';
import { useSalonStore } from '../../lib/store';
import { Chair, Booking } from '../../types';
import {
  Armchair,
  User,
  Clock,
  Crown,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { formatTime, format12Hour } from '../../lib/utils';
import toast from 'react-hot-toast';

interface ChairGridProps {
  branchId: string;
  onSelectChair?: (chair: Chair) => void;
}

export const ChairGrid: React.FC<ChairGridProps> = ({ branchId, onSelectChair }) => {
  const { chairs, barbers, bookings, transitionBookingStatus, updateChair } = useSalonStore();

  const branchChairs = chairs.filter((c) => c.branch_id === branchId);

  const handleFinishService = async (chair: Chair, bookingId?: string) => {
    const { bookings, transitionBookingStatus, updateChair } = useSalonStore.getState();
    const activeBooking = bookings.find(
      (b) => b.id === bookingId || b.id === chair.current_booking_id || (b.chair_id === chair.id && b.status === 'in_service')
    );

    const bId = activeBooking?.id || bookingId || chair.current_booking_id;
    if (bId) {
      transitionBookingStatus(bId, 'completed', 'تم إنهاء الحلاقة بنجاح من شاشة الكراسي');
      try {
        await fetch(`/api/bookings/${encodeURIComponent(bId)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            note: 'تم إنهاء الخدمة بنجاح',
          }),
        });
      } catch (err) {
        console.warn('Finish service API notice:', err);
      }
    }
    updateChair(chair.id, { status: 'cleaning', current_booking_id: undefined });
    toast.success(`تم إنهاء الخدمة على ${chair.name} وإرسال رسالة الشكر والتقييم للعميل 🧼✨`);
  };

  const handleSetReady = (chair: Chair) => {
    updateChair(chair.id, { status: 'available' });
    toast.success(`${chair.name} جاهز ومتاح الآن لاستقبال العميل التالي ✨`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Armchair className="w-5 h-5 text-forest" />
            <span>مراقبة كراسي الصالون اللحظية (Live Chairs Monitor)</span>
          </h3>
          <p className="text-xs text-ink-mute">حالة الكراسي، العملاء في الخدمة، والعد التنازلي لوقت الانتهاء</p>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-forest font-bold">
            <span className="w-2 h-2 rounded-full bg-ok"></span> متاح
          </span>
          <span className="flex items-center gap-1.5 text-terra font-bold">
            <span className="w-2 h-2 rounded-full bg-terra animate-pulse"></span> في الخدمة
          </span>
          <span className="flex items-center gap-1.5 text-ink-mute font-medium">
            <span className="w-2 h-2 rounded-full bg-paper-deep"></span> قيد التنظيف
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {branchChairs.map((chair) => {
          const barber = barbers.find((b) => b.id === chair.barber_id);
          const currentBooking = bookings.find(
            (b) => b.id === chair.current_booking_id || (b.chair_id === chair.id && b.status === 'in_service')
          );

          const isAvailable = chair.status === 'available' || !chair.status;
          const isInService = chair.status === 'in_service' || !!currentBooking;
          const isCleaning = chair.status === 'cleaning';

          return (
            <div
              key={chair.id}
              className={`clinic-card p-5 space-y-4 transition-all duration-300 ${
                isInService
                  ? 'border-terra/40 shadow-clinic-2 bg-white/90'
                  : isCleaning
                  ? 'border-border-dark bg-paper-warm/80'
                  : 'border-border bg-white/70 hover:bg-white'
              }`}
            >
              {/* Header: Chair name & Mode */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                      isInService
                        ? 'bg-terra text-paper'
                        : isCleaning
                        ? 'bg-paper-deep text-ink-soft'
                        : 'bg-forest text-paper'
                    }`}
                  >
                    <Armchair className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-serif font-bold text-ink text-sm">{chair.name}</h4>
                    <p className="text-[11px] text-ink-mute">{barber?.full_name || 'بدون حلاق مخصص'}</p>
                  </div>
                </div>

                {chair.mode === 'vip' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-terra/15 text-terra-deep border border-terra/30 text-[10px] font-bold flex items-center gap-1 font-mono">
                    <Crown className="w-3 h-3" /> VIP
                  </span>
                )}
              </div>

              {/* Body: State Details */}
              {isInService && currentBooking ? (
                <div className="bg-paper-warm/80 p-3.5 rounded-xl border border-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-mute">العميل الحالي:</span>
                    <strong className="font-bold text-ink">{currentBooking.customer_name}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-mute">رقم الحجز:</span>
                    <span className="font-mono font-bold text-forest">{currentBooking.id}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-mute">موعد الانتهاء المتوقع:</span>
                    <span className="font-mono text-terra font-bold">{format12Hour(currentBooking.ends_at)}</span>
                  </div>
                </div>
              ) : isCleaning ? (
                <div className="bg-paper-deep/50 p-3.5 rounded-xl border border-border text-center space-y-1 text-xs">
                  <p className="font-bold text-ink-soft">الكرسي قيد التعقيم والتنظيف</p>
                  <p className="text-[11px] text-ink-mute">جاهز تقريباً لاستقبال العميل التالي</p>
                </div>
              ) : (
                <div className="bg-white/80 p-3.5 rounded-xl border border-border-soft text-center space-y-1 text-xs">
                  <p className="font-bold text-forest">الكرسي شاغر وجاهز لاستقبال عميل</p>
                  <p className="text-[11px] text-ink-mute">يمكن تسكين عميل مباشر أو استدعاء من الطابور</p>
                </div>
              )}

              {/* Actions */}
              <div className="pt-1 flex gap-2">
                {isInService ? (
                  <button
                    onClick={() => handleFinishService(chair, currentBooking?.id)}
                    className="btn-clinic-primary w-full py-2.5 text-xs"
                  >
                    <span>إنهاء الخدمة وتحويل للتنظيف</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                ) : isCleaning ? (
                  <button
                    onClick={() => handleSetReady(chair)}
                    className="btn-clinic-ghost w-full py-2.5 text-xs bg-white text-forest"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>تأكيد جاهزية الكرسي للعمل</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onSelectChair && onSelectChair(chair)}
                    className="btn-clinic-primary w-full py-2.5 text-xs"
                  >
                    <span>تسكين عميل مباشر (Walk-in)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
