import React, { useState, useMemo } from 'react';
import { useSalonStore } from '../../lib/store';
import { Booking } from '../../types';
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
  Download,
  Filter,
  UserCheck,
  Smartphone,
  Wallet,
  Coins,
  Clock,
} from 'lucide-react';
import { PaymentProofModal } from '../receptionist/PaymentProofModal';
import { ThermalInvoice } from '../receptionist/ThermalInvoice';

export const BookingRevenuesManager: React.FC = () => {
  const { bookings, branches, barbers, services, currentUser } = useSalonStore();

  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [selectedProofBooking, setSelectedProofBooking] = useState<Booking | null>(null);
  const [selectedInvoiceBooking, setSelectedInvoiceBooking] = useState<Booking | null>(null);

  // Filter only confirmed/approved revenue-generating bookings
  const confirmedBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Must be confirmed, in_service, or completed, OR have an approved payment proof
      const isStatusConfirmed =
        b.status === 'confirmed' ||
        b.status === 'in_service' ||
        b.status === 'completed' ||
        b.payment_proof?.status === 'approved';

      if (!isStatusConfirmed) return false;

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
        const matchName = b.customer_name.toLowerCase().includes(query);
        const matchPhone = b.customer_phone.includes(query);
        const matchId = b.id.toLowerCase().includes(query);
        if (!matchName && !matchPhone && !matchId) return false;
      }

      return true;
    });
  }, [bookings, selectedBranchId, selectedMethod, dateFilter, searchQuery]);

  // Helper to calculate actual collected deposit vs pending balance
  const getBookingFinancials = (b: Booking) => {
    const srv = services.find((s) => s.id === b.service_id || s.name === b.service_name);
    const totalServicePrice = Number(b.total_at_booking || b.service_price_at_booking || srv?.price || 180);
    const depositAmount = Number(b.payment_proof?.transferred_amount || b.booking_fee_at_booking || (b.booking_type === 'vip' ? 100 : 50));

    // If completed: full bill is collected (deposit + remaining)
    if (b.status === 'completed') {
      return {
        collected: totalServicePrice,
        pending: 0,
        total: totalServicePrice,
        isCompleted: true,
      };
    }

    // If confirmed / in_service: deposit has been collected in treasury!
    return {
      collected: depositAmount,
      pending: Math.max(0, totalServicePrice - depositAmount),
      total: totalServicePrice,
      isCompleted: false,
    };
  };

  // Aggregate financial metrics
  const totalCollectedRevenues = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingFinancials(b).collected, 0);
  }, [confirmedBookings]);

  const totalPendingInSalon = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingFinancials(b).pending, 0);
  }, [confirmedBookings]);

  const totalContractValues = useMemo(() => {
    return confirmedBookings.reduce((sum, b) => sum + getBookingFinancials(b).total, 0);
  }, [confirmedBookings]);

  const instapayRevenues = useMemo(() => {
    return confirmedBookings
      .filter((b) => b.payment_proof?.payment_method === 'instapay')
      .reduce((sum, b) => sum + getBookingFinancials(b).collected, 0);
  }, [confirmedBookings]);

  const vodafoneRevenues = useMemo(() => {
    return confirmedBookings
      .filter((b) => b.payment_proof?.payment_method === 'vodafone_cash')
      .reduce((sum, b) => sum + getBookingFinancials(b).collected, 0);
  }, [confirmedBookings]);

  const cashRevenues = useMemo(() => {
    return confirmedBookings
      .filter((b) => !b.payment_proof || b.payment_proof.payment_method === 'cash')
      .reduce((sum, b) => sum + getBookingFinancials(b).collected, 0);
  }, [confirmedBookings]);

  return (
    <div className="space-y-5 font-sans text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-forest text-paper flex items-center justify-center font-bold shadow-clinic-1 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-ink text-base sm:text-lg">
              سجل إيرادات ومقبوضات الحجوزات (Booking Revenues Ledger)
            </h3>
            <p className="text-xs text-ink-mute">
              توثيق فوري لكافة المبالغ والعربونات المؤكدة عبر إنستاباي، فودافون كاش، والدفع المباشر
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="font-mono text-forest bg-forest/10 border border-forest/20 px-3 py-1 rounded-full font-bold text-xs">
            {confirmedBookings.length} عملية مؤكدة
          </span>
        </div>
      </div>

      {/* 1. Summary KPI Financial Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Actual Collected in Cash Drawer */}
        <div className="p-4 rounded-2xl bg-[#1e3a2e] text-white shadow-clinic-2 flex flex-col justify-between space-y-2 border border-[#142920]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/90">المقبوضات المحصلة بالخزينة</span>
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shadow-xs">
              <TrendingUp className="w-4.5 h-4.5 text-white" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-black text-white font-mono tracking-tight drop-shadow-xs">
              {formatCurrency(totalCollectedRevenues)}
            </p>
            <span className="text-[10.5px] text-white/90 bg-white/15 px-2 py-0.5 rounded-full inline-block mt-1 font-bold">
              ✓ عربونات مؤكدة ومبالغ مستلمة
            </span>
          </div>
        </div>

        {/* Pending to collect in salon */}
        <div className="p-4 rounded-2xl bg-white border border-amber-200 text-ink shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">متبقي للتحصيل بالصالون</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-bold text-amber-900 font-mono tracking-tight">
              {formatCurrency(totalPendingInSalon)}
            </p>
            <span className="text-[10.5px] text-amber-700 font-bold block mt-1">
              يُدفع نقداً/إلكترونياً عند انتهاء الخدمة
            </span>
          </div>
        </div>

        {/* Total Contract / Bill Values */}
        <div className="p-4 rounded-2xl bg-white border border-border text-ink shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-mute">إجمالي قيمة الفواتير</span>
            <div className="w-8 h-8 rounded-xl bg-paper-warm text-ink-soft flex items-center justify-center border border-border">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-bold text-ink font-mono tracking-tight">
              {formatCurrency(totalContractValues)}
            </p>
            <span className="text-[10.5px] text-ink-mute font-bold block mt-1">
              قيمة الخدمات المحجوزة
            </span>
          </div>
        </div>

        {/* Online Channels (Instapay / Vodafone) */}
        <div className="p-4 rounded-2xl bg-white border border-purple-200 text-ink shadow-xs flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-900">إنستاباي وفودافون كاش</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-serif font-bold text-purple-900 font-mono tracking-tight">
              {formatCurrency(instapayRevenues + vodafoneRevenues)}
            </p>
            <span className="text-[10.5px] text-purple-700 font-bold block mt-1">
              عربونات محولة إلكترونياً
            </span>
          </div>
        </div>
      </div>

      {/* 2. Filters & Search Control Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-paper-warm/60 border border-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
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

        {/* Selectors */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Branch */}
          {branches.length > 1 && (
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-white border border-border font-bold text-ink cursor-pointer outline-none text-xs"
            >
              <option value="all">🏢 جميع الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Payment Method */}
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="px-2.5 py-2 rounded-xl bg-white border border-border font-bold text-ink cursor-pointer outline-none text-xs"
          >
            <option value="all">💳 جميع طرق الدفع</option>
            <option value="instapay">إنستاباي (InstaPay)</option>
            <option value="vodafone_cash">فودافون كاش</option>
            <option value="cash">كاش بالصالون</option>
          </select>

          {/* Date Filter */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-border gap-1">
            <button
              onClick={() => setDateFilter('today')}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all ${
                dateFilter === 'today' ? 'bg-forest text-paper' : 'text-ink-mute hover:text-ink'
              }`}
            >
              اليوم
            </button>
            <button
              onClick={() => setDateFilter('week')}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all ${
                dateFilter === 'week' ? 'bg-forest text-paper' : 'text-ink-mute hover:text-ink'
              }`}
            >
              أسبوع
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all ${
                dateFilter === 'month' ? 'bg-forest text-paper' : 'text-ink-mute hover:text-ink'
              }`}
            >
              الشهر
            </button>
            <button
              onClick={() => setDateFilter('all')}
              className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all ${
                dateFilter === 'all' ? 'bg-forest text-paper' : 'text-ink-mute hover:text-ink'
              }`}
            >
              الكل
            </button>
          </div>
        </div>
      </div>

      {/* 3. Mobile Cards Feed (Zero Horizontal Scroll) */}
      <div className="space-y-3 md:hidden">
        {confirmedBookings.length > 0 ? (
          confirmedBookings.map((b) => {
            const barber = barbers.find((bar) => bar.id === b.barber_id);
            const primarySrv = services.find((s) => s.id === b.service_id);
            const branch = branches.find((br) => br.id === b.branch_id);
            const method = b.payment_proof?.payment_method || 'cash';
            const fin = getBookingFinancials(b);

            return (
              <div
                key={b.id}
                className="p-3.5 rounded-2xl bg-white border border-border space-y-2.5 shadow-xs transition-all"
              >
                {/* Header: ID + Confirmed Amount Badge */}
                <div className="flex items-center justify-between border-b border-border/70 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-forest text-xs bg-forest/10 px-2 py-0.5 rounded-md border border-forest/20">
                      {b.id}
                    </span>
                    <span className="text-[10px] text-ink-mute font-mono">
                      {formatDateTime(b.created_at || b.starts_at)}
                    </span>
                  </div>

                  <div className="text-left font-mono">
                    <span className="font-serif font-bold text-forest text-sm block">
                      +{formatCurrency(fin.collected)}
                    </span>
                    <span className="text-[9.5px] text-ink-mute">
                      {fin.isCompleted ? 'مسدد بالكامل' : 'عربون مؤكد بالخزينة'}
                    </span>
                  </div>
                </div>

                {/* Customer & Service */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-ink-mute block">العميل:</span>
                    <p className="font-serif font-bold text-ink text-xs truncate">{b.customer_name}</p>
                    <p className="text-[10.5px] text-ink-mute font-mono">{b.customer_phone}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-ink-mute block">الخدمة والفرع:</span>
                    <p className="font-bold text-forest text-xs truncate">{primarySrv?.name || 'خدمة حلاقة'}</p>
                    <p className="text-[10px] text-ink-soft truncate">{branch?.name}</p>
                  </div>
                </div>

                {/* Financial breakdown pill */}
                <div className="p-2.5 bg-paper-warm/80 rounded-xl border border-border flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-ink-mute block">إجمالي الفاتورة:</span>
                    <strong className="text-ink text-xs">{formatCurrency(fin.total)}</strong>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] text-emerald-800 block">المحصل:</span>
                    <strong className="text-emerald-700 text-xs">{formatCurrency(fin.collected)}</strong>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-amber-800 block">المتبقي:</span>
                    <strong className={`text-xs ${fin.pending > 0 ? 'text-amber-800 font-bold' : 'text-forest'}`}>
                      {fin.pending > 0 ? formatCurrency(fin.pending) : '0 (خالص)'}
                    </strong>
                  </div>
                </div>

                {/* Payment Channel Badge & Approver */}
                <div className="p-2 bg-white rounded-xl border border-border flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {method === 'instapay' ? (
                      <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px] border border-purple-200">
                        إنستاباي (InstaPay)
                      </span>
                    ) : method === 'vodafone_cash' ? (
                      <span className="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded text-[10px] border border-red-200">
                        فودافون كاش
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                        كاش بالصالون
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-forest font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>{b.status === 'completed' ? 'خدمة مكتملة' : 'حجز ساري'}</span>
                  </span>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-border/70 text-xs">
                  {b.payment_proof ? (
                    <button
                      onClick={() => setSelectedProofBooking(b)}
                      className="inline-flex items-center gap-1 text-[11px] text-terra-deep hover:underline font-bold"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>معاينة الإيصال</span>
                    </button>
                  ) : (
                    <span className="text-[10.5px] text-ink-mute">دفع مباشر</span>
                  )}

                  <button
                    onClick={() => setSelectedInvoiceBooking(b)}
                    className="p-1.5 px-2.5 rounded-xl bg-paper-warm hover:bg-white text-forest border border-border shadow-xs text-xs font-bold flex items-center gap-1"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>طباعة الفاتورة</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center bg-white rounded-2xl border border-border space-y-2">
            <Receipt className="w-8 h-8 text-ink-mute mx-auto opacity-50" />
            <p className="font-serif font-bold text-sm text-ink">لا توجد عمليات إيرادات مطابقة للبحث</p>
            <p className="text-xs text-ink-mute">جرب تغيير الفلتر أو البحث عن رقم حجز آخر</p>
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
                <th className="py-3.5 px-4 font-bold">المحصل بالخزينة</th>
                <th className="py-3.5 px-4 font-bold">المتبقي بالصالون</th>
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
                      {/* ID & Date */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-forest text-xs block">{b.id}</span>
                        <span className="text-[10.5px] text-ink-mute font-mono">
                          {formatDateTime(b.created_at || b.starts_at)}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <p className="font-serif font-bold text-ink">{b.customer_name}</p>
                        <p className="text-[11px] text-ink-mute font-mono">{b.customer_phone}</p>
                      </td>

                      {/* Service & Branch */}
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-ink">{primarySrv?.name || 'خدمة حلاقة'}</p>
                        <span className="text-[10.5px] text-ink-soft block">{branch?.name}</span>
                      </td>

                      {/* Payment Method Badge */}
                      <td className="py-3.5 px-4">
                        {method === 'instapay' ? (
                          <div className="space-y-0.5">
                            <span className="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10.5px] border border-purple-200 inline-block">
                              إنستاباي (InstaPay)
                            </span>
                          </div>
                        ) : method === 'vodafone_cash' ? (
                          <div className="space-y-0.5">
                            <span className="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded text-[10.5px] border border-red-200 inline-block">
                              فودافون كاش
                            </span>
                          </div>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10.5px] border border-emerald-200 inline-block">
                            كاش بالصالون
                          </span>
                        )}
                      </td>

                      {/* Confirmed / Collected Amount */}
                      <td className="py-3.5 px-4">
                        <span className="font-serif font-bold text-forest text-sm block font-mono">
                          +{formatCurrency(fin.collected)}
                        </span>
                        <span className="text-[9.5px] text-emerald-700 font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>{fin.isCompleted ? 'مسدد بالكامل' : 'عربون بالخزينة'}</span>
                        </span>
                      </td>

                      {/* Pending In-Salon Amount */}
                      <td className="py-3.5 px-4 font-mono">
                        {fin.pending > 0 ? (
                          <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                            {formatCurrency(fin.pending)}
                          </span>
                        ) : (
                          <span className="text-forest font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            0 (مسدد بالكامل ✓)
                          </span>
                        )}
                      </td>

                      {/* Total Service Price */}
                      <td className="py-3.5 px-4 font-mono font-bold text-ink text-xs">
                        {formatCurrency(fin.total)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {b.payment_proof && (
                            <button
                              onClick={() => setSelectedProofBooking(b)}
                              className="p-1.5 rounded-lg bg-paper-warm hover:bg-paper-deep text-terra-deep transition-colors"
                              title="معاينة إثبات التحويل"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedInvoiceBooking(b)}
                            className="p-1.5 px-2.5 rounded-lg bg-forest hover:bg-forest/90 text-paper transition-all flex items-center gap-1 text-[11px] font-bold shadow-xs"
                            title="طباعة الفاتورة الحرارية الشاملة"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>فاتورة POS</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-ink-mute text-xs">
                    لا توجد إيرادات مؤكدة مطابقة للشروط المحددة
                  </td>
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
