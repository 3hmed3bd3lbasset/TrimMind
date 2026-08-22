import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSalonStore } from '../lib/store';
import {
  Scissors,
  Crown,
  Sparkles,
  CalendarCheck,
  Search,
  Star,
  ShieldCheck,
  Clock,
  MapPin,
  Phone,
  ArrowLeft,
  Coffee,
  CheckCircle2,
  Award,
  Tv,
  Building2,
} from 'lucide-react';
import { formatCurrency, format12Hour } from '../lib/utils';

export default function Landing() {
  const { branches, services, barbers, bookings, products, setAiDrawerOpen, setSelectedBranchId } = useSalonStore();
  const navigate = useNavigate();

  const [selectedHeroBranchId, setSelectedHeroBranchId] = useState<string>(branches[0]?.id || '');
  const [selectedBarberBranchFilter, setSelectedBarberBranchFilter] = useState<string>('all');

  const currentHeroBranch = branches.find((b) => b.id === selectedHeroBranchId) || branches[0];
  const branchProminentBarber =
    barbers.find((b) => b.is_active && (b.branch_id === currentHeroBranch?.id || !b.branch_id)) || barbers[0];

  const activeServices = services.filter((s) => s.is_active).slice(0, 4);
  const allActiveBarbers = barbers.filter((b) => b.is_active);
  const filteredBarbers =
    selectedBarberBranchFilter === 'all'
      ? allActiveBarbers
      : allActiveBarbers.filter((b) => b.branch_id === selectedBarberBranchFilter || !b.branch_id);

  const completedCount = bookings.filter((b) => b.status === 'completed').length;
  const activeProducts = products.filter((p) => p.is_active);

  return (
    <div className="space-y-24 pb-24 font-sans text-ink">
      {/* 1. CLINICMIND HERO SHELL */}
      <section className="relative pt-12 pb-16 overflow-hidden">
        {/* Organic Glow Orbs */}
        <div className="hero-glow-terra -top-24 -right-24" />
        <div className="hero-glow-forest top-1/2 -left-32" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Col: Hero Copy */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-right flex flex-col items-center lg:items-start">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-paper-warm border border-border text-forest text-xs font-bold shadow-clinic-1">
                <span className="w-2 h-2 rounded-full bg-ok animate-ping" />
                <span className="font-serif">صالون النخبة VIP • تجربة الحلاقة الأرقى في مصر</span>
              </div>

              {/* Main Headline */}
              <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal text-ink leading-[1.2] tracking-tight text-center lg:text-right">
                احجز كرسي حلاقتك <br className="hidden sm:inline" />
                <span className="italic text-forest block sm:inline">بدون دقيقة انتظار واحدة.</span>
              </h1>

              {/* Subtitle */}
              <p className="text-ink-soft text-sm sm:text-lg leading-relaxed max-w-xl text-center lg:text-right">
                منظومة حجز وإدارة ذكية تضمن وقتك وراحتك مع نخبة من أمهر الحلاقين في فروعنا الفاخرة.
                اختر خدمتك، حدد موعدك، وتتبع دورك لحظياً على شاشة الصالون.
              </p>

              {/* CTA Row */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2 w-full">
                <Link to="/book" className="btn-clinic-primary text-sm justify-center">
                  <span>احجز موعدك الآن</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>

                <button onClick={() => setAiDrawerOpen(true)} className="btn-clinic-ghost text-sm justify-center">
                  <Sparkles className="w-4 h-4 text-forest" />
                  <span>المساعد الذكي (AI)</span>
                </button>
              </div>

              {/* Trust Features Bar */}
              <div className="pt-6 grid grid-cols-3 gap-2 sm:gap-4 border-t border-border text-[10px] sm:text-xs text-ink-mute w-full">
                <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right gap-1 sm:gap-2">
                  <ShieldCheck className="w-4 h-4 text-forest shrink-0" />
                  <span className="font-medium">ضمان الموعد والكرسي</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right gap-1 sm:gap-2">
                  <Clock className="w-4 h-4 text-terra shrink-0" />
                  <span className="font-medium">توقيتات 12 ساعة دقيقة</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right gap-1 sm:gap-2">
                  <Crown className="w-4 h-4 text-forest shrink-0" />
                  <span className="font-medium">أجنحة VIP خاصة</span>
                </div>
              </div>
            </div>

            {/* Right Col: Interactive ClinicMind Hero Pass Card with Branch Switcher */}
            <div className="lg:col-span-5">
              <div className="clinic-card p-6 sm:p-8 space-y-5 shadow-clinic-3">
                <div className="flex items-center justify-between border-b border-border-soft pb-4">
                  <div>
                    <span className="text-[11px] font-mono text-terra font-bold uppercase tracking-wider block">
                      FAST RESERVATION PASS
                    </span>
                    <h3 className="font-serif font-bold text-xl text-ink">حجز فوري مباشر</h3>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-forest/10 text-forest text-xs font-mono font-bold border border-forest/20">
                    LIVE SYSTEM
                  </span>
                </div>

                {/* Branch Switcher Selector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-mute text-[11px] font-bold flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-forest" />
                      <span>الفرع المتاح للحجز:</span>
                    </span>
                    <span className="text-forest font-bold text-[11px] font-mono flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
                      <span>مفتوح الآن</span>
                    </span>
                  </div>

                  {/* Branch Toggle Switcher */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-paper-warm/90 rounded-2xl border border-border">
                    {branches.map((branch) => {
                      const isSelected = (selectedHeroBranchId || branches[0]?.id) === branch.id;
                      return (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => {
                            setSelectedHeroBranchId(branch.id);
                            setSelectedBranchId(branch.id);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                            isSelected
                              ? 'bg-forest text-paper shadow-clinic-1'
                              : 'text-ink-soft hover:text-ink hover:bg-white/70'
                          }`}
                        >
                          <span className="truncate w-full text-center">{branch.name.split('-')[0].trim()}</span>
                          <span className={`text-[9px] font-normal ${isSelected ? 'text-paper/80' : 'text-ink-mute'}`}>
                            {branch.name.includes('-') ? branch.name.split('-')[1].trim() : 'صالون VIP'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Selection Details */}
                <div className="space-y-2.5 text-xs">
                  <div className="bg-paper-warm/80 p-3 rounded-2xl border border-border flex items-center justify-between">
                    <div>
                      <p className="text-ink-mute text-[10px]">الخدمة الأكثر طلباً:</p>
                      <p className="font-bold text-ink text-xs sm:text-sm">{activeServices[0]?.name || 'باقات العناية والحلاقة'}</p>
                    </div>
                    <span className="text-terra-deep font-bold text-xs sm:text-sm font-serif">
                      {activeServices[0] ? formatCurrency(activeServices[0].price) : 'حسب الاختيار'}
                    </span>
                  </div>

                  <div className="bg-paper-warm/80 p-3 rounded-2xl border border-border flex items-center justify-between">
                    <div>
                      <p className="text-ink-mute text-[10px]">كابتن الحلاقة الأبرز بالفرع:</p>
                      <p className="font-bold text-ink text-xs sm:text-sm">{branchProminentBarber?.full_name || 'نخبة الحلاقين'}</p>
                    </div>
                    <span className="text-terra font-bold text-xs flex items-center gap-1 font-mono">
                      <Star className="w-3.5 h-3.5 fill-terra" />
                      <span>{branchProminentBarber?.rating || 5.0}</span>
                    </span>
                  </div>
                </div>

                <Link
                  to="/book"
                  onClick={() => setSelectedBranchId(currentHeroBranch?.id || branches[0]?.id)}
                  className="btn-clinic-primary w-full justify-center py-3.5 text-xs tracking-wide"
                >
                  <span>بدء حجز الموعد وتأكيد الكرسي</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>

                <p className="text-[11px] text-center text-ink-mute">
                  أكثر من <strong className="text-forest font-bold">{completedCount} عميل</strong> استمتعوا بتجربة الحلاقة الفاخرة هذا الشهر.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. POPULAR SERVICES GRID */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <span className="text-xs font-mono font-bold text-terra uppercase tracking-wider">
            EXCLUSIVE SERVICES
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-ink">خدمات وباقات النخبة الفاخرة</h2>
          <p className="text-ink-soft text-sm">
            باقات متكاملة تم تصميمها خصيصاً للرجل الباحث عن الراحة والعناية الفائقة بأدق التفاصيل.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {activeServices.map((service) => (
            <div
              key={service.id}
              className="clinic-card p-6 flex flex-col justify-between space-y-4 hover:-translate-y-1 transition-transform"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-paper-warm flex items-center justify-center text-forest border border-border">
                  <Scissors className="w-6 h-6" />
                </div>
                <h3 className="font-serif font-bold text-lg text-ink">{service.name}</h3>
                <p className="text-xs text-ink-mute leading-relaxed line-clamp-3">
                  {service.description || 'حلاقة احترافية وتصفيف مخصص بأرقى المنتجات.'}
                </p>
              </div>

              <div className="pt-4 border-t border-border-soft flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-ink-mute block">المدة: {service.duration_minutes} دقيقة</span>
                  <span className="font-serif font-bold text-lg text-forest">
                    {formatCurrency(service.price)}
                  </span>
                </div>
                <Link
                  to="/book"
                  className="px-3.5 py-1.5 rounded-full bg-forest text-paper text-xs font-bold hover:bg-forest-soft transition-colors"
                >
                  احجز
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. MASTER BARBERS SECTION (ALL Barbers with Branch Affiliation) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <span className="text-xs font-mono font-bold text-forest uppercase tracking-wider">
            MASTER BARBERS
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl text-ink">نخبة كباتن الحلاقة</h2>
          <p className="text-ink-soft text-sm">
            خبراء ومصففون محترفون بخبرات عالمية في أحدث تقنيات القص والعناية موزعين على كافة فروعنا الفاخرة.
          </p>
        </div>

        {/* Branch Filter Selector Bar */}
        <div className="flex items-center justify-center gap-2 flex-wrap pb-2">
          <button
            type="button"
            onClick={() => setSelectedBarberBranchFilter('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
              selectedBarberBranchFilter === 'all'
                ? 'bg-forest text-paper border-forest shadow-clinic-1'
                : 'bg-white/80 text-ink-soft border-border hover:bg-paper-warm'
            }`}
          >
            جميع الفروع ({allActiveBarbers.length})
          </button>
          {branches.map((branch) => {
            const count = allActiveBarbers.filter((b) => b.branch_id === branch.id || !b.branch_id).length;
            const isSelected = selectedBarberBranchFilter === branch.id;
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => setSelectedBarberBranchFilter(branch.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-forest text-paper border-forest shadow-clinic-1'
                    : 'bg-white/80 text-ink-soft border-border hover:bg-paper-warm'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-terra" />
                <span>{branch.name}</span>
                <span className="opacity-75 font-mono text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Grid of ALL Barbers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBarbers.map((barber) => {
            const barberBranch = branches.find((b) => b.id === barber.branch_id) || branches[0];
            return (
              <div
                key={barber.id}
                className="clinic-card p-6 flex flex-col justify-between space-y-4 hover:-translate-y-1 transition-transform bg-white/95"
              >
                <div className="flex items-start gap-4">
                  {barber.photo_url ? (
                    <img
                      key={`${barber.id}-${barber.photo_url}`}
                      src={barber.photo_url}
                      alt={barber.full_name}
                      className="w-16 h-16 rounded-2xl object-cover border border-border shadow-clinic-1 shrink-0 bg-paper-warm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-forest/10 border border-forest/20 text-forest flex items-center justify-center font-serif text-xl font-bold shrink-0 shadow-xs">
                      {barber.full_name.trim().charAt(0)}
                    </div>
                  )}
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="font-serif font-bold text-base text-ink truncate">{barber.full_name}</h4>
                    <p className="text-xs text-forest font-semibold truncate">{barber.specialty}</p>
                    <div className="flex items-center gap-1 text-xs text-terra font-bold">
                      <Star className="w-3.5 h-3.5 fill-terra" />
                      <span>{barber.rating || 4.9}</span>
                      <span className="text-ink-mute font-normal">({barber.rating_count || 0} تقييم)</span>
                    </div>
                  </div>
                </div>

                {/* Branch affiliation and Book Action Button */}
                <div className="pt-3 border-t border-border-soft flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-forest font-bold bg-forest/10 px-2.5 py-1 rounded-full border border-forest/20 truncate">
                    <Building2 className="w-3 h-3 text-forest shrink-0" />
                    <span className="truncate">{barberBranch?.name || 'فرع الصالون'}</span>
                  </div>

                  <Link
                    to="/book"
                    onClick={() => {
                      if (barber.branch_id) setSelectedBranchId(barber.branch_id);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-forest text-paper text-xs font-bold hover:bg-forest-soft transition-colors shrink-0 flex items-center gap-1"
                  >
                    <span>احجز مع الكابتن</span>
                    <ArrowLeft className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. SALON CAFE & REFRESHMENTS (Conditional: Only appears when products/drinks exist in store) */}
      {activeProducts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="text-xs font-mono font-bold text-terra uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Coffee className="w-4 h-4" />
              <span>SALON CAFE & REFRESHMENTS</span>
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl text-ink">ركن الكافيه والضيافة الفاخرة</h2>
            <p className="text-ink-soft text-sm">
              استمتع بتشكيلة مختارة من المشروبات الساخنة والعصائر الطبيعية المنعشة ومنتجات العناية أثناء زيارتك وجلستك.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {activeProducts.map((product) => (
              <div
                key={product.id}
                className="clinic-card p-6 flex flex-col justify-between space-y-4 hover:-translate-y-1 transition-transform bg-white/95 border border-border"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-paper-warm flex items-center justify-center text-forest border border-border shadow-xs">
                      {product.category === 'hot_drink' ? (
                        <Coffee className="w-6 h-6" />
                      ) : product.category === 'cold_drink' ? (
                        <Sparkles className="w-6 h-6 text-terra" />
                      ) : (
                        <Crown className="w-6 h-6 text-[#b45309]" />
                      )}
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-paper-warm border border-border text-ink-soft">
                      {product.category === 'hot_drink'
                        ? 'مشروبات ساخنة ☕'
                        : product.category === 'cold_drink'
                        ? 'عصائر ومشروبات 🥤'
                        : product.category === 'care_product'
                        ? 'عناية وزيوت 💈'
                        : 'ضيافة خاصة ✨'}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-serif font-bold text-lg text-ink">{product.name}</h3>
                    {product.description && (
                      <p className="text-xs text-ink-mute leading-relaxed line-clamp-2 mt-1">
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-border-soft flex items-center justify-between">
                  <span className="font-serif font-bold text-lg text-forest">
                    {formatCurrency(product.price)}
                  </span>
                  <Link
                    to="/book"
                    className="px-3.5 py-1.5 rounded-full bg-forest text-paper text-xs font-bold hover:bg-forest-soft transition-colors"
                  >
                    طلب مع الحجز
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. LUXURY VIP LOUNGE EXPERIENCE (Clean Hospitality Banner) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-forest rounded-clinic-lg p-8 sm:p-12 text-paper relative overflow-hidden shadow-clinic-3">
          <div className="absolute top-0 right-0 w-96 h-96 bg-terra/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-2xl space-y-6">
            <span className="text-xs font-mono font-bold text-terra-soft uppercase tracking-wider">
              EXCLUSIVE HOSPITALITY & RELAXATION
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl text-paper leading-tight">
              تجربة ضيافة ملكية مع لاونج VIP وكافيه فاخر
            </h2>
            <p className="text-paper/80 text-sm leading-relaxed">
              استمتع بأجواء استرخاء فريدة مع فنجان قهوتك المختصة أو مشروبك المفضل من كافيه الصالون، 
              مع نظام حجز رقمي يضمن دخولك مباشرة لكرسي الحلاقة بدون أي انتظار.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <Link to="/book" className="btn-clinic-terra text-sm">
                <span>احجز موعدك وجناحك الملكي</span>
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setAiDrawerOpen(true)}
                className="btn-clinic-ghost text-sm bg-white text-forest"
              >
                <Sparkles className="w-4 h-4 text-forest" />
                <span>استشر المساعد الذكي</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
