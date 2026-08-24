import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Chair } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { UserPlus, X, Scissors, Armchair, Phone, CheckCircle2, Sparkles, Check, DollarSign } from 'lucide-react';
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

  // Custom Service & Price state
  const [isCustomService, setIsCustomService] = useState(false);
  const [customServiceName, setCustomServiceName] = useState('');
  const [customPrice, setCustomPrice] = useState<number | ''>('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }

    if (isCustomService) {
      if (!customServiceName.trim()) {
        toast.error('يرجى كتابة الخدمة وطلبات العميل');
        return;
      }
      if (!customPrice || Number(customPrice) <= 0) {
        toast.error('يرجى تحديد السعر المطلوب للخدمة المخصصة');
        return;
      }
    }

    const booking = addWalkInBooking({
      customerName,
      customerPhone,
      branchId,
      barberId,
      chairId,
      serviceId: isCustomService ? 'srv-custom' : serviceId,
      serviceName: isCustomService ? customServiceName.trim() : undefined,
      customPrice: isCustomService ? Number(customPrice) : undefined,
      notes,
    });

    const displayPrice = isCustomService ? Number(customPrice) : (services.find((s) => s.id === serviceId)?.price || 180);
    toast.success(`تم تسجيل العميل ${customerName} بنجاح (${formatCurrency(displayPrice)}) وتسكينه على الكرسي ✂️`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" dir="rtl">
      <div className="bg-[#121824] border border-[#233047] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base font-serif">تسجيل عميل صالون مباشر (Walk-in)</h3>
              <p className="text-[11px] text-slate-400">تسكين فوري بدون حجز مسبق على الكراسي المتاحة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Customer Name & Phone */}
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

          {/* Service Selection with "مخصص" Option */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-medium">الخدمة المطلوبة:</label>
              <button
                type="button"
                onClick={() => setIsCustomService(!isCustomService)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  isCustomService
                    ? 'bg-amber-400 text-neutral-950 border-amber-300 shadow-sm'
                    : 'bg-[#182234] text-slate-300 hover:text-white border-slate-700'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                    isCustomService ? 'border-neutral-950 bg-neutral-950 text-amber-400' : 'border-slate-500 bg-slate-800'
                  }`}
                >
                  {isCustomService && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span>مخصص (تحديد يدوي)</span>
              </button>
            </div>

            {/* If Not Custom: Show Standard Dropdown */}
            {!isCustomService ? (
              <select
                value={serviceId}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomService(true);
                  } else {
                    setServiceId(e.target.value);
                  }
                }}
                className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white outline-none cursor-pointer"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatCurrency(s.price)} - {s.duration_minutes} دقيقة)
                  </option>
                ))}
                <option value="custom">✨ مخصص - كتابة طلب وسعر محدد يدوي...</option>
              </select>
            ) : (
              /* If Custom: Show 2 Inputs for Custom Name & Price */
              <div className="p-3 bg-[#182336] rounded-2xl border border-amber-400/40 space-y-3 animate-in fade-in-50 duration-200">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تخصيص الخدمة وحساب الإيراد:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Custom Service Description (Takes 2 Cols) */}
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-slate-300 text-[11px] font-medium block">
                      الخدمة / طلبات العميل:
                    </label>
                    <input
                      type="text"
                      required={isCustomService}
                      value={customServiceName}
                      onChange={(e) => setCustomServiceName(e.target.value)}
                      placeholder="مثال: قص وتدريج + سنفرة وبخار بشرة"
                      className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-amber-400 rounded-xl p-2.5 text-white outline-none text-xs placeholder:text-slate-500"
                    />
                  </div>

                  {/* Custom Price (Takes 1 Col) */}
                  <div className="space-y-1">
                    <label className="text-slate-300 text-[11px] font-medium block">
                      السعر الإجمالي (ج.م):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required={isCustomService}
                        min="1"
                        step="5"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="350"
                        className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-amber-400 rounded-xl p-2.5 pl-8 text-amber-300 font-mono font-bold outline-none text-xs"
                      />
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">
                        ج.م
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Barber & Chair Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">الحلاق المختص:</label>
              <select
                value={barberId}
                onChange={(e) => setBarberId(e.target.value)}
                className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white outline-none cursor-pointer"
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
                className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-sky-400 rounded-xl p-2.5 text-white outline-none cursor-pointer"
              >
                {branchChairs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status === 'available' ? 'متاح' : c.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
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

          {/* Submit / Cancel Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer active:scale-98 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>بدء الخدمة والتسكين على الكرسي</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
