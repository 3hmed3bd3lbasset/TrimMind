import React, { useState } from 'react';
import { Booking, Service } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { api } from '../../lib/api';
import {
  X,
  Sparkles,
  Send,
  Plus,
  Trash2,
  User,
  Scissors,
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
  const [selectedBarberId, setSelectedBarberId] = useState(booking.barber_id || '');
  const [selectedBarberName, setSelectedBarberName] = useState(booking.barber_name || 'محمد الحداد');
  const [customServiceName, setCustomServiceName] = useState(booking.service_name || 'باقة مخصصة VIP');
  
  // Line items state
  const initialItems = booking.custom_line_items && booking.custom_line_items.length > 0
    ? booking.custom_line_items
    : [
        { name: booking.service_name || 'قص شعر كلاسيكي وتظبيط لحية', price: booking.total_at_booking || 220 }
      ];

  const [lineItems, setLineItems] = useState<Array<{ name: string; price: number }>>(initialItems);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState<number | ''>('');
  const [discount, setDiscount] = useState<number>(booking.discount_at_booking || 0);
  const [notes] = useState(booking.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const depositPaid = booking.payment_proof?.transferred_amount || (booking.booking_type === 'vip' ? 100 : 50);
  const itemsSubtotal = lineItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const finalTotal = Math.max(0, itemsSubtotal - discount);
  const remainingToPay = Math.max(0, finalTotal - depositPaid);

  const handleAddLineItem = () => {
    if (!newItemName.trim() || newItemPrice === '' || Number(newItemPrice) <= 0) {
      toast.error('يرجى كتابة اسم الخدمة وسعرها بشكل صحيح');
      return;
    }
    setLineItems([...lineItems, { name: newItemName.trim(), price: Number(newItemPrice) }]);
    setNewItemName('');
    setNewItemPrice('');
  };

  const handleAddPresetService = (srv: Service) => {
    setLineItems([...lineItems, { name: srv.name, price: srv.price }]);
    toast.success(`تمت إضافة ${srv.name}`);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleUpdateItemPrice = (index: number, newPrice: number) => {
    const updated = [...lineItems];
    updated[index].price = Math.max(0, newPrice);
    setLineItems(updated);
  };

  const handleSubmit = async () => {
    if (lineItems.length === 0) {
      toast.error('يرجى إضافة خدمة واحدة على الأقل في الفاتورة');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        customLineItems: lineItems,
        totalAmount: finalTotal,
        discount: Number(discount) || 0,
        notes,
        barberId: selectedBarberId,
        barberName: selectedBarberName,
        serviceName: customServiceName || (lineItems.map(i => i.name).join(' + ')),
      };

      const res: any = await api.customizeAndDispatchBooking(booking.id, payload);
      toast.success('تم تسعير واعتماد الحجز وإرسال الفاتورة الرسمية للواتساب بنجاح! 📲✨');
      onSuccess(res.data || { ...booking, ...payload, status: 'confirmed' });
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء اعتماد الفاتورة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#121218] border border-amber-500/30 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-black border-b border-amber-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                تسعير واعتماد حجز الواتساب
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                  #{booking.id}
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                تخصيص بنود الفاتورة وإرسالها مباشرة لرقم العميل مع رابط التتبع
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Customer & AI Brief Card */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-white">{booking.customer_name}</span>
                <span className="text-xs text-gray-400 font-mono">({booking.customer_phone})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  {booking.booking_type === 'vip' ? '👑 جلسة VIP ملكية' : '💈 جلسة عادية'}
                </span>
                {booking.confidence_score && (
                  <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                    booking.confidence_score >= 85
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}>
                    🎯 دقة الفهم: {booking.confidence_score}%
                  </span>
                )}
              </div>
            </div>

            {booking.ai_brief ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                <div className="text-xs font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  ملخص رغبات العميل من محادثة الواتساب:
                </div>
                <p className="text-xs text-gray-300 whitespace-pre-line leading-relaxed font-sans">
                  {booking.ai_brief}
                </p>
              </div>
            ) : (
              <div className="text-xs text-gray-400">
                الخدمة المسجلة مبدئياً: <span className="text-white font-medium">{booking.service_name || 'باقة الصالون'}</span>
              </div>
            )}
          </div>

          {/* Barber Selection & Custom Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                الكابتن المسؤول:
              </label>
              <select
                value={selectedBarberId}
                onChange={(e) => {
                  const bId = e.target.value;
                  setSelectedBarberId(bId);
                  const found = barbers.find((b) => b.id === bId);
                  if (found) setSelectedBarberName(found.full_name || found.name || 'كابتن الصالون');
                }}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              >
                <option value="">-- اختر كابتن الصالون --</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.full_name || b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">
                عنوان الباقة في الفاتورة:
              </label>
              <input
                type="text"
                value={customServiceName}
                onChange={(e) => setCustomServiceName(e.target.value)}
                placeholder="مثال: باقة العريس VIP / تنظيف بشرة مع حلاقة"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Quick Add Preset Services */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              ⚡ إضافة سريعة من قائمة خدمات الصالون:
            </label>
            <div className="flex flex-wrap gap-2">
              {services.slice(0, 8).map((srv) => (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => handleAddPresetService(srv)}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/30 text-gray-300 hover:text-amber-300 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" />
                  {srv.name} ({srv.price} ج)
                </button>
              ))}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-white uppercase tracking-wider">
              بنود الفاتورة المعتمدة:
            </label>

            <div className="space-y-2">
              {lineItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-xl p-3"
                >
                  <div className="flex-1">
                    <span className="text-sm font-medium text-white">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={item.price}
                      onChange={(e) => handleUpdateItemPrice(index, Number(e.target.value))}
                      className="w-24 bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-sm text-white font-mono text-center focus:border-amber-500 focus:outline-none"
                    />
                    <span className="text-xs text-gray-400">ج.م</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLineItem(index)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Line Item Form */}
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                placeholder="إضافة خدمة مخصصة (مثال: صبغة شعر إيطالي)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
              <input
                type="number"
                placeholder="السعر ج.م"
                value={newItemPrice}
                onChange={(e) => setNewItemPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-28 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono text-center focus:border-amber-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddLineItem}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                إضافة
              </button>
            </div>
          </div>

          {/* Financial Calculation Box */}
          <div className="bg-gradient-to-br from-amber-950/30 to-black border border-amber-500/30 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>إجمالي بنود الخدمات:</span>
              <span className="font-mono text-sm text-white">{formatCurrency(itemsSubtotal)}</span>
            </div>

            <div className="flex justify-between items-center text-xs text-gray-300">
              <span className="flex items-center gap-1">
                خصم إضافي خاص (ج.م):
              </span>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                className="w-24 bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-mono text-center focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-between items-center text-xs text-emerald-400 border-t border-white/10 pt-2">
              <span>العربون المسدد بالإيصال (خصم فوري):</span>
              <span className="font-mono font-bold">-{formatCurrency(depositPaid)} ✓</span>
            </div>

            <div className="flex justify-between items-center text-sm font-bold text-white border-t border-amber-500/20 pt-2">
              <span className="text-amber-400">المتبقي المطلوب دفعه بالصالون:</span>
              <span className="text-lg font-mono text-amber-300">{formatCurrency(remainingToPay)}</span>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-black/60 border-t border-white/10 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors"
          >
            إلغاء
          </button>

          <button
            type="button"
            disabled={isSubmitting || lineItems.length === 0}
            onClick={handleSubmit}
            className="flex-1 max-w-sm px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">جارٍ الاعتماد والإرسال...</span>
            ) : (
              <>
                <Send className="w-4 h-4" />
                اعتماد وإرسال الفاتورة للواتساب 📲
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
