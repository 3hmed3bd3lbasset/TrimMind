import React from 'react';
import { useSalonStore } from '../../lib/store';
import { QueueEntry } from '../../types';
import { Users, Clock, UserCheck } from 'lucide-react';
import { playCallChime } from '../../lib/utils';
import toast from 'react-hot-toast';

interface QueueListProps {
  branchId: string;
}

export const QueueList: React.FC<QueueListProps> = ({ branchId }) => {
  const { queue, transitionBookingStatus, bookings, chairs, updateChair } = useSalonStore();

  const branchQueue = queue.filter(
    (q) => !branchId || q.branch_id === branchId || q.branch_id === 'branch-elhdad' || q.branch_id === 'branch-1'
  );

  const handleCallNext = async (entry: QueueEntry) => {
    const targetBookingId = entry.booking_id || entry.id;
    const booking = bookings.find(
      (b) =>
        b.id === targetBookingId ||
        b.id === entry.id ||
        (entry.customer_name && b.customer_name === entry.customer_name)
    );

    const bookingIdToUse = booking?.id || targetBookingId;

    // 1. Remove from queue list immediately so it can NEVER be called or assigned again
    useSalonStore.setState((state) => ({
      queue: state.queue.filter((q) => q.id !== entry.id && q.booking_id !== bookingIdToUse),
    }));

    // 2. Play audio chime locally
    playCallChime();

    // 3. Find ONLY the chair belonging to the assigned barber (if specified)
    const matchingChair = chairs.find(
      (c) =>
        (c.branch_id === branchId || !branchId) &&
        booking?.barber_id &&
        c.barber_id === booking.barber_id &&
        c.status !== 'in_service'
    ) || chairs.find(
      (c) => (c.branch_id === branchId || !branchId) && c.status === 'available'
    ) || chairs[0];

    if (matchingChair) {
      updateChair(matchingChair.id, {
        status: 'in_service',
        current_booking_id: bookingIdToUse,
      });
    }

    // 4. Transition booking status in store & MySQL
    transitionBookingStatus(bookingIdToUse, 'in_service', 'تم استدعاء العميل وبدء الحلاقة على الكرسي');

    // 5. Send API PATCH status to trigger WhatsApp instant notification & WebSocket broadcast
    try {
      await fetch(`/api/bookings/${encodeURIComponent(bookingIdToUse)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_service',
          chair_id: matchingChair?.id,
          note: 'تم استدعاء العميل وتسكينه على الكرسي',
        }),
      });
    } catch (err) {
      console.warn('API call notice:', err);
    }

    const barberDisplay = entry.barber_name || (booking as any)?.barber_name || 'الكابتن المخصص';
    toast.success(`تم استدعاء ${entry.customer_name} وتسكينه على كرسي كابتن ${barberDisplay} ✂️👑`);
  };

  return (
    <div className="clinic-card p-4 sm:p-6 space-y-4 shadow-clinic-2 bg-white/90">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-forest text-paper flex items-center justify-center shadow-clinic-1 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-ink text-sm">قائمة الانتظار الحية (Live Queue)</h3>
            <p className="text-[11px] text-ink-mute">العملاء المنتظرين في الاستقبال</p>
          </div>
        </div>
        <span className="text-xs font-bold text-forest bg-forest/10 border border-forest/20 px-2.5 py-1 rounded-full font-mono">
          {branchQueue.length} عملاء
        </span>
      </div>

      {branchQueue.length > 0 ? (
        <div className="space-y-2.5">
          {branchQueue.map((entry) => (
            <div
              key={entry.id}
              className="bg-paper-warm/80 p-3 sm:p-3.5 rounded-2xl border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-clinic-1"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-forest text-paper font-mono font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                  #{entry.position}
                </div>
                <div>
                  <h4 className="font-serif font-bold text-ink text-sm">{entry.customer_name}</h4>
                  <p className="text-ink-mute text-[11px]">
                    {entry.service_name} • كابتن <strong className="text-forest">{entry.barber_name}</strong>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                <span className="flex items-center gap-1 text-ink-mute text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-forest" />
                  <span>متبقي ~{entry.estimated_wait_minutes} دقيقة</span>
                </span>

                <button
                  onClick={() => handleCallNext(entry)}
                  className="px-3.5 py-1.5 rounded-full bg-forest text-paper font-bold flex items-center gap-1 text-xs hover:bg-forest-soft transition-colors shadow-sm cursor-pointer active:scale-95"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>استدعاء للكرسي</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-10 text-center text-ink-mute text-xs space-y-1">
          <p className="font-bold text-ink font-serif">لا يوجد أي عملاء في قائمة الانتظار حالياً</p>
          <p>جميع الكراسي في وضع الاستعداد وجاهزة لاستقبال العملاء ✨</p>
        </div>
      )}
    </div>
  );
};
