import React, { useState, useEffect } from 'react';
import { Clock, Send, Phone, User, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface WaitlistPanelProps {
  branchId: string;
}

export const WaitlistPanel: React.FC<WaitlistPanelProps> = ({ branchId }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const loadWaitlist = async () => {
    setIsLoading(true);
    try {
      const res: any = await api.getBranchWaitlist(branchId || 'branch-elhdad', selectedDate);
      if (res && res.data) {
        setEntries(res.data);
      }
    } catch (err: any) {
      console.warn('Waitlist load error:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWaitlist();
  }, [branchId, selectedDate]);

  const handlePromote = async (id: string, name: string) => {
    try {
      await api.promoteWaitlistEntry(id);
      toast.success(`تم إرسال رابط تأكيد الحجز للمستفيد ${name} عبر الواتساب!`);
      loadWaitlist();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'فشل إرسال العرض');
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-border p-4 sm:p-5 space-y-4" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-serif font-bold text-ink text-base">قائمة الانتظار الذكية (Smart Waitlist)</h4>
            <p className="text-xs text-ink-soft">العملاء الراغبون في موعد عند حدوث أي إلغاء أو توفر شاغر</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1.5 bg-paper border border-border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-forest"
          />
          <button
            onClick={loadWaitlist}
            className="px-3 py-1.5 bg-paper hover:bg-paper-warm border border-border rounded-lg text-xs font-bold text-ink transition-colors"
          >
            تحديث
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-xs text-ink-soft">جاري تحميل قائمة الانتظار...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 bg-paper/60 rounded-xl border border-dashed border-border space-y-1.5">
          <CheckCircle2 className="w-8 h-8 text-emerald-600/60 mx-auto" />
          <p className="text-sm font-bold text-ink">لا توجد طلبات انتظار معلقة لهذا التاريخ</p>
          <p className="text-xs text-ink-soft">كافة المواعيد مستقرة أو لا يوجد عملاء بانتظار شواغر</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {entries.map((entry) => (
            <div key={entry.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-sm flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-forest" />
                    {entry.customer_name}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                    entry.status === 'waiting'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : entry.status === 'offered'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    {entry.status === 'waiting' ? 'في الانتظار' : entry.status === 'offered' ? 'تم إرسال العرض' : 'تم الحجز'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft font-mono">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-ink-soft" />
                    {entry.customer_phone}
                  </span>
                  <span>💈 الكابتن: {entry.barber_name}</span>
                  <span>⏳ الفترة: {entry.preferred_time_window}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`tel:${entry.customer_phone}`}
                  className="p-2 text-ink-soft hover:text-ink bg-paper rounded-lg border border-border transition-colors"
                  title="اتصال هاتفياً"
                >
                  <Phone className="w-4 h-4" />
                </a>

                {entry.status === 'waiting' && (
                  <button
                    onClick={() => handlePromote(entry.id, entry.customer_name)}
                    className="px-3 py-1.5 bg-forest hover:bg-forest-light text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إتاحة موعد وإرسال رابط</span>
                  </button>
                )}

                {entry.status === 'offered' && (
                  <span className="text-xs text-blue-700 font-bold bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    بانتظار تأكيد العميل (مهلة 25 دقيقة)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
