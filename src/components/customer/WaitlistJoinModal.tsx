import React, { useState, useEffect } from 'react';
import { X, Clock, User, Phone, Calendar, CheckCircle2, Sparkles } from 'lucide-react';
import { useSalonStore } from '../../lib/store';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface WaitlistJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBarberId?: string;
  defaultDate?: string;
}

export const WaitlistJoinModal: React.FC<WaitlistJoinModalProps> = ({
  isOpen,
  onClose,
  defaultBarberId,
  defaultDate,
}) => {
  const { barbers, services, selectedBranchId } = useSalonStore();

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [preferredDate, setPreferredDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  const [preferredTimeWindow, setPreferredTimeWindow] = useState('مساءً (بعد العصر)');
  const [barberId, setBarberId] = useState(defaultBarberId || '');
  const [serviceId, setServiceId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('يرجى كتابة الاسم ورقم الهاتف للتواصل');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.joinWaitlist({
        branch_id: selectedBranchId || 'branch-elhdad',
        barber_id: barberId || null,
        service_id: serviceId || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        preferred_date: preferredDate,
        preferred_time_window: preferredTimeWindow,
        notes: notes.trim() || null,
      });

      setIsSuccess(true);
      toast.success('تم تسجيلك بنجاح في قائمة الانتظار الذكية!');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'تعذر الانضمام لقائمة الانتظار');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay font-sans text-ink"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-container bg-paper border border-border rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 text-ink-soft hover:text-ink bg-surface rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="font-serif text-2xl font-bold text-ink">تم تسجيلك في قائمة الانتظار! 💈✨</h3>
            <p className="text-ink-soft text-sm leading-relaxed max-w-sm mx-auto">
              بمجرد فتح أي موعد شاغر أو إلغاء حجز في هذا اليوم، سيصلك إشعار فوري ورابط حجز على الواتساب على رقمك ({customerPhone}) لتأكيد حجزك قبل الجميع.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2.5 bg-forest text-white rounded-xl font-bold hover:bg-forest-light transition-all shadow-md"
            >
              حسناً، فهمت
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-forest/10 text-forest flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-bold text-ink flex items-center gap-2">
                  <span>قائمة الانتظار الذكية</span>
                  <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 font-sans px-2 py-0.5 rounded-full font-bold">
                    أولوية الحجز
                  </span>
                </h3>
                <p className="text-xs text-ink-soft">المواعيد ممتلئة؟ انضم وسنبلغك فوراً عند توفر أي فرصة شاغرة</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-ink-soft mb-1">اسم العميل *</label>
                <div className="relative">
                  <User className="absolute right-3 top-3 w-4 h-4 text-ink-soft" />
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثال: أحمد عبدالباسط"
                    className="w-full pr-9 pl-3 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-soft mb-1">رقم الواتساب للتذكير *</label>
                <div className="relative">
                  <Phone className="absolute right-3 top-3 w-4 h-4 text-ink-soft" />
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full pr-9 pl-3 py-2.5 bg-surface border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-ink-soft mb-1">التاريخ المطلوب *</label>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-3 w-4 h-4 text-ink-soft" />
                    <input
                      type="date"
                      required
                      value={preferredDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setPreferredDate(e.target.value)}
                      className="w-full pr-9 pl-2 py-2.5 bg-surface border border-border rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-forest"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-soft mb-1">الفترة المفضلة</label>
                  <select
                    value={preferredTimeWindow}
                    onChange={(e) => setPreferredTimeWindow(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-forest"
                  >
                    <option value="صباحاً (11 ص - 3 م)">صباحاً (11 ص - 3 م)</option>
                    <option value="مساءً (بعد العصر)">مساءً (بعد العصر)</option>
                    <option value="ليلاً (8 م - 12 ص)">ليلاً (8 م - 12 ص)</option>
                    <option value="أي وقت متاح">أي وقت متاح</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-ink-soft mb-1">الكابتن المفضل</label>
                  <select
                    value={barberId}
                    onChange={(e) => setBarberId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-forest"
                  >
                    <option value="">أي كابتن متاح</option>
                    {barbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-soft mb-1">الخدمة المطلوبة</label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-forest"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.price} ج.م)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-forest text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-forest-light transition-all shadow-md disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isSubmitting ? 'جاري التسجيل...' : 'تأكيد الانضمام لقائمة الانتظار (مجاناً)'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
