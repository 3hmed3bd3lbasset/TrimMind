import React, { useState, useEffect } from 'react';
import { Clock, Send, Users, CheckCircle2, Phone, Calendar, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface WaitlistManagerProps {
  branchId: string;
}

export const WaitlistManager: React.FC<WaitlistManagerProps> = ({ branchId }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');

  const loadWaitlist = async () => {
    setIsLoading(true);
    try {
      const res: any = await api.getBranchWaitlist(branchId || 'branch-elhdad', selectedDate || undefined);
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

  const waitingCount = entries.filter((e) => e.status === 'waiting').length;
  const offeredCount = entries.filter((e) => e.status === 'offered').length;
  const claimedCount = entries.filter((e) => e.status === 'claimed').length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl font-bold text-ink flex items-center gap-2">
            <Clock className="w-5 h-5 text-forest" />
            <span>إدارة قائمة الانتظار الذكية (Smart Waitlist)</span>
          </h3>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            تحويل العملاء الذين لم يجدوا شواغر إلى حجوزات مكتملة تلقائياً عند حدوث أي إلغاء
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-paper px-3 py-1.5 rounded-xl border border-border">
            <span className="text-xs font-bold text-ink-soft">فلترة التاريخ:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-mono font-bold text-forest focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={loadWaitlist}
            className="p-2 text-ink-soft hover:text-ink bg-paper rounded-xl border border-border transition-colors"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3.5">
        <div className="bg-surface p-4 rounded-2xl border border-border text-center space-y-1">
          <span className="text-xs text-ink-soft">في قائمة الانتظار</span>
          <p className="text-2xl font-serif font-bold text-amber-700 font-mono">{waitingCount}</p>
        </div>
        <div className="bg-surface p-4 rounded-2xl border border-border text-center space-y-1">
          <span className="text-xs text-ink-soft">عروض مرسلة وبانتظار التأكيد</span>
          <p className="text-2xl font-serif font-bold text-blue-700 font-mono">{offeredCount}</p>
        </div>
        <div className="bg-surface p-4 rounded-2xl border border-border text-center space-y-1">
          <span className="text-xs text-ink-soft">حجوزات تم تأكيدها بنجاح</span>
          <p className="text-2xl font-serif font-bold text-emerald-700 font-mono">{claimedCount}</p>
        </div>
      </div>

      {/* Entries List */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <Users className="w-4 h-4 text-forest" />
          <h4 className="font-bold text-ink text-sm">سجل المسجلين بقائمة الانتظار ({entries.length})</h4>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-xs text-ink-soft">جاري تحميل البيانات...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-ink-soft text-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600/60 mx-auto" />
            <p className="font-bold text-sm text-ink">لا توجد طلبات انتظار مسجلة حالياً</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {entries.map((entry) => (
              <div key={entry.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink text-sm">{entry.customer_name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      entry.status === 'waiting'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : entry.status === 'offered'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      {entry.status === 'waiting' ? 'في الانتظار' : entry.status === 'offered' ? 'تم إرسال العرض' : 'تم الحجز بنجاح ✓'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft font-mono">
                    <span>📞 {entry.customer_phone}</span>
                    <span>📅 التاريخ: {entry.preferred_date}</span>
                    <span>💈 الكابتن: {entry.barber_name}</span>
                    <span>⏳ الفترة: {entry.preferred_time_window}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${entry.customer_phone}`}
                    className="p-2 text-ink-soft hover:text-ink bg-paper rounded-lg border border-border transition-colors text-xs flex items-center gap-1"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>اتصال</span>
                  </a>

                  {entry.status === 'waiting' && (
                    <button
                      onClick={() => handlePromote(entry.id, entry.customer_name)}
                      className="px-3 py-1.5 bg-forest hover:bg-forest-light text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>إتاحة موعد الآن</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
