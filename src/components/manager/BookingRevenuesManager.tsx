import React, { useState, useMemo } from 'react';
import { useSalonStore } from '../../lib/store';
import { Booking } from '../../types';
import { api } from '../../lib/api';
import {
  formatCurrency,
  formatDateTime,
  format12Hour,
  formatDate,
} from '../../lib/utils';
import {
  DollarSign,
  Receipt,
  Search,
  Building2,
  Calendar,
  CreditCard,
  Phone,
  CheckCircle2,
  Eye,
  Printer,
  Sparkles,
  TrendingUp,
  RotateCcw,
  Clock,
  Smartphone,
  Check,
  AlertTriangle,
  Layers,
  History,
} from 'lucide-react';
import { PaymentProofModal } from '../receptionist/PaymentProofModal';
import { ThermalInvoice } from '../receptionist/ThermalInvoice';
import toast from 'react-hot-toast';

export const BookingRevenuesManager: React.FC = () => {
  const { bookings, branches, barbers, services, settings, updateSettings } = useSalonStore();

  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewScope, setViewScope] = useState<'current_shift' | 'all_time'>('current_shift');
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Modals state
  const [selectedProofBooking, setSelectedProofBooking] = useState<Booking | null>(null);
  const [selectedInvoiceBooking, setSelectedInvoiceBooking] = useState<Booking | null>(null);

  const [localResetAt, setLocalResetAt] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('trimmind_revenues_reset_at') || null;
    }
    return null;
  });

  const revenuesResetAt = settings?.revenues_reset_at || localResetAt;

  // Filter confirmed/approved revenue-generating bookings
  const confirmedBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        // Must be confirmed, in_service, or completed, OR have an approved payment proof
        const isStatusConfirmed =
          b.status === 'confirmed' ||
          b.status === 'in_service' ||
          b.status === 'completed' ||
          b.payment_proof?.status === 'approved';

        if (!isStatusConfirmed) return false;

        // Shift vs All-Time Scope Filter
        if (viewScope === 'current_shift' && revenuesResetAt) {
          const bookingTimestamp = new Date(b.completed_at || b.updated_at || b.created_at || b.starts_at).getTime();
          const resetTimestamp = new Date(revenuesResetAt).getTime();
          if (bookingTimestamp < resetTimestamp) return false;
        }

        // Branch filter
        if (selectedBranchId !== 'all' && b.branch_id !== selectedBranchId) {
          return false;
        }

        // Payment method filter
        const method = b.payment_proof?.payment_method || (b.payment_proof ? 'online' : 'cash');
        if (selectedMethod !== 'all') {
          if (selectedMethod === 'instapay' && method !== 'instapay') return false;
          if (selectedMethod === 'vodafone_cash' && method !== 'vodafone_cash') return false;
          if (selectedMethod === 'cash' && method !== 'cash') return false;
        }

        // Date range filter
        if (dateFilter !== 'all') {
          const bookingDate = new Date(b.created_at || b.starts_at);
          const now = new Date();
          if (dateFilter === 'today') {
            if (bookingDate.toDateString() !== now.toDateString()) return false;
          } else if (dateFilter === 'week') {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (bookingDate < sevenDaysAgo) return false;
          } else if (dateFilter === 'month') {
            if (
              bookingDate.getMonth() !== now.getMonth() ||
              bookingDate.getFullYear() !== now.getFullYear()
            ) {
              return false;
            }
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const matchName = (b.customer_name || '').toLowerCase().includes(query);
          const matchPhone = (b.customer_phone || '').includes(query);
          const matchId = (b.id || '').toLowerCase().includes(query);
          if (!matchName && !matchPhone && !matchId) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.created_at || a.starts_at || 0).getTime();
        const timeB = new Date(b.created_at || b.starts_at || 0).getTime();
        return timeB - timeA;
      });
  }, [bookings, selectedBranchId, selectedMethod, dateFilter, searchQuery, viewScope, revenuesResetAt]);

  // Helper to calculate exact breakdown: Deposit, Remaining Collected, Total Bill
  const getBookingFinancials = (b: Booking) => {
    const srv = services.find((s) => s.id === b.service_id || s.name === b.service_name);
    const totalServicePrice = Number(b.total_at_booking || b.service_price_at_booking || srv?.price || 180);
    const depositAmount = Number(
      b.payment_proof?.transferred_amount || b.booking_fee_at_booking || (b.booking_type === 'vip' ? 100 : 50)
    );
    const isCompleted = b.status === 'completed';

    // 1. Confirmed Deposit (added as soon as booking is approved)
    const depositCollected = depositAmount;

    // 2. Remaining Amount collected upon service completion in salon
    const remainingCollected = isCompleted ? Math.max(0, totalServicePrice - depositAmount) : 0;

    // 3. Pending balance if service is still waiting or in progress
    const pendingToCollect = isCompleted ? 0 : Math.max(0, totalServicePrice - depositAmount);

    // 4. Total settled amount for this booking
    const totalSettled = isCompleted ? totalServicePrice : depositAmount;

    return {
      depositCollected,
      remainingCollected,
      pendingToCollect,
      totalSettled,
      totalBill: totalServicePrice,
      isCompleted,
    };
  };

  // Aggregate financial metrics
  const totalDepositRevenues = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingFinancials(b).depositCollected, 0);
  }, [confirmedBookings]);

  const totalRemainingCollected = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingFinancials(b).remainingCollected, 0);
  }, [confirmedBookings]);

  const totalSettledInvoices = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingFinancials(b).totalSettled, 0);
  }, [confirmedBookings]);

  const totalPendingInSalon = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingFinancials(b).pendingToCollect, 0);
  }, [confirmedBookings]);

  // Handle Reset Revenues Counter
  const handleResetRevenuesCounter = async () => {
    setIsResetting(true);
    const nowIso = new Date().toISOString();
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('trimmind_revenues_reset_at', nowIso);
      }
      setLocalResetAt(nowIso);
      updateSettings({ revenues_reset_at: nowIso });
      setViewScope('current_shift');
      setShowResetModal(false);
      toast.success('تم تصفير عداد الإيرادات بنجاح! بدأ العداد من 0 ج.م للوردية الحالية 🟢');

      // Sync with server in background
      api.updateSettings({ revenues_reset_at: nowIso }).catch(() => {});
    } catch {
      toast.error('حدث خطأ أثناء تصفير العداد');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-5 font-sans text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-forest text-paper flex items-center justify-center font-bold shadow-clinic-1 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-ink text-base sm:text-lg flex items-center gap-2">
              <span>سجل إيرادات ومقبوضات الحجوزات</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-forest/10 text-forest border border-forest/20 font-bold">
                Live Ledger
              </span>
            </h3>
            <p className="text-xs text-ink-mute">
              توثيق فوري لإيرادات العربونات المعتمدة، باقي المقبوضات عند إنهاء الخدمة، وإجمالي الفواتير المسددة
            </p>
          </div>
        </div>

        {/* Top Actions: Reset Button & Scope Toggle */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Scope Selector */}
          <div className="flex items-center bg-paper-warm p-1 rounded-xl border border-border text-xs">
            <button
              onClick={() => setViewScope('current_shift')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                viewScope === 'current_shift'
                  ? 'bg-forest text-white shadow-xs'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>الوردية الحالية</span>
            </button>
            <button
              onClick={() => setViewScope('all_time')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                viewScope === 'all_time'
                  ? 'bg-forest text-white shadow-xs'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>الأرشيف الشامل</span>
            </button>
          </div>

          {/* Reset Revenues Counter Button */}
          <button
            onClick={() => setShowResetModal(true)}
            className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
            title="تصفير عداد الإيرادات وبدء وردية جديدة"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>تصفير الإيرادات</span>
          </button>
        </div>
      </div>

      {/* Shift Reset Active Banner (If active) */}
      {revenuesResetAt && (
        <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-900">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-bold">
              عداد الوردية الحالية نشط • تم التصفير في:{' '}
              <strong className="font-mono text-emerald-950 font-black">
                {formatDateTime(revenuesResetAt)}
              </strong>
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 font-bold">
            {viewScope === 'current_shift' ? 'عرض مبيعات الوردية الحالية فقط ✓' : 'عرض الأرشيف التراكمي الشامل'}
          </span>
        </div>
      )}

      {/* 1. Summary KPI Financial Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Deposit Revenues (عربونات الحجوزات المعتمدة) */}
        <div className="p-4 rounded-2xl bg-white border-2 border-emerald-500/40 text-ink shadow-clinic-1 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">إيرادات العربون المحصلة</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-black text-emerald-900 font-mono tracking-tight">
              {formatCurrency(totalDepositRevenues)}
            </p>
            <span className="text-[10px] text-emerald-700 font-bold block mt-1">
              ✓ عربونات مؤكدة عند قبول الحجز
            </span>
          </div>
        </div>

        {/* Card 2: Remaining Cash Collected on Completion (باقي المقبوضات عند الانتهاء) */}
        <div className="p-4 rounded-2xl bg-white border border-blue-200 text-ink shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900">باقي المقبوضات المحصلة</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-bold text-blue-950 font-mono tracking-tight">
              {formatCurrency(totalRemainingCollected)}
            </p>
            <span className="text-[10px] text-blue-700 font-bold block mt-1">
              ✓ محصل بالصالون عند إنهاء الخدمة
            </span>
          </div>
        </div>

        {/* Card 3: Total Settled / Paid Invoices (إجمالي قيمة الفواتير المسددة بالكامل) */}
        <div className="p-4 rounded-2xl bg-[#1e3a2e] text-white shadow-clinic-2 flex flex-col justify-between space-y-2 border border-[#142920]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">إجمالي الفواتير المسددة</span>
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shadow-xs">
              <TrendingUp className="w-4.5 h-4.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-black text-white font-mono tracking-tight drop-shadow-xs">
              {formatCurrency(totalSettledInvoices)}
            </p>
            <span className="text-[10px] text-white/90 bg-white/15 px-2 py-0.5 rounded-full inline-block mt-1 font-bold">
              إجمالي المقبوضات بالخزينة
            </span>
          </div>
        </div>

        {/* Card 4: Pending In-Salon Balance (متبقي قيد الانتظار بالصالون) */}
        <div className="p-4 rounded-2xl bg-white border border-amber-200 text-ink shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">متبقي قيد الانتظار</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-bold text-amber-900 font-mono tracking-tight">
              {formatCurrency(totalPendingInSalon)}
            </p>
            <span className="text-[10px] text-amber-700 font-bold block mt-1">
              يُدفع عند انتهاء الخدمة بالصالون
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filters & Search Control Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-paper-warm/60 border border-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-ink-mute absolute right-3 top-2.5" />
          <input
            type="text"
            placeholder="بحث برقم الحجز، اسم العميل، أو رقم الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-9 py-2 rounded-xl bg-white border border-border text-xs focus:outline-none focus:border-forest"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {branches.length > 1 && (
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-white border border-border font-bold text-ink cursor-pointer outline-none text-xs"
            >
              <option value="all">🏢 جميع الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="px-2.5 py-2 rounded-xl bg-white border border-border font-bold text-ink cursor-pointer outline-none text-xs"
          >
            <option value="all">💳 جميع طرق الدفع</option>
            <option value="instapay">🟣 إنستاباي (InstaPay)</option>
            <option value="vodafone_cash">🔴 فودافون كاش</option>
            <option value="cash">💵 كاش بالصالون</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-2.5 py-2 rounded-xl bg-white border border-border font-bold text-ink cursor-pointer outline-none text-xs"
          >
            <option value="all">📅 كل الفترات</option>
            <option value="today">اليوم</option>
            <option value="week">آخر 7 أيام</option>
            <option value="month">هذا الشهر</option>
          </select>
        </div>
      </div>

      {/* 3. Mobile Card View */}
      <div className="block md:hidden space-y-3">
        {confirmedBookings.length > 0 ? (
          confirmedBookings.map((b) => {
            const barber = barbers.find((bar) => bar.id === b.barber_id);
            const primarySrv = services.find((s) => s.id === b.service_id);
            const method = b.payment_proof?.payment_method || 'cash';
            const fin = getBookingFinancials(b);

            return (
              <div
                key={b.id}
                className="p-4 rounded-2xl bg-white border border-border shadow-xs space-y-3 text-xs"
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-forest text-xs">{b.id}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        fin.isCompleted
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {fin.isCompleted ? 'مكتمل ومسدد بالكامل ✓' : 'عربون فقط (في الانتظار)'}
                    </span>
                  </div>
                  <span className="text-[10.5px] text-ink-mute font-mono">
                    {formatDateTime(b.created_at || b.starts_at)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-ink-mute block">العميل:</span>
                    <strong className="text-ink font-bold">{b.customer_name || 'عميل محترم'}</strong>
                    <span className="text-ink-mute font-mono text-[10px] block">{b.customer_phone}</span>
                  </div>
                  <div>
                    <span className="text-ink-mute block">الخدمة:</span>
                    <strong className="text-ink">{b.service_name || primarySrv?.name || 'خدمة صالون'}</strong>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-paper-warm/70 border border-border/70 flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-emerald-800 font-bold block">العربون المحصل</span>
                    <span className="font-bold text-emerald-900">+{formatCurrency(fin.depositCollected)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-blue-800 font-bold block">باقي التحصيل</span>
                    <span className="font-bold text-blue-900">
                      {fin.isCompleted ? `+${formatCurrency(fin.remainingCollected)}` : formatCurrency(fin.pendingToCollect)}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-ink-mute font-bold block">إجمالي الفاتورة</span>
                    <span className="font-bold text-ink">{formatCurrency(fin.totalBill)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10.5px] text-ink-mute flex items-center gap-1 font-bold">
                    <CreditCard className="w-3.5 h-3.5 text-forest" />
                    <span>
                      {method === 'instapay'
                        ? 'إنستاباي'
                        : method === 'vodafone_cash'
                        ? 'فودافون كاش'
                        : 'كاش بالصالون'}
                    </span>
                  </span>

                  <div className="flex items-center gap-2">
                    {b.payment_proof && (
                      <button
                        onClick={() => setSelectedProofBooking(b)}
                        className="p-1.5 px-2.5 rounded-xl bg-paper-warm text-terra-deep border border-border shadow-xs text-xs font-bold flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>الإيصال</span>
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedInvoiceBooking(b)}
                      className="p-1.5 px-2.5 rounded-xl bg-paper-warm hover:bg-white text-forest border border-border shadow-xs text-xs font-bold flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>الفاتورة</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center bg-white rounded-2xl border border-border space-y-2">
            <Receipt className="w-8 h-8 text-ink-mute mx-auto opacity-50" />
            <p className="font-serif font-bold text-sm text-ink">لا توجد إيرادات مطابقة للبحث</p>
          </div>
        )}
      </div>

      {/* 4. Desktop Table View */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-white shadow-clinic-1">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-paper-warm/80 border-b border-border text-ink-soft font-serif">
              <tr>
                <th className="py-3.5 px-4 font-bold">رقم الحجز والتاريخ</th>
                <th className="py-3.5 px-4 font-bold">العميل ورقم الهاتف</th>
                <th className="py-3.5 px-4 font-bold">الخدمة والفرع</th>
                <th className="py-3.5 px-4 font-bold">طريقة الدفع</th>
                <th className="py-3.5 px-4 font-bold">إيراد العربون</th>
                <th className="py-3.5 px-4 font-bold">باقي المبلغ</th>
                <th className="py-3.5 px-4 font-bold">إجمالي الفاتورة</th>
                <th className="py-3.5 px-4 font-bold text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {confirmedBookings.length > 0 ? (
                confirmedBookings.map((b) => {
                  const barber = barbers.find((bar) => bar.id === b.barber_id);
                  const primarySrv = services.find((s) => s.id === b.service_id);
                  const branch = branches.find((br) => br.id === b.branch_id);
                  const method = b.payment_proof?.payment_method || 'cash';
                  const fin = getBookingFinancials(b);

                  return (
                    <tr key={b.id} className="hover:bg-paper-warm/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-forest text-xs block">{b.id}</span>
                        <span className="text-[10.5px] text-ink-mute font-mono">{formatDateTime(b.created_at || b.starts_at)}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-serif font-bold text-ink">{b.customer_name || (b as any).customerName || 'عميل محترم'}</p>
                        <p className="text-[11px] text-ink-mute font-mono">{b.customer_phone}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-ink">{b.service_name || primarySrv?.name || (b as any).serviceName || 'خدمة حلاقة'}</p>
                        <span className="text-[10.5px] text-ink-soft block">{branch?.name}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {method === 'instapay' ? (
                          <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10.5px] border border-purple-200 inline-block">إنستاباي (InstaPay)</span>
                        ) : method === 'vodafone_cash' ? (
                          <span className="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded text-[10.5px] border border-red-200 inline-block">فودافون كاش</span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10.5px] border border-emerald-200 inline-block">كاش بالصالون</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="font-serif font-bold text-emerald-700 text-sm block">+{formatCurrency(fin.depositCollected)}</span>
                        <span className="text-[9.5px] text-emerald-700 font-bold flex items-center gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" /> <span>عربون معتمد</span></span>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {fin.isCompleted ? (
                          <div>
                            <span className="font-serif font-bold text-blue-700 text-sm block">+{formatCurrency(fin.remainingCollected)}</span>
                            <span className="text-[9.5px] text-blue-700 font-bold">مسدد بالكامل ✓</span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">{formatCurrency(fin.pendingToCollect)}</span>
                            <span className="text-[9.5px] text-amber-700 block mt-0.5">قيد الانتظار</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-ink text-xs">{formatCurrency(fin.totalBill)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {b.payment_proof && (
                            <button
                              onClick={() => setSelectedProofBooking(b)}
                              className="p-1.5 px-2 rounded-lg bg-paper-warm hover:bg-paper-deep text-terra-deep transition-colors text-[11px] font-bold flex items-center gap-1"
                              title="معاينة إثبات التحويل"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>الإيصال</span>
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedInvoiceBooking(b)}
                            className="p-1.5 px-2.5 rounded-lg bg-forest hover:bg-forest/90 text-paper transition-all flex items-center gap-1 text-[11px] font-bold shadow-xs"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>فاتورة</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-mute text-xs">لا توجد إيرادات مؤكدة مطابقة للشروط المحددة</td>
                </tr>
              )}
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

      {selectedInvoiceBooking && (
        <ThermalInvoice
          booking={selectedInvoiceBooking}
          isOpen={!!selectedInvoiceBooking}
          onClose={() => setSelectedInvoiceBooking(null)}
        />
      )}
    </div>
  );
};
