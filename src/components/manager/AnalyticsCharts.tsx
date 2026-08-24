import React from 'react';
import { useSalonStore } from '../../lib/store';
import { formatCurrency } from '../../lib/utils';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Users,
  Scissors,
  Star,
  Award,
  Crown,
  Building2,
  CalendarCheck,
} from 'lucide-react';

const PALETTE_COLORS = ['#1e3a2e', '#c2613d', '#f59e0b', '#2563eb', '#059669', '#d97706'];

export const AnalyticsCharts: React.FC = () => {
  const { bookings, barbers, services, chairs, branches, currentUser } = useSalonStore();

  const isSuperAdmin = currentUser.is_super_admin ?? true;
  const allowedBranchIds = isSuperAdmin
    ? branches.map((b) => b.id)
    : currentUser.assigned_branch_ids || (currentUser.branch_id ? [currentUser.branch_id] : [branches[0]?.id]);

  const scopedBookings = bookings.filter((b) => !b.branch_id || allowedBranchIds.includes(b.branch_id));
  const scopedBarbers = barbers.filter((b) => !b.branch_id || allowedBranchIds.includes(b.branch_id));
  const scopedChairs = chairs.filter((c) => !c.branch_id || allowedBranchIds.includes(c.branch_id));

  // Dynamic real metrics calculations from live bookings & salon operations
  const completedBookings = scopedBookings.filter((b) => b.status === 'completed').length;
  const confirmedBookingsCount = scopedBookings.filter((b) => b.status === 'confirmed' || b.status === 'in_service').length;
  const vipBookings = scopedBookings.filter((b) => b.booking_type === 'vip' || (b.service_id && b.service_id.toLowerCase().includes('vip'))).length;
  const activeBarbersCount = barbers.filter((b) => b.is_active).length;

  // 1. Online Bookings Revenue (Deposits & Online Full Payments)
  const onlineBookingsRevenue = scopedBookings
    .filter((b) => b.source === 'web' || b.source === 'whatsapp' || b.payment_proof)
    .reduce((sum, b) => {
      if (b.status === 'completed') return sum + Number(b.total_at_booking || 180);
      if (b.status === 'confirmed' || b.status === 'in_service' || b.payment_proof?.status === 'approved') {
        return sum + Number(b.booking_fee_at_booking || 50);
      }
      return sum;
    }, 0);

  // 2. Direct In-Salon Walk-in Services Revenue
  const inSalonWalkInRevenue = scopedBookings
    .filter((b) => (b as any).source === 'walk_in' || (!b.payment_proof && b.status === 'completed'))
    .reduce((sum, b) => sum + Number(b.total_at_booking || 180), 0);

  // 3. Products & Retail Sales
  const productRetailRevenue = scopedBookings.reduce((sum, b) => {
    return sum + (b.items || []).reduce((iSum, item) => iSum + (Number(item.price_at_booking || (item as any).price || 0) * Number(item.quantity || 1)), 0);
  }, 0);

  // Total Combined Salon Revenue
  const totalRevenue = scopedBookings.reduce((sum, b) => {
    if (b.status === 'completed') return sum + Number(b.total_at_booking || 180);
    if (b.status === 'confirmed' || b.status === 'in_service' || b.payment_proof?.status === 'approved') {
      return sum + Number(b.booking_fee_at_booking || 50);
    }
    return sum;
  }, 0) + productRetailRevenue;

  // Real Dynamic Revenue by Day for past 7 days
  const daysOfWeekArabic = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const now = new Date();
  const revenueTrendData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(now.getDate() - (6 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = daysOfWeekArabic[d.getDay()];
    const dayBookings = scopedBookings.filter((b) => (b.starts_at?.startsWith(dateStr) || b.created_at?.startsWith(dateStr)) && b.status !== 'cancelled');
    const dayRev = dayBookings.reduce((sum, b) => {
      if (b.status === 'completed') return sum + Number(b.total_at_booking || 180);
      if (b.status === 'confirmed' || b.status === 'in_service' || b.payment_proof?.status === 'approved') {
        return sum + Number(b.booking_fee_at_booking || 50);
      }
      return sum;
    }, 0);
    return {
      day: dayName,
      revenue: dayRev,
      bookings: dayBookings.length,
    };
  });

  // Real Service distribution data (Matches both by ID and name + includes additional services)
  const serviceDistributionData: { name: string; value: number }[] = services
    .map((s) => {
      const sNameClean = s.name.split('(')[0].trim().toLowerCase();
      const count = scopedBookings.filter((b) => {
        const bSrvId = b.service_id || (b as any).serviceId;
        const bSrvName = (b.service_name || (b as any).serviceName || '').toLowerCase();
        const hasPrimary = bSrvId === s.id || (bSrvName && (bSrvName.includes(sNameClean) || sNameClean.includes(bSrvName)));
        const hasAdditional = (b.additional_service_ids || []).includes(s.id);
        return hasPrimary || hasAdditional;
      }).length;
      return {
        name: s.name.split('(')[0].trim(),
        value: count,
      };
    })
    .filter((s) => s.value > 0);

  // Fallback if bookings have custom service names not in static IDs
  if (serviceDistributionData.length === 0 && scopedBookings.length > 0) {
    const nameMap = new Map<string, number>();
    scopedBookings.forEach((b) => {
      const sName = (b.service_name || (b as any).serviceName || 'قص شعر وتصفيف كلاسيكي').split('(')[0].split('+')[0].trim();
      nameMap.set(sName, (nameMap.get(sName) || 0) + 1);
    });
    nameMap.forEach((val, key) => {
      serviceDistributionData.push({ name: key, value: val });
    });
  }

  const totalCutsCount = serviceDistributionData.reduce((acc, curr) => acc + curr.value, 0);

  // Real Barber Performance leaderboard (Displays all salon barbers & accurate session counts)
  const displayBarbers = scopedBarbers.length > 0 ? scopedBarbers : barbers;
  const barberStats = displayBarbers.map((barber) => {
    const bName = barber.full_name.trim().toLowerCase();
    const barberBookings = scopedBookings.filter((b) => {
      const bBarberId = b.barber_id || (b as any).barberId;
      const bBarberName = (b.barber_name || (b as any).barberName || '').trim().toLowerCase();
      return bBarberId === barber.id || (bBarberName && (bBarberName.includes(bName) || bName.includes(bBarberName)));
    });

    const branchObj = branches.find((br) => br.id === barber.branch_id) || branches[0];
    const completedCount = barberBookings.filter((b) => b.status === 'completed' || b.status === 'in_service' || b.status === 'confirmed').length;
    const calculatedRevenue = barberBookings.reduce((sum, b) => {
      if (b.status === 'completed') return sum + Number(b.total_at_booking || 180);
      if (b.status === 'confirmed' || b.status === 'in_service' || b.payment_proof?.status === 'approved') {
        return sum + Number(b.booking_fee_at_booking || 50);
      }
      return sum;
    }, 0);

    return {
      id: barber.id,
      name: barber.full_name,
      branchName: branchObj ? branchObj.name.split('-')[0].trim() : 'فرع الصالون',
      fullBranchName: branchObj ? branchObj.name : 'فرع رئيسي',
      specialty: barber.specialty || 'حلاقة وتصفيف كلاسيكي',
      rating: barber.rating || 5.0,
      ratingCount: Math.max(barber.rating_count || 0, completedCount > 0 ? completedCount : 1),
      completedCuts: completedCount,
      revenue: calculatedRevenue,
      photo: barber.photo_url || '',
    };
  });

  return (
    <div className="space-y-6 sm:space-y-8 font-sans text-ink">
      {/* Top KPI Cards (Responsive 2-col on mobile, 4-col on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Revenue */}
        <div className="clinic-card p-3.5 sm:p-5 shadow-clinic-2 bg-white/95 flex items-center justify-between gap-2">
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-ink-mute font-bold truncate">إجمالي الإيرادات</p>
            <h3 className="text-base sm:text-2xl font-serif font-extrabold text-forest truncate">
              {formatCurrency(totalRevenue)}
            </h3>
            <p className="text-[9px] sm:text-[11px] text-forest font-bold flex items-center gap-0.5 sm:gap-1 truncate">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span>مبيعات مباشرة</span>
            </p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-forest/10 text-forest border border-forest/20 flex items-center justify-center shrink-0 shadow-xs">
            <DollarSign className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* Completed Bookings */}
        <div className="clinic-card p-3.5 sm:p-5 shadow-clinic-2 bg-white/95 flex items-center justify-between gap-2">
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-ink-mute font-bold truncate">الحجوزات المنجزة</p>
            <h3 className="text-base sm:text-2xl font-serif font-extrabold text-ink truncate">
              {completedBookings} موعد
            </h3>
            <p className="text-[9px] sm:text-[11px] text-[#b45309] font-bold flex items-center gap-0.5 sm:gap-1 truncate">
              <Star className="w-3 h-3 fill-[#f59e0b] text-[#f59e0b] shrink-0" />
              <span>حجوزات مكتملة</span>
            </p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-terra/10 text-terra-deep border border-terra/20 flex items-center justify-center shrink-0 shadow-xs">
            <Scissors className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>

        {/* VIP Sessions */}
        <div className="clinic-card p-3.5 sm:p-5 shadow-clinic-2 bg-white/95 flex items-center justify-between gap-2">
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-ink-mute font-bold truncate">جلسات جناح VIP</p>
            <h3 className="text-base sm:text-2xl font-serif font-extrabold text-terra-deep truncate">
              {vipBookings} جلسة
            </h3>
            <p className="text-[9px] sm:text-[11px] text-ink-mute font-bold truncate">
              {totalRevenue > 0 ? `${Math.round((scopedBookings.filter(b => b.booking_type === 'vip').reduce((s, b) => s + b.total_at_booking, 0) / totalRevenue) * 100)}% من الإيراد` : '0% من الإيراد'}
            </p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#fef3c7] text-[#b45309] border border-[#f59e0b]/30 flex items-center justify-center shrink-0 shadow-xs">
            <Crown className="w-4 h-4 sm:w-6 sm:h-6 fill-[#f59e0b] text-[#f59e0b]" />
          </div>
        </div>

        {/* Active Staff */}
        <div className="clinic-card p-3.5 sm:p-5 shadow-clinic-2 bg-white/95 flex items-center justify-between gap-2">
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <p className="text-[10px] sm:text-xs text-ink-mute font-bold truncate">فريق العمل والكراسي</p>
            <h3 className="text-base sm:text-2xl font-serif font-extrabold text-ink truncate">
              {activeBarbersCount} حلاقين • {scopedChairs.length} كراسي
            </h3>
            <p className="text-[9px] sm:text-[11px] text-forest font-bold truncate">
              {branches.length} فروع مفعلة
            </p>
          </div>
          <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-forest/10 text-forest border border-forest/20 flex items-center justify-center shrink-0 shadow-xs">
            <Users className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Revenue Trend Area Chart */}
        <div className="clinic-card p-4 sm:p-6 shadow-clinic-2 bg-white/95 space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h4 className="font-serif font-bold text-ink text-sm sm:text-base">تطور الإيرادات الأسبوعية (ج.م)</h4>
              <p className="text-[11px] sm:text-xs text-ink-mute">إجمالي المبيعات وقيم الحجوزات اليومية</p>
            </div>
            <span className="text-[10px] sm:text-xs font-bold text-forest bg-forest/10 border border-forest/20 px-2.5 sm:px-3 py-1 rounded-full">
              آخر 7 أيام
            </span>
          </div>

          <div className="h-56 sm:h-64 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="forestGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e3a2e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#1e3a2e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d3" />
                <XAxis dataKey="day" stroke="#6b7280" tick={{ fontSize: 10 }} />
                <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} width={38} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e5e0d3',
                    borderRadius: '14px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    fontSize: '11px',
                  }}
                  formatter={(value: any) => [`${value} ج.م`, 'الإيراد']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#1e3a2e"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#forestGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Service Distribution Donut Chart */}
        <div className="clinic-card p-4 sm:p-6 shadow-clinic-2 bg-white/95 space-y-3 sm:space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h4 className="font-serif font-bold text-ink text-sm sm:text-base">توزيع الخدمات الأكثر طلباً</h4>
                <p className="text-[11px] sm:text-xs text-ink-mute">نسبة طلب باقات وقصات الشعر والعناية بالبشرة</p>
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-terra-deep bg-terra/10 border border-terra/20 px-2.5 sm:px-3 py-1 rounded-full">
                حسب الحجوزات
              </span>
            </div>

            {serviceDistributionData.length > 0 ? (
              <div className="h-44 sm:h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={serviceDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={68}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {serviceDistributionData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PALETTE_COLORS[index % PALETTE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e5e0d3',
                        borderRadius: '14px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                        fontSize: '11px',
                      }}
                      formatter={(val: any, name: any) => [`${val} طلب (${Math.round((Number(val) / (totalCutsCount || 1)) * 100)}%)`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-44 sm:h-48 flex flex-col items-center justify-center text-center p-4 text-ink-mute space-y-2">
                <CalendarCheck className="w-8 h-8 text-border-soft" />
                <p className="text-xs font-semibold">لا توجد حجوزات مسجلة بعد</p>
                <span className="text-[10px]">ستظهر نسب الخدمات فور تسجيل الحجوزات الفعلية</span>
              </div>
            )}
          </div>

          {/* Legend */}
          {serviceDistributionData.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-border">
              {serviceDistributionData.map((s, index) => {
                const color = PALETTE_COLORS[index % PALETTE_COLORS.length];
                const pct = Math.round((s.value / (totalCutsCount || 1)) * 100);
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between text-[11px] bg-paper-warm/70 px-2.5 py-1 rounded-lg border border-border/50"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-ink truncate font-medium">{s.name}</span>
                    </div>
                    <span className="font-mono text-ink-mute font-bold text-[10px] shrink-0">
                      {pct}% ({s.value})
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Barber Performance Leaderboard */}
      <div className="clinic-card p-4 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4 sm:space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-border pb-3 sm:pb-4">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-forest/10 text-forest flex items-center justify-center border border-forest/20 shadow-xs shrink-0">
              <Award className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h4 className="font-serif font-bold text-ink text-sm sm:text-base">لوحة شرف وإحصائيات الكباتن</h4>
              <p className="text-[10px] sm:text-xs text-ink-mute">تفاصيل إيرادات كل حلاق، الفرع التابع له، وعدد الجلسات المنفذة</p>
            </div>
          </div>

          <span className="font-mono text-forest bg-forest/10 border border-forest/20 px-3 py-1 rounded-full font-bold text-[10px] sm:text-xs self-start sm:self-auto">
            {barberStats.length} كباتن مسجلين
          </span>
        </div>

        {barberStats.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {barberStats.map((b, idx) => (
              <div
                key={b.id}
                className="p-4 sm:p-5 rounded-2xl bg-paper-warm border border-border space-y-3.5 shadow-sm hover:border-forest/40 hover:shadow-clinic-1 transition-all flex flex-col justify-between"
              >
                {/* Header with Photo and Info */}
                <div className="flex items-start gap-3">
                  {b.photo ? (
                    <img
                      src={b.photo}
                      alt={b.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-border shadow-xs shrink-0 bg-white"
                    />
                  ) : (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-forest/10 text-forest border border-forest/20 flex items-center justify-center font-serif text-lg font-bold shrink-0">
                      {b.name.trim().charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <h5 className="font-serif font-bold text-xs sm:text-sm text-ink truncate">{b.name}</h5>
                      <span className="text-[9px] sm:text-[10px] font-mono font-bold text-forest bg-forest/15 px-2 py-0.5 rounded-full shrink-0">
                        #{idx + 1}
                      </span>
                    </div>

                    <p className="text-[10px] sm:text-[11px] text-ink-soft font-bold flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-terra shrink-0" />
                      <span className="truncate">{b.fullBranchName}</span>
                    </p>

                    <p className="text-[9px] sm:text-[10px] text-ink-mute truncate">{b.specialty}</p>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-border space-y-0.5">
                    <span className="text-[9px] sm:text-[10px] text-ink-mute block">الجلسات:</span>
                    <strong className="font-serif font-bold text-ink text-xs sm:text-sm block">
                      {b.completedCuts} <span className="text-[10px] font-normal text-ink-soft">جلسة</span>
                    </strong>
                  </div>

                  <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-border space-y-0.5">
                    <span className="text-[9px] sm:text-[10px] text-ink-mute block">إجمالي الدخل:</span>
                    <strong className="font-serif font-bold text-forest text-xs sm:text-sm block truncate">
                      {formatCurrency(b.revenue)}
                    </strong>
                  </div>
                </div>

                {/* Rating and Progress */}
                <div className="pt-2 border-t border-border/80 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 font-bold text-[#b45309]">
                    <Star className="w-3.5 h-3.5 fill-[#f59e0b] text-[#f59e0b]" />
                    <span className="font-mono text-xs sm:text-sm font-extrabold">{b.rating}</span>
                    <span className="text-ink-mute text-[9px] sm:text-[10px] font-mono">({b.ratingCount})</span>
                  </span>

                  <span className="text-[9px] sm:text-[10px] font-mono text-forest font-bold bg-forest/10 px-2 py-0.5 rounded-lg">
                    {b.completedCuts > 0 ? 'نشط بالخدمة' : 'جاهز للعمل'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-ink-mute space-y-2">
            <Users className="w-10 h-10 mx-auto text-border-soft" />
            <p className="text-sm font-semibold">لم يتم إضافة حلاقين بعد</p>
            <p className="text-xs">يمكنك إضافة كباتن الحلاقة من قسم "الحلاقين وفريق العمل"</p>
          </div>
        )}
      </div>
    </div>
  );
};
