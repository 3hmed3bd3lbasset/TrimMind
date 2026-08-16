import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Chair } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { UserPlus, X, Scissors, Armchair, Phone, CheckCircle2 } from 'lucide-react';
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
  const { services, barbers, chairs, addWalkInBooking } = useSalonStore();

  const branchBarbers = barbers.filter((b) => b.is_active && (b.branch_id === branchId || !b.branch_id));
  const branchChairs = chairs.filter((c) => c.is_active && c.branch_id === branchId);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('01');
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [barberId, setBarberId] = useState(branchBarbers[0]?.id || '');
  const [chairId, setChairId] = useState(preSelectedChair?.id || branchChairs[0]?.id || '');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }

    const booking = addWalkInBooking({
      customerName,
      customerPhone,
      branchId,
      barberId,
      chairId,
      serviceId,
      notes,
    });

    toast.success(`تم تسجيل العميل ${customerName} بنجاح برقم حجز ${booking.id} ✂️`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#121824] border border-[#233047] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">تسجيل عميل صالون مباشر (Walk-in)</h3>
              <p className="text-[11px] text-slate-400">تسكين فوري بدون حجز مسبق على الكراسي المتاحة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">اسم العميل:</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="مثال: يوسف ماهر"
                className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">رقم الهاتف:</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="010XXXXXXXX"
                className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-medium">الخدمة المطلوبة:</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white outline-none"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatCurrency(s.price)} - {s.duration_minutes} دقيقة)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">الحلاق المختص:</label>
              <select
                value={barberId}
                onChange={(e) => setBarberId(e.target.value)}
                className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white outline-none"
              >
                {branchBarbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">الكرسي:</label>
              <select
                value={chairId}
                onChange={(e) => setChairId(e.target.value)}
                className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white outline-none"
              >
                {branchChairs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status === 'available' ? 'متاح' : c.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-medium">ملاحظات إضافية:</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="قصة سريعة / مستعجل..."
              className="w-full bg-[#0D121C] border border-[#2A374F] rounded-xl p-2.5 text-white outline-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>بدء الخدمة والتسكين على الكرسي</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-xs"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
