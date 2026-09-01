import React, { useState, useEffect, useMemo } from 'react';
import { useSalonStore } from '../../lib/store';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
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
  Calendar,
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
  const [filterSource, setFilterSource] = useState<'all' | 'whatsapp' | 'custom_pricing' | 'web'>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const weekDays = useMemo(() => {
    const days = [];
    const today = new Date();
    const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const arabicMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const dayName = i === 0 ? 'اليوم' : arabicDays[date.getDay()];
      const subLabel = `${arabicDays[date.getDay()]} ${date.getDate()} ${arabicMonths[date.getMonth()]}`;

      days.push({
        dateStr,
        dayName,
        subLabel,
        fullDayName: arabicDays[date.getDay()],
        dayNum: date.getDate(),
        isToday: i === 0,
      });
    }
    return days;
  }, []);

  // Modals state
  const [selectedProofBooking, setSelectedProofBooking] = useState<Booking | null>(null);
  const [selectedOrderBooking, setSelectedOrderBooking] = useState<Booking | null>(null);
  const [selectedInvoiceBooking, setSelectedInvoiceBooking] = useState<Booking | null>(null);
  const [selectedEditBooking, setSelectedEditBooking] = useState<Booking | null>(null);
  const [selectedCustomPricingBooking, setSelectedCustomPricingBooking] = useState<Booking | null>(null);

  useBodyScrollLock(
    !!selectedEditBooking ||
      !!selectedProofBooking ||
      !!selectedOrderBooking ||
      !!selectedInvoiceBooking ||
      !!selectedCustomPricingBooking
  );

  useEffect(() => {
    if (!selectedEditBooking) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEditBooking(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEditBooking]);

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

  const filteredBookings = branchBookings
    .filter((b) => {
      const matchesStatus =
        filterStatus === 'all'
          ? true
          : filterStatus === 'custom_pricing_requested'
          ? b.status === 'custom_pricing_requested'
          : b.status === filterStatus;

      const matchesSource =
        filterSource === 'all'
          ? true
          : filterSource === 'whatsapp'
          ? b.source === 'whatsapp' || Boolean(b.ai_brief)
          : filterSource === 'custom_pricing'
          ? b.status === 'custom_pricing_requested' || Boolean((b as any).custom_line_items?.length)
          : b.source !== 'whatsapp' && !b.ai_brief;

      const bookingDate = (b as any).booking_date || (b.starts_at ? b.starts_at.slice(0, 10) : '');
      const matchesDate =
        filterDate === 'all'
          ? true
          : (bookingDate === filterDate || (b.starts_at && b.starts_at.startsWith(filterDate)));

      const matchesSearch =
        b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.customer_phone || '').includes(searchQuery);

      return matchesStatus && matchesSource && matchesDate && matchesSearch;
    })
    .sort((a, b) => {
      const timeA = new Date(a.created_at || a.starts_at || 0).getTime();
      const timeB = new Date(b.created_at || b.starts_at || 0).getTime();
      return timeB - timeA;
    });

  const handleStatusChange = (bookingId: string, newStatus: BookingStatus) => {
    transitionBookingStatus(bookingId, newStatus, `تغيير الحالة يدوياً إلى ${newStatus}`);
    toast.success(`تم تحديث حالة الحجز إلى: ${BOOKING_STATUS_CONFIG[newStatus]?.label || newStatus} ✅`);
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

  const whatsappBookingsCount = branchBookings.filter((b) => b.source === 'whatsapp' || Boolean(b.ai_brief)).length;
  const customPricingCount = branchBookings.filter((b) => b.status === 'custom_pricing_requested').length;

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

      {/* Week Days Filter Bar */}
      <div className="clinic-card p-3 sm:p-4 bg-white/90 shadow-clinic-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink-soft flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-forest" />
            <span>عرض حجوزات الأيام:</span>
          </span>
          <button
            onClick={() => setFilterDate('all')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
              filterDate === 'all'
                ? 'bg-forest text-paper shadow-sm'
                : 'bg-paper-warm text-ink-soft hover:bg-white border border-border'
            }`}
          >
            جميع الحجوزات ({branchBookings.length})
          </button>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
          {weekDays.map((day: any) => {
            const isSelected = filterDate === day.dateStr;
            const count = branchBookings.filter(
              (b) => ((b as any).booking_date === day.dateStr || (b.starts_at && b.starts_at.startsWith(day.dateStr)))
            ).length;

            return (
              <button
                key={day.dateStr}
                onClick={() => setFilterDate(day.dateStr)}
                className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-forest text-paper shadow-clinic-1 scale-[1.02]'
                    : 'bg-paper-warm text-ink-soft hover:bg-white border border-border/80'
                }`}
              >
                <span>{day.dayName}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-forest/10 text-forest font-bold'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Mobile Bookings Cards (Zero Horizontal Scroll) */}
      <div className="space-y-3.5 md:hidden">
        {filteredBookings.map((b) => {
          const barber = barbers.find((bar) => bar.id === b.barber_id);
          const primarySrv = services.find((s) => s.id === b.service_id);
          const statusCfg = BOOKING_STATUS_CONFIG[b.status] || {
            label: b.status,
            bg: 'bg-paper-warm',
            text: 'text-ink',
            border: 'border-border',
          };
          const isConfirmed = b.status === 'confirmed' || b.status === 'completed';
          const isCustom = b.service_id === 'srv-custom' || (b.status as any) === 'custom_pricing_requested' || Boolean(b.notes && (b.notes.includes('[طلب تخصيص خدمة]') || b.notes.includes('طلب خدمة مخصصة')));
          const hasCustomLineItems = Array.isArray(b.custom_line_items) && b.custom_line_items.length > 0;
          const isPricedCustom = isCustom && (hasCustomLineItems || (b.status === 'confirmed' && Number(b.total_at_booking) > 0));

          return (
            <div
              key={b.id}
              className={`clinic-card p-4 space-y-3 shadow-clinic-1 relative overflow-hidden transition-all ${
                isConfirmed
                  ? 'bg-emerald-50/75 border-2 border-emerald-400 shadow-emerald-600/10'
                  : 'bg-white border border-border'
              }`}
            >
              {/* Prominent Faint Green Watermark for Confirmed Bookings */}
              {isConfirmed && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-0 select-none opacity-[0.08]">
                  <span className="text-5xl font-black text-emerald-900 rotate-[-15deg] font-serif tracking-widest whitespace-nowrap">
                    حجز مؤكد ✓
                  </span>
                </div>
              )}

              {/* Header: ID + Time + Status Badge */}
              <div className="flex items-center justify-between border-b border-border/70 pb-2.5 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-forest text-xs bg-forest/10 px-2.5 py-1 rounded-lg border border-forest/20">
                    {b.id}
                  </span>
                  <span className="text-[11px] text-ink-mute font-mono font-bold">
                    {format12Hour(b.starts_at)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {isPricedCustom && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      تم تسعير هذه الفاتورة ✓
                    </span>
                  )}
                  {isConfirmed ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>حجز مؤكد ✓</span>
                    </span>
                  ) : b.status === 'pending_review' || b.payment_proof ? (
                    <button
                      onClick={() => setSelectedProofBooking(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs cursor-pointer transition-all active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>عرض صورة الإيصال 🖼️</span>
                    </button>
                  ) : (
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10.5px] font-bold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                      {statusCfg.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Customer & Service Info */}
              <div className="grid grid-cols-2 gap-3 text-xs relative z-10">
                <div className="min-w-0">
                  <span className="text-[10px] text-ink-mute block">العميل:</span>
                  <p className="font-serif font-bold text-ink text-sm truncate">{b.customer_name}</p>
                  <p className="text-[11px] text-ink-mute font-mono truncate">{b.customer_phone}</p>
                </div>
                <div className="min-w-0 text-left sm:text-right">
                  <span className="text-[10px] text-ink-mute block">الكابتن:</span>
                  <p className="font-bold text-forest truncate">{barber?.full_name || (b as any).barber_name || (b as any).barberName || 'محمد الحداد'}</p>
                </div>
              </div>

              {/* Service & Total Box with Dedicated Receipt Image Button */}
              <div className="p-2.5 bg-paper-warm/80 rounded-xl border border-border flex items-center justify-between relative z-10">
                <div>
                  <p className="font-bold text-ink text-xs">{b.service_name || primarySrv?.name || (b as any).serviceName || 'قص وتصفيف كلاسيكي'}</p>
                  {b.payment_proof && (
                    <button
                      onClick={() => setSelectedProofBooking(b)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-forest font-bold bg-forest/10 hover:bg-forest/20 px-2.5 py-1 rounded-lg border border-forest/20 shadow-2xs transition-all cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>عرض صورة الإيصال 🖼️</span>
                    </button>
                  )}
                </div>
                <div className="text-left">
                  <span className="text-[10px] text-ink-mute block">الإجمالي:</span>
                  <p className="font-serif font-bold text-forest text-sm">
                    {isCustom && !isPricedCustom && Number(b.total_at_booking) === 0
                      ? 'بانتظار التسعير'
                      : formatCurrency(b.total_at_booking || (b as any).totalAmount || primarySrv?.price || 180)}
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-1 border-t border-border/70 gap-2 relative z-10">
                {isCustom ? (
                  isPricedCustom ? (
                    <button
                      onClick={() => setSelectedCustomPricingBooking(b)}
                      className="flex-1 py-2 px-3 rounded-xl bg-paper-warm hover:bg-forest hover:text-white text-forest border border-forest/30 font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      title="هل تريد تعديل التسعير؟"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>تعديل التسعير 🛠️</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedCustomPricingBooking(b)}
                      className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all animate-pulse cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                      <span>تسعير واعتماد الحجز 🛠️</span>
                    </button>
                  )
                ) : null}

                <div className="flex items-center gap-1.5 ml-auto">
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
                <th className="py-3.5 px-4 font-bold">الخدمة</th>
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
                const statusCfg = BOOKING_STATUS_CONFIG[b.status] || {
                  label: b.status,
                  bg: 'bg-paper-warm',
                  text: 'text-ink',
                  border: 'border-border',
                };
                const isConfirmed = b.status === 'confirmed' || b.status === 'completed';

                return (
                  <tr
                    key={b.id}
                    className={`transition-colors ${
                      isConfirmed
                        ? 'bg-emerald-50/45 hover:bg-emerald-50/75 border-r-4 border-r-emerald-500'
                        : 'hover:bg-paper-warm/40'
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-forest block">
                        {b.id}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-serif font-bold text-ink">{b.customer_name}</p>
                        <p className="text-[11px] text-ink-mute font-mono">{b.customer_phone}</p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div>
                        <p className="font-bold text-ink">{b.service_name || primarySrv?.name || (b as any).serviceName || 'قص وتصفيف كلاسيكي'}</p>
                        {b.additional_service_ids && b.additional_service_ids.length > 0 ? (
                          <p className="text-[10px] text-forest font-semibold">
                            +{b.additional_service_ids.length} خدمات إضافية
                          </p>
                        ) : null}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-ink-soft font-medium">
                      {barber?.full_name || (b as any).barber_name || (b as any).barberName || 'محمد الحداد'}
                    </td>

                    <td className="py-3.5 px-4 text-ink-soft">
                      <p className="font-bold">{format12Hour(b.starts_at)}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-serif font-bold text-forest text-sm">{formatCurrency(b.total_at_booking)}</p>
                      {b.payment_proof && (
                        <button
                          onClick={() => setSelectedProofBooking(b)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-forest font-bold bg-forest/10 hover:bg-forest/20 px-2.5 py-1 rounded-lg border border-forest/20 shadow-2xs transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>عرض صورة الإيصال 🖼️</span>
                        </button>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {isConfirmed ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>حجز مؤكد ✓</span>
                        </span>
                      ) : b.status === 'pending_review' || b.payment_proof ? (
                        <button
                          onClick={() => setSelectedProofBooking(b)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-xs cursor-pointer transition-all active:scale-95"
                          title="عرض إيصال التحويل للاعتماد أو الرفض"
                        >
                          <Eye className="w-3.5 h-3.5" />
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
                        {(() => {
                          const isCustom = b.service_id === 'srv-custom' || (b.status as any) === 'custom_pricing_requested' || Boolean(b.notes && (b.notes.includes('[طلب تخصيص خدمة]') || b.notes.includes('طلب خدمة مخصصة')));
                          const hasCustomLineItems = Array.isArray(b.custom_line_items) && b.custom_line_items.length > 0;
                          const isPricedCustom = isCustom && (hasCustomLineItems || (b.status === 'confirmed' && Number(b.total_at_booking) > 0));

                          if (isCustom) {
                            if (isPricedCustom) {
                              return (
                                <button
                                  onClick={() => setSelectedCustomPricingBooking(b)}
                                  className="px-2.5 py-1.5 rounded-lg bg-paper-warm hover:bg-forest hover:text-white text-forest border border-forest/30 font-bold text-xs shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                                  title="هل تريد تعديل التسعير؟"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                  <span>تعديل التسعير 🛠️</span>
                                </button>
                              );
                            }
                            return (
                              <button
                                onClick={() => setSelectedCustomPricingBooking(b)}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs flex items-center gap-1 transition-all animate-pulse cursor-pointer"
                                title="تسعير الخدمة المخصصة وتأكيد الحجز"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                                <span>تسعير واعتماد 🛠️</span>
                              </button>
                            );
                          }
                          return null;
                        })()}
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
              const currentBookings = useSalonStore.getState().bookings;
              const newTotal = Number(updated.total_at_booking || updated.totalPrice || updated.totalAmount || 0);
              const newDiscount = Number(updated.discount_at_booking !== undefined ? updated.discount_at_booking : (updated.discount || 0));
              const updatedList = currentBookings.map((b) => {
                if (b.id === updated.id) {
                  return {
                    ...b,
                    ...updated,
                    service_name: updated.service_name || updated.serviceName || b.service_name,
                    total_at_booking: newTotal,
                    service_price_at_booking: newTotal,
                    discount_at_booking: newDiscount,
                    custom_line_items: updated.custom_line_items || updated.items || b.custom_line_items,
                    status: 'confirmed' as const,
                    barber_id: updated.barber_id || updated.barberId || b.barber_id,
                    barber_name: updated.barber_name || updated.barberName || b.barber_name,
                  };
                }
                return b;
              });
              useSalonStore.setState({ bookings: updatedList });
            }
          }}
        />
      )}

      {/* EDIT MODAL */}
      {selectedEditBooking && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedEditBooking(null);
            }
          }}
        >
          <div className="modal-container max-w-lg p-6 shadow-clinic-3 space-y-4 text-xs bg-white">
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
