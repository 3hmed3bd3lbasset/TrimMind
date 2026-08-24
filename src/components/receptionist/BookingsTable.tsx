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
  Coffee,
  Printer,
  ChevronDown,
  Clock,
  Eye,
  CheckCircle,
  Edit2,
  Sparkles,
  X,
  MessageSquare,
  Bot,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PaymentProofModal } from './PaymentProofModal';
import { AddOrderModal } from './AddOrderModal';
import { ThermalInvoice } from './ThermalInvoice';
import { WhatsAppCustomPricingModal } from './WhatsAppCustomPricingModal';
import { api } from '../../lib/api';

interface BookingsTableProps {
  branchId: string;
}

export const BookingsTable: React.FC<BookingsTableProps> = ({ branchId }) => {
  const { bookings, barbers, services, products, currentUser, transitionBookingStatus, updateBookingDetails } =
    useSalonStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sourceTab, setSourceTab] = useState<'all' | 'whatsapp' | 'web'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [selectedProofBooking, setSelectedProofBooking] = useState<Booking | null>(null);
  const [selectedOrderBooking, setSelectedOrderBooking] = useState<Booking | null>(null);
  const [selectedInvoiceBooking, setSelectedInvoiceBooking] = useState<Booking | null>(null);
  const [selectedEditBooking, setSelectedEditBooking] = useState<Booking | null>(null);
  const [selectedCustomPricingBooking, setSelectedCustomPricingBooking] = useState<Booking | null>(null);

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

  const whatsappCount = branchBookings.filter((b) => b.source === 'whatsapp' || Boolean(b.ai_brief)).length;
  const webCount = branchBookings.filter((b) => b.source !== 'whatsapp' && !b.ai_brief).length;
  const handoffCount = branchBookings.filter((b) => Boolean(b.needs_human_attention)).length;

  const filteredBookings = branchBookings.filter((b) => {
    const isWhatsApp = b.source === 'whatsapp' || Boolean(b.ai_brief);
    const matchesSource =
      sourceTab === 'all' ||
      (sourceTab === 'whatsapp' && isWhatsApp) ||
      (sourceTab === 'web' && !isWhatsApp);
    const matchesStatus = filterStatus === 'all' || b.status === filterStatus;
    const matchesSearch =
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.customer_phone.includes(searchQuery);
    return matchesSource && matchesStatus && matchesSearch;
  });

  const handleStatusChange = (bookingId: string, newStatus: BookingStatus) => {
    transitionBookingStatus(bookingId, newStatus, `تغيير الحالة يدوياً إلى ${newStatus}`);
    toast.success(`تم تحديث حالة الحجز إلى: ${BOOKING_STATUS_CONFIG[newStatus].label} ✅`);
  };

  const handleToggleHandoff = async (phone: string, currentNeedsAttention: boolean) => {
    try {
      await api.toggleHumanHandoff(phone, !currentNeedsAttention);
      toast.success(!currentNeedsAttention ? 'تم تحويل المحادثة للتدخل البشري وإيقاف الـ AI 🛑' : 'تم استئناف الرد التلقائي للمساعد الذكي 🟢');
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ في تغيير الحالة');
    }
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
      {/* Top Source Tabs (WhatsApp Concierge vs Web Platform) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setSourceTab('all')}
          className={`p-3.5 rounded-2xl border transition-all text-right flex items-center justify-between shadow-xs ${
            sourceTab === 'all'
              ? 'bg-forest text-white border-forest shadow-md'
              : 'bg-white/90 text-ink border-border hover:bg-paper-warm'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10">
              <Receipt className="w-4 h-4" />
            </span>
            <div>
              <p className="font-bold text-xs">كافة الحجوزات</p>
              <p className={`text-[10.5px] ${sourceTab === 'all' ? 'text-white/80' : 'text-ink-mute'}`}>
                إجمالي حجوزات الفرع
              </p>
            </div>
          </div>
          <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-full ${
            sourceTab === 'all' ? 'bg-white/20 text-white' : 'bg-paper-warm text-ink'
          }`}>
            {branchBookings.length}
          </span>
        </button>

        <button
          onClick={() => setSourceTab('whatsapp')}
          className={`p-3.5 rounded-2xl border transition-all text-right flex items-center justify-between shadow-xs ${
            sourceTab === 'whatsapp'
              ? 'bg-emerald-900 text-white border-emerald-500 shadow-md shadow-emerald-950/30'
              : 'bg-white/90 text-ink border-emerald-500/30 hover:bg-emerald-50/50'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className={`p-2 rounded-xl ${sourceTab === 'whatsapp' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-emerald-500/10 text-emerald-600'}`}>
              <MessageSquare className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-xs">حجوزات الواتساب الذكية 🟢</p>
                {handoffCount > 0 && (
                  <span className="animate-pulse px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                    {handoffCount} تدخل
                  </span>
                )}
              </div>
              <p className={`text-[10.5px] ${sourceTab === 'whatsapp' ? 'text-emerald-200' : 'text-emerald-700'}`}>
                تخصيص وتسعير مرن فوري
              </p>
            </div>
          </div>
          <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-full ${
            sourceTab === 'whatsapp' ? 'bg-emerald-500/30 text-white' : 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'
          }`}>
            {whatsappCount}
          </span>
        </button>

        <button
          onClick={() => setSourceTab('web')}
          className={`p-3.5 rounded-2xl border transition-all text-right flex items-center justify-between shadow-xs ${
            sourceTab === 'web'
              ? 'bg-blue-900 text-white border-blue-500 shadow-md'
              : 'bg-white/90 text-ink border-border hover:bg-paper-warm'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className={`p-2 rounded-xl ${sourceTab === 'web' ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500/10 text-blue-600'}`}>
              <Receipt className="w-4 h-4" />
            </span>
            <div>
              <p className="font-bold text-xs">حجوزات المنصة 🌐</p>
              <p className={`text-[10.5px] ${sourceTab === 'web' ? 'text-blue-200' : 'text-ink-mute'}`}>
                حجوزات الموقع الذاتية
              </p>
            </div>
          </div>
          <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-full ${
            sourceTab === 'web' ? 'bg-blue-500/30 text-white' : 'bg-paper-warm text-ink'
          }`}>
            {webCount}
          </span>
        </button>
      </div>

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
          const isWhatsApp = b.source === 'whatsapp' || Boolean(b.ai_brief);

          return (
            <div
              key={b.id}
              className={`clinic-card p-4 space-y-3 shadow-clinic-1 bg-white border ${
                isWhatsApp ? 'border-emerald-500/30' : 'border-border'
              }`}
            >
              {/* Header: ID + Source + Status */}
              <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-forest text-xs bg-forest/10 px-2.5 py-1 rounded-lg border border-forest/20">
                    {b.id}
                  </span>
                  {isWhatsApp ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <MessageSquare className="w-2.5 h-2.5" />
                      واتساب AI
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                      منصة
                    </span>
                  )}
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

              {/* Human Handoff Warning if active */}
              {b.needs_human_attention && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-rose-800 text-xs font-bold">
                    <ShieldAlert className="w-4 h-4 animate-bounce text-rose-600" />
                    <span>العميل طلب التحدث مع موظف بشري!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleHandoff(b.customer_phone, true)}
                    className="text-[10.5px] font-bold px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                  >
                    استئناف الـ AI 🟢
                  </button>
                </div>
              )}

              {/* Customer & Service Info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="min-w-0">
                  <span className="text-[10px] text-ink-mute block">العميل:</span>
                  <p className="font-serif font-bold text-ink text-sm truncate">{b.customer_name}</p>
                  <p className="text-[11px] text-ink-mute font-mono truncate">{b.customer_phone}</p>
                </div>
                <div className="min-w-0 text-left sm:text-right">
                  <span className="text-[10px] text-ink-mute block">الكابتن:</span>
                  <p className="font-bold text-forest truncate">{barber?.full_name || (b as any).barber_name || (b as any).barberName || 'محمد الحداد'}</p>
                  {b.confidence_score && (
                    <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
                      🎯 دقة الطلب: {b.confidence_score}%
                    </span>
                  )}
                </div>
              </div>

              {/* AI Brief Box for WhatsApp Bookings */}
              {b.ai_brief && (
                <div className="p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200/70 text-[11.5px] text-emerald-950">
                  <div className="font-bold text-emerald-800 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    ملخص الذكاء الاصطناعي:
                  </div>
                  <p className="whitespace-pre-line text-emerald-900 leading-relaxed font-sans">{b.ai_brief}</p>
                </div>
              )}

              {/* Service & Total Box */}
              <div className="p-2.5 bg-paper-warm/80 rounded-xl border border-border flex items-center justify-between">
                <div>
                  <p className="font-bold text-ink text-xs">{primarySrv?.name || (b as any).service_name || (b as any).serviceName || 'قص شعر كلاسيكي'}</p>
                  {b.custom_line_items && b.custom_line_items.length > 0 ? (
                    <p className="text-[10px] text-forest font-semibold">
                      {b.custom_line_items.length} بنود مخصصة بالفاتورة
                    </p>
                  ) : b.additional_service_ids && b.additional_service_ids.length > 0 ? (
                    <p className="text-[10px] text-forest font-semibold">
                      +{b.additional_service_ids.length} خدمات إضافية
                    </p>
                  ) : null}
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-ink-mute block">الإجمالي:</span>
                  <p className="font-serif font-bold text-forest text-sm">{formatCurrency(b.total_at_booking || (b as any).totalAmount || primarySrv?.price || 180)}</p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-border/70 gap-2">
                {isWhatsApp ? (
                  <button
                    onClick={() => setSelectedCustomPricingBooking(b)}
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>تسعير واعتماد 🛠️</span>
                  </button>
                ) : (
                  <span className="text-[11px] text-ink-mute">حجز منصة</span>
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
                <th className="py-3.5 px-4 font-bold">رقم الحجز والمصدر</th>
                <th className="py-3.5 px-4 font-bold">العميل</th>
                <th className="py-3.5 px-4 font-bold">الخدمة والملخص الذكي</th>
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
                const isWhatsApp = b.source === 'whatsapp' || Boolean(b.ai_brief);

                return (
                  <tr key={b.id} className="hover:bg-paper-warm/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <span className="font-mono font-bold text-forest block">
                          {b.id}
                        </span>
                        {isWhatsApp ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <MessageSquare className="w-2.5 h-2.5" />
                            واتساب AI
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                            منصة 🌐
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-serif font-bold text-ink">{b.customer_name}</p>
                          {b.needs_human_attention && (
                            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-ping" title="طلب تدخل بشري" />
                          )}
                        </div>
                        <p className="text-[11px] text-ink-mute font-mono">{b.customer_phone}</p>
                        {b.needs_human_attention && (
                          <button
                            onClick={() => handleToggleHandoff(b.customer_phone, true)}
                            className="mt-1 text-[9.5px] text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded font-bold transition-colors"
                          >
                            تدخل بشري نشط 🛑 (استئناف AI)
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div>
                        <p className="font-bold text-ink">{primarySrv?.name || (b as any).service_name || (b as any).serviceName || 'قص شعر كلاسيكي'}</p>
                        {b.ai_brief ? (
                          <p className="text-[10.5px] text-emerald-800 bg-emerald-50/80 p-1.5 rounded-lg border border-emerald-200/60 mt-1 line-clamp-2" title={b.ai_brief}>
                            💡 {b.ai_brief}
                          </p>
                        ) : b.additional_service_ids && b.additional_service_ids.length > 0 ? (
                          <p className="text-[10px] text-forest font-semibold">
                            +{b.additional_service_ids.length} خدمات إضافية
                          </p>
                        ) : null}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-ink-soft font-medium">
                      {barber?.full_name || (b as any).barber_name || (b as any).barberName || 'محمد الحداد'}
                      {b.confidence_score && (
                        <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
                          🎯 {b.confidence_score}% دقة
                        </span>
                      )}
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
                        {isWhatsApp && (
                          <button
                            onClick={() => setSelectedCustomPricingBooking(b)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1 transition-all"
                            title="تسعير واعتماد حجز الواتساب وإرسال الفاتورة"
                          >
                            <Sparkles className="w-3 h-3 text-amber-300" />
                            <span>تسعير 🛠️</span>
                          </button>
                        )}
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

      {/* WHATSAPP DYNAMIC PRICING MODAL */}
      {selectedCustomPricingBooking && (
        <WhatsAppCustomPricingModal
          booking={selectedCustomPricingBooking}
          services={services}
          barbers={barbers}
          onClose={() => setSelectedCustomPricingBooking(null)}
          onSuccess={(updated) => {
            if (updated) {
              updateBookingDetails(updated.id, {
                serviceId: updated.service_id,
                additionalServiceIds: updated.additional_service_ids,
                discount: updated.discount_at_booking,
              }, 'تم التسعير والاعتماد المخصص لحجز الواتساب');
            }
          }}
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
