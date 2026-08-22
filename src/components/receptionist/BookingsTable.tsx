import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Booking, BookingStatus } from '../../types';
import {
  BOOKING_STATUS_CONFIG,
  formatCurrency,
  formatDateTime,
  format12Hour,
} from '../../lib/utils';
import {
  Search,
  Receipt,
  UserCheck,
  Coffee,
  Printer,
  ChevronDown,
  Clock,
  Eye,
  CheckCircle,
  Edit2,
  Sparkles,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PaymentProofModal } from './PaymentProofModal';
import { AddOrderModal } from './AddOrderModal';
import { ThermalInvoice } from './ThermalInvoice';

interface BookingsTableProps {
  branchId: string;
}

export const BookingsTable: React.FC<BookingsTableProps> = ({ branchId }) => {
  const { bookings, barbers, services, products, currentUser, transitionBookingStatus, updateBookingDetails } =
    useSalonStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [selectedProofBooking, setSelectedProofBooking] = useState<Booking | null>(null);
  const [selectedOrderBooking, setSelectedOrderBooking] = useState<Booking | null>(null);
  const [selectedInvoiceBooking, setSelectedInvoiceBooking] = useState<Booking | null>(null);
  const [selectedEditBooking, setSelectedEditBooking] = useState<Booking | null>(null);

  // Edit form state
  const [editServiceId, setEditServiceId] = useState('');
  const [editAddServices, setEditAddServices] = useState<string[]>([]);
  const [editDiscount, setEditDiscount] = useState(0);
  const [editNote, setEditNote] = useState('');

  const branchBookings = bookings.filter(
    (b) =>
      !branchId ||
      b.branch_id === branchId ||
      b.branch_id === 'branch-elhdad' ||
      b.branch_id === 'branch-1' ||
      !b.branch_id
  );

  const filteredBookings = branchBookings.filter((b) => {
    const matchesStatus = filterStatus === 'all' || b.status === filterStatus;
    const matchesSearch =
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customer_phone.includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  const handleStatusChange = (bookingId: string, newStatus: BookingStatus) => {
    transitionBookingStatus(bookingId, newStatus, `تغيير الحالة يدوياً إلى ${newStatus}`);
    toast.success(`تم تحديث حالة الحجز إلى: ${BOOKING_STATUS_CONFIG[newStatus].label} ✅`);
  };

  const openEditModal = (b: Booking) => {
    setSelectedEditBooking(b);
    setEditServiceId(b.service_id);
    setEditAddServices(b.additional_service_ids || []);
    setEditDiscount(b.discount_at_booking || 0);
    setEditNote('');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEditBooking) return;

    updateBookingDetails(
      selectedEditBooking.id,
      {
        serviceId: editServiceId,
        additionalServiceIds: editAddServices,
        discount: editDiscount,
      },
      editNote || `تعديل الفاتورة بواسطة ${currentUser.full_name} (${currentUser.role === 'manager' ? 'المدير' : 'الاستقبال'})`
    );

    toast.success('تم تحديث الفاتورة والخدمات بنجاح! 🧾');
    setSelectedEditBooking(null);
  };

  return (
    <div className="space-y-4 font-sans text-ink">
      {/* Search and Filters Bar */}
      <div className="clinic-card p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-clinic-1 bg-white/90">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-ink-mute absolute right-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث برقم الحجز، اسم العميل، أو الهاتف..."
            className="w-full bg-paper-warm border border-border focus:border-forest rounded-full pr-10 pl-4 py-2 text-xs text-ink outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar pb-1 sm:pb-0 text-xs">
          <span className="text-ink-mute text-[11px] whitespace-nowrap">الحالة:</span>
          {['all', 'pending_review', 'confirmed', 'customer_arrived', 'in_service', 'completed'].map(
            (st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
                  filterStatus === st
                    ? 'bg-forest text-paper shadow-sm'
                    : 'bg-paper-warm text-ink-soft hover:bg-white'
                }`}
              >
                {st === 'all'
                  ? 'الكل'
                  : BOOKING_STATUS_CONFIG[st as BookingStatus]?.label || st}
              </button>
            )
          )}
        </div>
      </div>

      {/* 1. Mobile Bookings Cards (Zero Horizontal Scroll) */}
      <div className="space-y-3.5 md:hidden">
        {filteredBookings.map((b) => {
          const barber = barbers.find((bar) => bar.id === b.barber_id);
          const primarySrv = services.find((s) => s.id === b.service_id);
          const statusCfg = BOOKING_STATUS_CONFIG[b.status];

          return (
            <div
              key={b.id}
              className="clinic-card p-4 space-y-3 shadow-clinic-1 bg-white"
            >
              {/* Header: ID + Status */}
              <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-forest text-xs bg-forest/10 px-2.5 py-1 rounded-lg border border-forest/20">
                    {b.id}
                  </span>
                  <span className="text-[11px] text-ink-mute font-mono font-bold">
                    {format12Hour(b.starts_at)}
                  </span>
                </div>
                {b.status === 'pending_review' || b.payment_proof ? (
                  <button
                    onClick={() => setSelectedProofBooking(b)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 shadow-xs cursor-pointer"
                  >
                    <Eye className="w-3 h-3 text-amber-700" />
                    <span>عرض إثبات الدفع 🔍</span>
                  </button>
                ) : (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10.5px] font-bold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                    {statusCfg.label}
                  </span>
                )}
              </div>

              {/* Customer & Service Info */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-ink-mute block">العميل:</span>
                  <p className="font-serif font-bold text-ink text-sm">{b.customer_name}</p>
                  <p className="text-[11px] text-ink-mute font-mono">{b.customer_phone}</p>
                </div>
                <div>
                  <span className="text-[10px] text-ink-mute block">الكابتن:</span>
                  <p className="font-bold text-forest">{barber?.full_name || 'أي حلاق متاح'}</p>
                </div>
              </div>

              {/* Service & Total Box */}
              <div className="p-2.5 bg-paper-warm/80 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <p className="font-bold text-ink text-xs">{primarySrv?.name || 'خدمة محددة'}</p>
                  {b.additional_service_ids && b.additional_service_ids.length > 0 && (
                    <p className="text-[10px] text-forest font-semibold">
                      +{b.additional_service_ids.length} خدمات إضافية
                    </p>
                  )}
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-ink-mute block">الإجمالي:</span>
                  <p className="font-serif font-bold text-forest text-sm">{formatCurrency(b.total_at_booking)}</p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-border/70">
                {b.payment_proof ? (
                  <button
                    onClick={() => setSelectedProofBooking(b)}
                    className="inline-flex items-center gap-1 text-[11px] text-terra-deep hover:underline font-bold"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة الإيصال</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-ink-mute">دفع بالصالون</span>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(b)}
                    className="p-2 rounded-xl bg-paper-warm hover:bg-white text-forest border border-border shadow-xs"
                    title="تعديل الفاتورة"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSelectedOrderBooking(b)}
                    className="p-2 rounded-xl bg-paper-warm hover:bg-white text-ink border border-border shadow-xs"
                    title="إضافة مشروبات كافيه"
                  >
                    <Coffee className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSelectedInvoiceBooking(b)}
                    className="p-2 rounded-xl bg-paper-warm hover:bg-white text-forest border border-border shadow-xs"
                    title="طباعة الفاتورة"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Desktop Table Card (For Tablets & Laptops) */}
      <div className="hidden md:block clinic-card overflow-hidden shadow-clinic-2 bg-white/90">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-paper-warm/80 border-b border-border text-ink-soft font-serif">
              <tr>
                <th className="py-3.5 px-4 font-bold">رقم الحجز</th>
                <th className="py-3.5 px-4 font-bold">العميل</th>
                <th className="py-3.5 px-4 font-bold">الخدمة والمدة</th>
                <th className="py-3.5 px-4 font-bold">كابتن الحلاقة</th>
                <th className="py-3.5 px-4 font-bold">الموعد</th>
                <th className="py-3.5 px-4 font-bold">الحساب والإيصال</th>
                <th className="py-3.5 px-4 font-bold">الحالة</th>
                <th className="py-3.5 px-4 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {filteredBookings.map((b) => {
                const barber = barbers.find((bar) => bar.id === b.barber_id);
                const primarySrv = services.find((s) => s.id === b.service_id);
                const statusCfg = BOOKING_STATUS_CONFIG[b.status];

                return (
                  <tr key={b.id} className="hover:bg-paper-warm/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-forest">
                      {b.id}
                    </td>

                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-serif font-bold text-ink">{b.customer_name}</p>
                        <p className="text-[11px] text-ink-mute font-mono">{b.customer_phone}</p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-bold text-ink">{primarySrv?.name || 'خدمة محددة'}</p>
                        {b.additional_service_ids && b.additional_service_ids.length > 0 && (
                          <p className="text-[10px] text-forest font-semibold">
                            +{b.additional_service_ids.length} خدمات إضافية
                          </p>
                        )}
                        {b.last_modified_by && (
                          <span className="inline-block mt-0.5 text-[9.5px] bg-terra/15 text-terra-deep px-1.5 py-0.5 rounded border border-terra/30 font-medium">
                            تعديل: {b.last_modified_by.actor_name}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-ink-soft font-medium">
                      {barber?.full_name || 'أي حلاق متاح'}
                    </td>

                    <td className="py-3.5 px-4 text-ink-soft">
                      <p className="font-bold">{format12Hour(b.starts_at)}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-serif font-bold text-forest text-sm">{formatCurrency(b.total_at_booking)}</p>
                      {b.payment_proof && (
                        <button
                          onClick={() => setSelectedProofBooking(b)}
                          className="mt-1 inline-flex items-center gap-1 text-[10px] text-terra-deep hover:underline font-bold"
                        >
                          <Eye className="w-3 h-3" />
                          <span>معاينة الإيصال</span>
                        </button>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {b.status === 'pending_review' || b.payment_proof ? (
                        <button
                          onClick={() => setSelectedProofBooking(b)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 hover:border-amber-400 shadow-xs cursor-pointer transition-all"
                          title="عرض إيصال التحويل للاعتماد أو الرفض"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-700" />
                          <span>عرض إثبات الدفع 🔍</span>
                        </button>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                          {statusCfg.label}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(b)}
                          className="p-1.5 rounded-lg bg-paper-warm hover:bg-white text-forest border border-border"
                          title="تعديل الفاتورة والخدمات"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedOrderBooking(b)}
                          className="p-1.5 rounded-lg bg-paper-warm hover:bg-white text-ink border border-border"
                          title="إضافة مشروبات كافيه"
                        >
                          <Coffee className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSelectedInvoiceBooking(b)}
                          className="p-1.5 rounded-lg bg-paper-warm hover:bg-white text-forest border border-border"
                          title="طباعة الفاتورة الحرارية"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALS */}
      {selectedProofBooking && (
        <PaymentProofModal
          booking={selectedProofBooking}
          isOpen={!!selectedProofBooking}
          onClose={() => setSelectedProofBooking(null)}
        />
      )}

      {selectedOrderBooking && (
        <AddOrderModal
          booking={selectedOrderBooking}
          isOpen={!!selectedOrderBooking}
          onClose={() => setSelectedOrderBooking(null)}
        />
      )}

      {selectedInvoiceBooking && (
        <ThermalInvoice
          booking={selectedInvoiceBooking}
          isOpen={!!selectedInvoiceBooking}
          onClose={() => setSelectedInvoiceBooking(null)}
        />
      )}

      {/* EDIT MODAL */}
      {selectedEditBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm">
          <div className="clinic-card w-full max-w-lg p-6 shadow-clinic-3 space-y-4 text-xs bg-white">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif font-bold text-ink text-base">
                تعديل فاتورة الحجز ({selectedEditBooking.id})
              </h3>
              <button
                onClick={() => setSelectedEditBooking(null)}
                className="p-2 rounded-xl bg-paper-warm text-ink-mute hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-1">
                <label className="font-bold text-ink-soft">الخدمة الأساسية:</label>
                <select
                  value={editServiceId}
                  onChange={(e) => setEditServiceId(e.target.value)}
                  className="w-full bg-paper-warm border border-border rounded-xl p-2.5 text-ink outline-none focus:border-forest"
                >
                  {services.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} - ({formatCurrency(srv.price)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-bold text-ink-soft">خدمات إضافية:</label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                  {services
                    .filter((s) => s.id !== editServiceId)
                    .map((srv) => {
                      const isChecked = editAddServices.includes(srv.id);
                      return (
                        <label
                          key={srv.id}
                          className="bg-paper-warm p-2 rounded-xl border border-border flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditAddServices([...editAddServices, srv.id]);
                                } else {
                                  setEditAddServices(editAddServices.filter((id) => id !== srv.id));
                                }
                              }}
                              className="accent-forest"
                            />
                            <span className="text-[11px] font-medium">{srv.name}</span>
                          </div>
                          <span className="text-[10px] text-forest font-bold">{formatCurrency(srv.price)}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">مبلغ الخصم الاستثنائي (ج.م):</label>
                <input
                  type="number"
                  value={editDiscount}
                  onChange={(e) => setEditDiscount(Number(e.target.value))}
                  min={0}
                  className="w-full bg-paper-warm border border-border rounded-xl p-2.5 text-ink outline-none focus:border-forest"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">ملاحظة التعديل:</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="سبب التعديل أو الخصم..."
                  className="w-full bg-paper-warm border border-border rounded-xl p-2.5 text-ink outline-none focus:border-forest"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-clinic-primary flex-1 py-3 text-xs">
                  حفظ وتحديث الفاتورة فوراً
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEditBooking(null)}
                  className="btn-clinic-ghost text-xs px-5"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
