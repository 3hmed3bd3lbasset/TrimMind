import React, { useState, useEffect } from 'react';
import { Booking, Service } from '../../types';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { formatCurrency } from '../../lib/utils';
import { api } from '../../lib/api';
import {
  X,
  Sparkles,
  Plus,
  Trash2,
  User,
  Scissors,
  CheckCircle2,
  ZoomIn,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface WhatsAppCustomPricingModalProps {
  booking: Booking;
  services: Service[];
  barbers: Array<{ id: string; name?: string; full_name?: string }>;
  onClose: () => void;
  onSuccess: (updatedBooking: any) => void;
}

export const WhatsAppCustomPricingModal: React.FC<WhatsAppCustomPricingModalProps> = ({
  booking,
  services,
  barbers,
  onClose,
  onSuccess,
}) => {
  useBodyScrollLock(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [selectedBarberId, setSelectedBarberId] = useState(booking.barber_id || '');
  const [selectedBarberName, setSelectedBarberName] = useState(booking.barber_name || 'محمد الحداد');
  const [customServiceName, setCustomServiceName] = useState(
    booking.service_name || (booking as any).serviceName || 'باقة مخصصة VIP'
  );

  // Extract raw receipt image if present
  const rawProof = booking.payment_proof || (booking as any).paymentProof;
  let proofObj: any = null;
  try {
    proofObj = typeof rawProof === 'string' ? JSON.parse(rawProof) : rawProof;
  } catch {
    proofObj = rawProof;
  }
  const receiptImg =
    proofObj?.image_path ||
    proofObj?.image_url ||
    proofObj?.imageUrl ||
    proofObj?.url ||
    (typeof rawProof === 'string' && rawProof.startsWith('data:') ? rawProof : null);

  // Line items state
  const initialItems =
    booking.custom_line_items && booking.custom_line_items.length > 0
      ? booking.custom_line_items
      : [
          {
            name: booking.service_name || (booking as any).serviceName || 'قص شعر كلاسيكي وتظبيط لحية',
            price: Number(booking.total_at_booking || 200),
          },
        ];
  const [items, setItems] = useState<Array<{ name: string; price: number }>>(initialItems);
  const [discount, setDiscount] = useState<number>(booking.discount_at_booking || 0);
  const [deposit, setDeposit] = useState<number>(
    booking.booking_fee_at_booking || proofObj?.transferred_amount || (booking.booking_type === 'vip' ? 100 : 50)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick add item state
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<string>('');

  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  const remaining = Math.max(0, total - (Number(deposit) || 0));

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemName.trim() || !newItemPrice || Number(newItemPrice) <= 0) {
      toast.error('يرجى كتابة اسم البند وتحديد سعره');
      return;
    }

    setItems([...items, { name: newItemName.trim(), price: Number(newItemPrice) }]);
    setNewItemName('');
    setNewItemPrice('');
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('يجب أن تحتوي الفاتورة على بند خدمة واحد على الأقل');
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItemPrice = (index: number, newPrice: number) => {
    const updated = [...items];
    updated[index].price = Math.max(0, newPrice);
    setItems(updated);
  };

  const handleSelectServicePreset = (service: Service) => {
    setItems([...items, { name: service.name, price: service.price }]);
    toast.success(`تمت إضافة ${service.name} للفاتورة`);
  };

  const handleSelectBarber = (barberId: string) => {
    setSelectedBarberId(barberId);
    const b = barbers.find((item) => item.id === barberId);
    if (b) {
      setSelectedBarberName(b.full_name || b.name || 'كابتن الصالون');
    }
  };

  const handleDispatch = async () => {
    if (items.length === 0) {
      toast.error('يجب إضافة بنود للفاتورة أولاً');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        barberId: selectedBarberId,
        barberName: selectedBarberName,
        serviceName: customServiceName,
        items,
        subtotal,
        discount,
        totalPrice: total,
        depositRequired: deposit,
        remainingBalance: remaining,
      };

      const res: any = await api.customizeAndDispatchBooking(booking.id, payload);
      toast.success('تم تسعير واعتماد الحجز والفاتورة بنجاح! 🚀');
      if (onSuccess) {
        onSuccess(res?.data || { ...booking, ...payload, status: 'confirmed' });
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء اعتماد الفاتورة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-container max-w-2xl bg-[#faf7f0] border-2 border-forest/20 text-ink shadow-2xl p-0 overflow-hidden rounded-3xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-border flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-800 border border-amber-500/30 flex items-center justify-center shadow-xs">
              <Sparkles className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <h2 className="font-serif text-lg sm:text-xl font-bold text-ink flex items-center gap-2">
                <span>تسعير واعتماد الحجز والفاتورة</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-forest/10 border border-forest/20 text-forest font-mono">
                  #{booking.id}
                </span>
              </h2>
              <p className="text-xs text-ink-mute">
                مراجعة واعتماد بنود الفاتورة وتثبيت الموعد المعتمد للعميل
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-mute hover:text-ink hover:bg-paper-warm transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Customer Info Card & Custom Request Details */}
          <div className="bg-white border border-border rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-forest/10 text-forest flex items-center justify-center font-bold">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-ink text-sm block">{booking.customer_name}</span>
                  <span className="text-xs text-ink-mute font-mono">{booking.customer_phone}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-xl font-bold border ${
                  booking.booking_type === 'vip'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-forest/10 text-forest border-forest/20'
                }`}>
                  {booking.booking_type === 'vip' ? '👑 تجربة VIP الملكية' : '✂️ تجربة عادية'}
                </span>
              </div>
            </div>

            {/* Custom Request Text (What the customer wrote) */}
            <div className="bg-amber-50/80 border border-amber-300 rounded-xl p-3.5 space-y-1">
              <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>طلب وتفاصيل باقة العميل المخصصة:</span>
              </div>
              <p className="text-xs text-ink font-medium leading-relaxed">
                {booking.service_name || (booking as any).serviceName || (booking.notes && booking.notes.replace('[طلب تخصيص خدمة]:', '')) || 'باقة الصالون المخصصة'}
              </p>
            </div>

            {/* Receipt Preview Thumbnail if uploaded */}
            {receiptImg && (
              <div className="pt-1 flex items-center justify-between bg-paper-warm/80 p-2.5 rounded-xl border border-border">
                <div className="flex items-center gap-2.5">
                  <img
                    src={receiptImg}
                    alt="Receipt preview"
                    className="w-12 h-12 rounded-lg object-cover border border-border shadow-xs"
                  />
                  <div>
                    <span className="text-xs font-bold text-ink block">صورة إيصال التحويل مرفوعة</span>
                    <span className="text-[10px] text-ink-mute font-mono">
                      المبلغ المحول: {formatCurrency(deposit)}
                    </span>
                  </div>
                </div>
                <a
                  href={receiptImg}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-forest hover:text-white text-forest border border-forest/20 text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>معاينة الإيصال</span>
                </a>
              </div>
            )}
          </div>

          {/* Barber Selection & Custom Title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-ink-soft flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-forest" />
                <span>الكابتن المسؤول:</span>
              </label>
              <select
                value={selectedBarberId}
                onChange={(e) => {
                  const bId = e.target.value;
                  setSelectedBarberId(bId);
                  const found = barbers.find((b) => b.id === bId);
                  if (found) setSelectedBarberName(found.full_name || found.name || 'كابتن الصالون');
                }}
                className="w-full bg-white border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none shadow-xs font-bold"
              >
                <option value="">-- اختر كابتن الصالون --</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name || b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-ink-soft">
                عنوان الباقة المعتمد في الفاتورة:
              </label>
              <input
                type="text"
                value={customServiceName}
                onChange={(e) => setCustomServiceName(e.target.value)}
                placeholder="مثال: باقة العريس VIP / تنظيف بشرة مع حلاقة"
                className="w-full bg-white border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none shadow-xs font-bold"
              />
            </div>
          </div>

          {/* Quick Add Preset Services */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-ink-soft">
              ⚡ إضافة سريعة من قائمة خدمات وباقات الصالون:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {services.slice(0, 8).map((srv) => (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => handleSelectServicePreset(srv)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-white hover:bg-forest hover:text-white border border-border text-ink transition-all flex items-center gap-1 shadow-2xs font-medium cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>{srv.name} ({srv.price} ج)</span>
                </button>
              ))}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-ink uppercase tracking-wider">
              بنود وتفاصيل الفاتورة:
            </label>

            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 bg-white border border-border rounded-xl p-3 shadow-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-ink block truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => handleUpdateItemPrice(index, Number(e.target.value))}
                      className="w-24 bg-paper-warm border border-border focus:border-forest rounded-lg px-2.5 py-1.5 text-xs text-ink font-mono font-bold text-center outline-none"
                    />
                    <span className="text-xs text-ink-mute">ج.م</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                      title="حذف البند"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Line Item Form */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="إضافة خدمة مخصصة (مثال: صبغة شعر إيطالي)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="flex-1 bg-white border border-border focus:border-forest rounded-xl p-2.5 text-xs text-ink outline-none shadow-xs"
              />
              <input
                type="number"
                placeholder="السعر ج.م"
                value={newItemPrice}
                onChange={(e) => setNewItemPrice(e.target.value)}
                className="w-28 bg-white border border-border focus:border-forest rounded-xl p-2.5 text-xs text-ink font-mono font-bold text-center outline-none shadow-xs"
              />
              <button
                type="button"
                onClick={handleAddItem}
                className="px-4 py-2 bg-forest/10 hover:bg-forest hover:text-white border border-forest/20 text-forest rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة</span>
              </button>
            </div>
          </div>

          {/* Financial Calculation Box */}
          <div className="bg-paper-warm p-5 rounded-2xl border-2 border-forest/20 space-y-3 shadow-clinic-1">
            <div className="flex justify-between items-center text-xs text-ink-soft">
              <span>إجمالي بنود الخدمات:</span>
              <span className="font-mono text-sm font-bold text-ink">{formatCurrency(subtotal)}</span>
            </div>

            <div className="flex justify-between items-center text-xs text-ink-soft">
              <span>خصم إضافي خاص (ج.م):</span>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                className="w-24 bg-white border border-border focus:border-forest rounded-lg px-2.5 py-1 text-xs text-forest font-mono font-bold text-center outline-none"
              />
            </div>

            <div className="flex justify-between items-center text-xs text-emerald-700 font-bold border-t border-border pt-2">
              <span>العربون المسدد بالإيصال (خصم فوري):</span>
              <span className="font-mono">-{formatCurrency(deposit)} ✓</span>
            </div>

            <div className="flex justify-between items-center text-sm font-bold text-ink border-t border-border pt-2">
              <span className="text-forest font-serif">المتبقي المطلوب دفعه بالصالون:</span>
              <span className="text-lg font-serif font-bold text-forest">{formatCurrency(remaining)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-border flex items-center justify-between gap-4 shadow-xs">
          <button
            type="button"
            onClick={onClose}
            className="btn-clinic-ghost py-3.5 px-6 font-bold text-xs"
          >
            إلغاء
          </button>

          <button
            type="button"
            disabled={isSubmitting || items.length === 0}
            onClick={handleDispatch}
            className="btn-clinic-primary flex-1 max-w-sm py-3.5 px-6 font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>جاري اعتماد الفاتورة...</span>
            ) : (
              <>
                <span>اعتماد الفاتورة والحجز</span>
                <CheckCircle2 className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
