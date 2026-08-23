import React from 'react';
import { Booking } from '../../types';
import { useSalonStore } from '../../lib/store';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { Printer, X, Scissors, QrCode, Sparkles } from 'lucide-react';

interface ThermalInvoiceProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ThermalInvoice: React.FC<ThermalInvoiceProps> = ({ booking, isOpen, onClose }) => {
  const { branches, barbers, services, settings } = useSalonStore();

  if (!isOpen || !booking) return null;

  const branch = branches.find((b) => b.id === booking.branch_id);
  const barber = barbers.find((b) => b.id === booking.barber_id);
  const service = services.find((s) => s.id === booking.service_id);

  const displayBarberName = barber?.full_name || (booking as any).barber_name || (booking as any).barberName || 'محمد الحداد';
  const displayServiceName = service?.name || (booking as any).service_name || (booking as any).serviceName || 'قص شعر كلاسيكي';
  const effectiveServicePrice = booking.total_at_booking || booking.service_price_at_booking || (booking as any).totalAmount || service?.price || 180;
  const additionalTotal = (booking.additional_service_ids || []).reduce((sum, addId) => {
    const s = services.find((srv) => srv.id === addId);
    return sum + (s?.price || 0);
  }, 0);
  const itemsTotal = (booking.items || []).reduce((sum, item) => sum + (item.price_at_booking * item.quantity), 0);
  const calculatedTotal = booking.total_at_booking || (effectiveServicePrice + additionalTotal + itemsTotal - (booking.discount_at_booking || 0));
  const depositPaid = booking.booking_fee_at_booking || 50;
  const remaining = Math.max(0, calculatedTotal - depositPaid);
  const salonTitle = settings?.salon_name || 'صالون TrimMind (الحداد VIP)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#121824] border border-[#233047] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-sm font-cairo">معاينة الفاتورة الحرارية (80mm POS)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The Printable Thermal Receipt Body */}
        <div
          id="thermal-receipt"
          className="bg-white text-neutral-900 font-mono p-5 rounded-xl shadow-inner max-w-xs mx-auto text-[12px] space-y-3 leading-tight border border-slate-300"
          dir="rtl"
        >
          {/* Header */}
          <div className="text-center space-y-1 border-b border-dashed border-neutral-400 pb-2">
            <h2 className="font-extrabold text-sm text-neutral-950 font-cairo">{salonTitle}</h2>
            <p className="text-[10px] text-neutral-600 font-sans">{branch?.name || 'الفرع الرئيسي'}</p>
            <p className="text-[10px] text-neutral-600 font-sans">{branch?.address || 'شارع جمال عبد الناصر'}</p>
            <p className="text-[10px] text-neutral-700">هاتف: {branch?.phone || '01005437633'}</p>
          </div>

          {/* Booking Info */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-neutral-400 pb-2">
            <div className="flex justify-between">
              <span>رقم الفاتورة:</span>
              <span className="font-bold">{booking.id}</span>
            </div>
            <div className="flex justify-between">
              <span>العميل:</span>
              <span className="font-bold">{booking.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span>الحلاق المختص:</span>
              <span>{displayBarberName}</span>
            </div>
            <div className="flex justify-between">
              <span>التاريخ:</span>
              <span>{formatDateTime(booking.starts_at)}</span>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-neutral-400 pb-2">
            <div className="flex justify-between font-bold pb-0.5">
              <span>البيان / الخدمة</span>
              <span>السعر</span>
            </div>
            <div className="flex justify-between">
              <span>{displayServiceName}</span>
              <span>{formatCurrency(effectiveServicePrice)}</span>
            </div>

            {/* Additional Services */}
            {booking.additional_service_ids?.map((addId) => {
              const addSrv = services.find((s) => s.id === addId);
              return (
                <div key={addId} className="flex justify-between text-neutral-700">
                  <span>+ {addSrv?.name}</span>
                  <span>{formatCurrency(addSrv?.price || 0)}</span>
                </div>
              );
            })}

            {/* Products & Cafe items */}
            {booking.items?.map((item) => (
              <div key={item.id} className="flex justify-between text-neutral-700">
                <span>
                  {item.name} x{item.quantity}
                </span>
                <span>{formatCurrency(item.price_at_booking * item.quantity)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1 text-[11px] font-bold">
            <div className="flex justify-between text-neutral-700">
              <span>الإجمالي:</span>
              <span>{formatCurrency(calculatedTotal)}</span>
            </div>
            {depositPaid > 0 && (
              <div className="flex justify-between text-emerald-800">
                <span>المدفوع (عربون/تحويل):</span>
                <span>- {formatCurrency(depositPaid)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-neutral-950 border-t border-neutral-900 pt-1 font-extrabold">
              <span>المتبقي للسداد:</span>
              <span>{formatCurrency(remaining)}</span>
            </div>
          </div>

          {/* Last Modified Note */}
          {booking.last_modified_by && (
            <div className="p-1.5 bg-neutral-100 rounded text-[9px] text-neutral-700 border border-neutral-300">
              <span className="font-bold">ملاحظة التعديل: </span>
              <span>{booking.last_modified_by.note || `بواسطة ${booking.last_modified_by.actor_name}`}</span>
            </div>
          )}

          {/* QR Code & Footer Note */}
          <div className="text-center pt-2 border-t border-dashed border-neutral-400 space-y-1">
            <div className="w-16 h-16 mx-auto bg-neutral-100 border border-neutral-300 rounded p-1 flex items-center justify-center">
              <QrCode className="w-full h-full text-neutral-800" />
            </div>
            <p className="text-[9px] text-neutral-500 font-sans">
              شكراً لاختياركم {salonTitle} • نسعد بخدمتكم
            </p>
          </div>
        </div>

        {/* Print Button */}
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الفاتورة الآن</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300 text-xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
