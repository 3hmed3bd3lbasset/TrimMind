import React, { useState, useMemo } from 'react';
import { useSalonStore } from '../lib/store';
import { Barber } from '../types';
import {
  Scissors,
  User,
  Clock,
  Crown,
  Sparkles,
  Phone,
  CheckCircle2,
  Plus,
  Edit2,
  Coffee,
  Volume2,
  Calendar,
  AlertCircle,
  X,
  Building2,
  Star,
} from 'lucide-react';
import { formatCurrency, format12Hour, formatTime } from '../lib/utils';
import toast from 'react-hot-toast';

export default function BarberDashboard() {
  const {
    currentUser,
    barbers,
    branches,
    chairs,
    bookings,
    services,
    products,
    queue,
    callNextClientForBarber,
    transitionBookingStatus,
    updateBookingDetails,
  } = useSalonStore();

  const isManager = currentUser?.role === 'manager';

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return currentUser?.branch_id || branches[0]?.id || '';
  });

  const branchBarbers = useMemo(() => {
    return barbers.filter(
      (b: Barber) => b.is_active && (b.branch_id === selectedBranchId || !b.branch_id)
    );
  }, [barbers, selectedBranchId]);

  const [selectedBarberId, setSelectedBarberId] = useState<string>(() => {
    return currentUser?.barber_id || branchBarbers[0]?.id || barbers[0]?.id || '';
  });

  // Auto sync when branch changes
  React.useEffect(() => {
    if (branchBarbers.length > 0 && !branchBarbers.some((b: Barber) => b.id === selectedBarberId)) {
      setSelectedBarberId(branchBarbers[0].id);
    }
  }, [selectedBranchId, branchBarbers, selectedBarberId]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAddServices, setSelectedAddServices] = useState<string[]>([]);
  const [selectedAddProducts, setSelectedAddProducts] = useState<{ [id: string]: number }>({});
  const [barberNote, setBarberNote] = useState('');

  // Current active barber entity
  const currentBarber =
    barbers.find((b) => b.id === selectedBarberId) ||
    branchBarbers[0] ||
    barbers[0] ||
    null;

  const currentBranch =
    branches.find((b) => b.id === (currentBarber?.branch_id || selectedBranchId)) ||
    branches[0];

  const barberChair = chairs.find(
    (c) => c.barber_id === currentBarber?.id || c.branch_id === currentBranch?.id
  );

  // Active booking on chair
  const activeBooking = bookings.find(
    (b) =>
      b.status === 'in_service' &&
      (b.barber_id === currentBarber?.id || b.chair_id === barberChair?.id)
  );

  // Upcoming clients for this barber sorted strictly by queue number (excluding cancelled)
  const barberUpcomingBookings = bookings
    .filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'customer_arrived') &&
        (b.barber_id === currentBarber?.id || (!b.barber_id && b.branch_id === currentBranch?.id))
    )
    .sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));

  const handleCallNext = () => {
    if (activeBooking) {
      toast.error('يوجد عميل حالياً على الكرسي. يرجى إنهاء الخدمة أولاً قبل استدعاء العميل القادم.');
      return;
    }
    if (barberUpcomingBookings.length === 0) {
      toast.error('لا يوجد عملاء بانتظار دورهم حالياً في هذا الفرع.');
      return;
    }
    callNextClientForBarber(currentBarber?.id || '');
    toast.success('تم استدعاء العميل وتحديث شاشة الانتظار فوراً');
  };

  const handleFinishService = () => {
    if (!activeBooking) return;
    transitionBookingStatus(activeBooking.id, 'completed', `تم إنهاء الحلاقة بواسطة كابتن ${currentBarber?.full_name}`);
    toast.success('تم إنهاء الحلاقة بنجاح وأصبح الكرسي متاحاً للعميل التالي');
  };

  const openEditServicesModal = () => {
    if (!activeBooking) return;
    setSelectedAddServices(activeBooking.additional_service_ids || []);
    setSelectedAddProducts({});
    setBarberNote('');
    setIsEditModalOpen(true);
  };

  const handleSaveModifiedBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBooking) return;

    const addedProds = Object.entries(selectedAddProducts)
      .filter(([_, qty]) => qty > 0)
      .map(([pId, qty]) => ({ productId: pId, quantity: qty }));

    updateBookingDetails(
      activeBooking.id,
      {
        additionalServiceIds: selectedAddServices,
        addedProducts: addedProds,
      },
      barberNote || `إضافة خدمات وعناية بواسطة كابتن ${currentBarber?.full_name}`
    );

    toast.success('تم تعديل وتحديث تفاصيل الفاتورة والخدمات فوراً عند الاستقبال والمدير');
    setIsEditModalOpen(false);
  };

  const primaryService = services.find((s) => s.id === activeBooking?.service_id);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans text-ink">
      {/* Branch & Barber Switcher Control Bar for Managers & Admins */}
      {(isManager || branches.length > 1 || branchBarbers.length > 1) && (
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-border shadow-clinic-1 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-forest/10 text-forest flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5 text-forest" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-ink text-sm">مراقب كباتن وصالات الفروع</h3>
                <p className="text-[11px] text-ink-mute">
                  اختر الفرع ثم الكابتن لمتابعة كرسيه وطابور عملائه واستدعاء الأدوار
                </p>
              </div>
            </div>

            {/* Branch Dropdown */}
            {branches.length > 1 && (
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-bold text-ink-soft flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-forest" />
                  <span>الفرع:</span>
                </span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-paper-warm border border-border text-xs font-bold text-ink cursor-pointer outline-none focus:border-forest"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Barber Selection Pills for this Branch */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-ink-soft flex items-center gap-1">
                <Scissors className="w-3.5 h-3.5 text-forest" />
                <span>كباتن الحلاقة في ({currentBranch?.name}):</span>
              </span>
              <span className="text-[10px] text-ink-mute font-mono">
                {branchBarbers.length} كباتن مسجلين
              </span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {branchBarbers.map((b: Barber) => {
                const isSelected = b.id === currentBarber?.id;
                const barberCh = chairs.find((c) => c.barber_id === b.id);
                const hasActive = bookings.some(
                  (bk) => bk.status === 'in_service' && bk.barber_id === b.id
                );

                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBarberId(b.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-bold transition-all shrink-0 ${
                      isSelected
                        ? 'bg-forest text-paper border-forest shadow-clinic-1 scale-[1.02]'
                        : 'bg-paper-warm hover:bg-white text-ink border-border'
                    }`}
                  >
                    <img
                      src={
                        b.photo_url ||
                        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
                      }
                      alt={b.full_name}
                      className="w-6 h-6 rounded-lg object-cover border border-white/20"
                    />
                    <span>{b.full_name}</span>
                    {hasActive && (
                      <span
                        className="w-2 h-2 rounded-full bg-terra animate-pulse"
                        title="مشغول بحلاقة حالياً"
                      />
                    )}
                    {barberCh && (
                      <span
                        className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono ${
                          isSelected ? 'bg-white/20 text-paper' : 'bg-forest/10 text-forest'
                        }`}
                      >
                        {barberCh.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 1. TOP BARBER HERO CARD */}
      <div className="bg-forest text-paper rounded-clinic-lg p-6 sm:p-8 shadow-clinic-3 flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-4 z-10">
          <img
            src={
              currentBarber?.photo_url ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80'
            }
            alt={currentBarber?.full_name || 'Barber'}
            className="w-20 h-20 rounded-2xl object-cover border-2 border-paper/40 shadow-clinic-2 shrink-0"
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-0.5 rounded-full bg-paper/20 text-paper text-xs font-bold flex items-center gap-1">
                <Scissors className="w-3 h-3" /> كابتن الحلاقة
              </span>
              <span className="text-terra-soft font-bold text-xs flex items-center gap-1 font-mono">
                <Star className="w-3.5 h-3.5 fill-terra-soft" />
                <span>{currentBarber?.rating || 4.9}</span>
              </span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-paper">
              {currentBarber?.full_name || currentUser.full_name}
            </h1>
            <p className="text-xs text-paper/80 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-terra-soft" />
              <span>{currentBranch?.name}</span> • <span>{barberChair?.name || 'الكرسي المخصص'}</span>
            </p>
          </div>
        </div>

        {/* Big Call Next Action Button */}
        <div className="z-10 flex flex-col sm:flex-row gap-3">
          <button onClick={handleCallNext} className="btn-clinic-terra text-sm font-bold shadow-clinic-1">
            <Volume2 className="w-5 h-5 animate-pulse" />
            <span>استدعاء العميل القادم</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: ACTIVE CLIENT ON CHAIR (7 COLS) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-bold text-ink text-lg flex items-center gap-2">
              <Scissors className="w-5 h-5 text-forest" />
              <span>العميل الحالي على الكرسي</span>
            </h3>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                activeBooking
                  ? 'bg-terra/15 text-terra-deep border border-terra/30 animate-pulse'
                  : 'bg-forest/15 text-forest border border-forest/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeBooking ? 'bg-terra' : 'bg-ok'}`} />
              <span>{activeBooking ? 'قيد الحلاقة والخدمة' : 'الكرسي متاح'}</span>
            </span>
          </div>

          {activeBooking ? (
            <div className="clinic-card p-6 shadow-clinic-2 space-y-6 bg-white/90">
              {/* Client Info Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-serif text-xl font-bold text-ink">{activeBooking.customer_name}</h4>
                    {activeBooking.booking_type === 'vip' && (
                      <span className="px-2.5 py-0.5 rounded-full bg-terra text-paper text-[10px] font-bold flex items-center gap-1">
                        <Crown className="w-2.5 h-2.5" /> VIP
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-mute font-mono mt-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-forest" />
                    <span>{activeBooking.customer_phone}</span>
                  </p>
                </div>

                <div className="text-left font-mono">
                  <span className="text-xs bg-paper-warm px-3 py-1 rounded-full text-ink font-bold border border-border">
                    الحجز: <strong className="text-forest">{activeBooking.id}</strong>
                  </span>
                </div>
              </div>

              {/* Active Services & Items */}
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between bg-paper-warm p-3.5 rounded-2xl border border-border">
                  <div>
                    <p className="text-ink-mute">الخدمة الأساسية:</p>
                    <p className="font-serif font-bold text-ink text-sm">{primaryService?.name}</p>
                  </div>
                  <span className="font-serif font-bold text-forest text-base">
                    {formatCurrency(primaryService?.price || 180)}
                  </span>
                </div>

                {/* Additional Services */}
                {activeBooking.additional_service_ids && activeBooking.additional_service_ids.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-ink-mute font-bold">خدمات إضافية أثناء الجلسة:</p>
                    {activeBooking.additional_service_ids.map((id) => {
                      const addSrv = services.find((s) => s.id === id);
                      return (
                        <div
                          key={id}
                          className="bg-white p-2.5 rounded-xl border border-border flex justify-between"
                        >
                          <span className="text-ink-soft">{addSrv?.name}</span>
                          <span className="text-forest font-bold">{formatCurrency(addSrv?.price || 0)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Cafe & Care Items */}
                {activeBooking.items && activeBooking.items.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-ink-mute font-bold">طلبات الكافيه ومنتجات العناية:</p>
                    {activeBooking.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-xl border border-border flex justify-between"
                      >
                        <span className="text-ink-soft">
                          {item.name} × {item.quantity}
                        </span>
                        <span className="text-forest font-bold">
                          {formatCurrency(item.price_at_booking * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Last Modified By Banner */}
                {activeBooking.last_modified_by && (
                  <div className="p-3 bg-forest/10 border border-forest/20 rounded-xl text-[11px] text-forest flex items-center gap-2 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>
                      {activeBooking.last_modified_by.note ||
                        `تم تعديل الفاتورة بواسطة ${activeBooking.last_modified_by.actor_name}`}
                    </span>
                  </div>
                )}

                {/* Total Invoice Live Snapshot */}
                <div className="border-t border-border pt-3 flex items-center justify-between text-sm">
                  <span className="font-bold text-ink-soft">إجمالي الفاتورة الحالي:</span>
                  <span className="text-xl font-serif font-bold text-forest">
                    {formatCurrency(activeBooking.total_at_booking)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button onClick={openEditServicesModal} className="btn-clinic-ghost text-xs py-3">
                  <Edit2 className="w-4 h-4" />
                  <span>تعديل / إضافة خدمات للعميل</span>
                </button>

                <button onClick={handleFinishService} className="btn-clinic-primary text-xs py-3">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>إنهاء الحلاقة وإخلاء الكرسي</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="clinic-card p-12 text-center text-ink-mute space-y-4 border-dashed">
              <Scissors className="w-14 h-14 text-forest mx-auto opacity-70" />
              <h4 className="font-serif text-lg font-bold text-ink">الكرسي متاح وجاهز لاستقبال العميل التالي</h4>
              <p className="text-xs max-w-sm mx-auto">
                اضغط على زر "استدعاء العميل القادم" بالأعلى لمناداة العميل وتحديث شاشة الانتظار الحية بالصالون.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: UPCOMING QUEUE (5 COLS) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-serif font-bold text-ink text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-forest" />
              <span>العملاء بانتظار دورهم</span>
            </h3>
            <span className="px-3 py-1 rounded-full bg-paper-warm border border-border text-forest font-bold text-xs font-mono">
              {barberUpcomingBookings.length} في الانتظار
            </span>
          </div>

          <div className="clinic-card p-4 space-y-3 min-h-[400px]">
            {barberUpcomingBookings.length > 0 ? (
              barberUpcomingBookings.map((b, idx) => {
                const srv = services.find((s) => s.id === b.service_id);
                return (
                  <div
                    key={b.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                      idx === 0
                        ? 'bg-paper-warm border-forest/40 shadow-clinic-1'
                        : 'bg-white/70 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl font-mono font-bold flex items-center justify-center text-xs shadow-xs ${
                          idx === 0
                            ? 'bg-forest text-paper'
                            : 'bg-paper-deep text-ink-soft'
                        }`}
                      >
                        #{b.queue_number || (idx + 1)}
                      </div>

                      <div>
                        <h4 className="font-serif font-bold text-ink text-xs">{b.customer_name}</h4>
                        <p className="text-[11px] text-ink-mute mt-0.5">{srv?.name}</p>
                        <p className="text-[10px] text-forest font-semibold">
                          الموعد: {format12Hour(b.starts_at)}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (activeBooking) {
                          toast.error('أنهِ الجلسة الحالية أولاً قبل تسكين عميل جديد.');
                          return;
                        }
                        transitionBookingStatus(b.id, 'in_service', `استدعاء بواسطة كابتن ${currentBarber?.full_name}`);
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-forest text-paper text-xs font-bold hover:bg-forest-soft transition-colors"
                    >
                      استدعاء
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="py-16 text-center text-ink-mute space-y-2">
                <CheckCircle2 className="w-10 h-10 text-forest mx-auto" />
                <p className="font-serif text-sm font-bold text-ink">لا توجد حجوزات منتظرة حالياً</p>
                <p className="text-xs">كل الحجوزات مكتملة أو تم تسكينها.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. MODAL: EDIT SERVICES & PRODUCTS */}
      {isEditModalOpen && activeBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm">
          <div className="clinic-card w-full max-w-lg p-6 shadow-clinic-3 space-y-5 text-xs bg-white">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-serif font-bold text-ink text-base">تعديل الخدمات وإضافة باقات للعميل</h3>
                <p className="text-ink-mute text-[11px]">
                  العميل: <strong className="text-ink">{activeBooking.customer_name}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 rounded-xl text-ink-mute hover:text-ink bg-paper-warm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModifiedBooking} className="space-y-4">
              {/* Additional Services Selection */}
              <div className="space-y-2">
                <label className="text-ink-soft font-bold">إضافة خدمات حلاقة وعناية إضافية:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {services
                    .filter((s) => s.id !== activeBooking.service_id && s.is_active)
                    .map((srv) => {
                      const isChecked = selectedAddServices.includes(srv.id);
                      return (
                        <label
                          key={srv.id}
                          className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-paper-warm border-forest text-ink'
                              : 'bg-white border-border text-ink-soft hover:bg-paper-warm'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAddServices([...selectedAddServices, srv.id]);
                                } else {
                                  setSelectedAddServices(
                                    selectedAddServices.filter((id) => id !== srv.id)
                                  );
                                }
                              }}
                              className="accent-forest rounded"
                            />
                            <span className="font-medium text-[11px]">{srv.name}</span>
                          </div>
                          <span className="text-forest font-bold text-[11px]">
                            {formatCurrency(srv.price)}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Cafe & Care Products Selection */}
              <div className="space-y-2">
                <label className="text-ink-soft font-bold">إضافة مشروبات كافيه أو منتجات عناية:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                  {products.map((prod) => {
                    const qty = selectedAddProducts[prod.id] || 0;
                    return (
                      <div
                        key={prod.id}
                        className="bg-paper-warm/70 p-2.5 rounded-xl border border-border flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-serif font-bold text-ink text-[11px] truncate">{prod.name}</p>
                          <p className="text-forest font-bold text-[10px]">
                            {formatCurrency(prod.price)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAddProducts({
                                ...selectedAddProducts,
                                [prod.id]: Math.max(0, qty - 1),
                              });
                            }}
                            className="text-ink-mute hover:text-ink font-bold px-1"
                          >
                            -
                          </button>
                          <span className="font-mono text-ink font-bold text-xs">{qty}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAddProducts({
                                ...selectedAddProducts,
                                [prod.id]: qty + 1,
                              });
                            }}
                            className="text-forest hover:text-forest-soft font-bold px-1"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Note input */}
              <div className="space-y-1">
                <label className="text-ink-soft font-bold">ملاحظة الكابتن (تظهر في الفاتورة):</label>
                <input
                  type="text"
                  value={barberNote}
                  onChange={(e) => setBarberNote(e.target.value)}
                  placeholder="مثال: تم عمل ماسك ذهب إضافي بطلب العميل..."
                  className="w-full bg-white border border-border rounded-xl p-2.5 text-ink outline-none focus:border-forest"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-clinic-primary flex-1 py-3 text-xs">
                  حفظ وتحديث الفاتورة فوراً
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
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
}
