import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSalonStore } from '../lib/store';
import { ChairGrid } from '../components/receptionist/ChairGrid';
import { QueueList } from '../components/receptionist/QueueList';
import { BookingsTable } from '../components/receptionist/BookingsTable';
import { BookingRevenuesManager } from '../components/manager/BookingRevenuesManager';
import { WalkInModal } from '../components/receptionist/WalkInModal';
import { PaymentProofModal } from '../components/receptionist/PaymentProofModal';
import { NotificationBell } from '../components/common/NotificationBell';
import { Chair, Booking } from '../types';
import {
  UserCheck,
  Building2,
  UserPlus,
  Armchair,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Receipt,
  Tv,
  DollarSign,
  X,
  ExternalLink,
  Search,
  ChevronLeft,
  Eye,
  Crown,
  Phone,
  User,
  Check,
  RotateCcw,
} from 'lucide-react';
import { formatCurrency, format12Hour, formatDateTime } from '../lib/utils';
import toast from 'react-hot-toast';

type KpiModalType = 'in_service_chairs' | 'pending_receipts' | 'branch_queue' | 'branch_bookings' | null;

export default function ReceptionistDashboard() {
  const {
    branches,
    selectedBranchId,
    setSelectedBranchId,
    chairs,
    barbers,
    services,
    bookings,
    queue,
    currentUser,
    callNextClientForBarber,
    transitionBookingStatus,
    updateChair,
  } = useSalonStore();

  const [activeTab, setActiveTab] = useState<'chairs' | 'bookings' | 'revenues'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('receptionist_active_tab');
      if (saved === 'chairs' || saved === 'bookings' || saved === 'revenues') return saved;
    }
    return 'chairs';
  });

  const [activeKpiModal, setActiveKpiModal] = useState<KpiModalType>(null);
  const [kpiSearchQuery, setKpiSearchQuery] = useState('');
  const [kpiBookingFilter, setKpiBookingFilter] = useState<string>('all');
  const [selectedProofBooking, setSelectedProofBooking] = useState<Booking | null>(null);

  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [selectedChairForWalkIn, setSelectedChairForWalkIn] = useState<Chair | null>(null);

  React.useEffect(() => {
    try {
      sessionStorage.setItem('receptionist_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  // Strict branch isolation
  const isManager = currentUser.role === 'manager';
  
  const receptionistBranchId =
    currentUser.branch_id || selectedBranchId || branches[0]?.id || '';

  const branchId = isManager ? selectedBranchId : receptionistBranchId;

  const currentBranch =
    branches.find((b) => b.id === branchId) || branches[0] || null;

  // Branch scoped stats (Isolated from other branches)
  const branchBookings = bookings.filter((b) => b.branch_id === branchId);
  const branchChairs = chairs.filter((c) => c.branch_id === branchId);
  const inServiceChairsList = branchChairs.filter((c) => c.status === 'in_service' || c.current_booking_id);
  const inServiceCount = inServiceChairsList.length;
  
  const pendingReviewBookings = branchBookings.filter((b) => b.status === 'pending_review');
  const pendingReviewCount = pendingReviewBookings.length;

  const branchQueueList = queue.filter((q) => q.branch_id === branchId);
  const branchQueueCount = branchQueueList.length;

  const handleSelectChairForWalkIn = (chair: Chair) => {
    setSelectedChairForWalkIn(chair);
    setIsWalkInModalOpen(true);
  };

  const handleFinishChairService = (chair: Chair, bookingId?: string) => {
    if (bookingId) {
      transitionBookingStatus(bookingId, 'completed', 'تم إنهاء الحلاقة بنجاح من شاشة الكراسي');
    }
    updateChair(chair.id, { status: 'cleaning', current_booking_id: undefined });
    toast.success(`تم إنهاء الخدمة على ${chair.name} وتحويله للتنظيف`);
  };

  // Filtered list for Branch All Bookings modal
  const filteredModalBookings = branchBookings.filter((b) => {
    if (kpiBookingFilter !== 'all' && b.status !== kpiBookingFilter) return false;
    if (kpiSearchQuery.trim()) {
      const q = kpiSearchQuery.toLowerCase();
      const matchName = b.customer_name.toLowerCase().includes(q);
      const matchPhone = b.customer_phone.includes(q);
      const matchId = b.id.toLowerCase().includes(q);
      return matchName || matchPhone || matchId;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans text-ink">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-forest text-paper flex items-center justify-center font-serif text-xl font-bold shadow-clinic-1 shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-xl font-bold text-ink">
                مكتب الاستقبال وإدارة الصالة (Front Desk)
              </h1>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-forest text-paper font-mono">
                {currentBranch?.name || 'الفرع المختار'}
              </span>
            </div>
            <p className="text-xs text-ink-mute mt-0.5">
              الموظف المسؤول: <strong className="text-ink">{currentUser.full_name}</strong>
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Branch Switcher (Only Manager can switch; Receptionist is locked to own branch) */}
          {isManager && branches.length > 1 && (
            <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full border border-border text-xs shadow-xs">
              <Building2 className="w-4 h-4 text-terra mr-1" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent text-ink font-bold outline-none cursor-pointer text-xs"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Link to="/display" target="_blank" rel="noopener noreferrer" className="btn-clinic-ghost text-xs font-bold">
            <Tv className="w-4 h-4 text-terra" />
            <span>شاشة الصالون (TV)</span>
          </Link>

          {/* Notification Bell */}
          <NotificationBell
            onSelectBooking={(bookingId) => {
              const b = bookings.find((bk) => bk.id === bookingId);
              if (b) {
                if (b.status === 'pending_review' && b.payment_proof) {
                  setSelectedProofBooking(b);
                } else {
                  setActiveTab('bookings');
                }
              }
            }}
          />

          <button
            onClick={() => {
              setSelectedChairForWalkIn(null);
              setIsWalkInModalOpen(true);
            }}
            className="btn-clinic-primary text-xs font-bold shadow-clinic-1"
          >
            <UserPlus className="w-4 h-4" />
            <span>عميل مباشر (Walk-in)</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Row (Interactive Clickable Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        {/* 1. In-service chairs card */}
        <div
          onClick={() => setActiveKpiModal('in_service_chairs')}
          className="clinic-card p-4 space-y-1 bg-white hover:bg-paper-warm/60 border border-border hover:border-forest/50 hover:shadow-clinic-2 cursor-pointer transition-all duration-200 group relative"
          title="اضغط لعرض تفاصيل الكراسي في الخدمة"
        >
          <div className="flex items-center justify-between">
            <p className="text-ink-mute font-bold text-[11px] group-hover:text-forest transition-colors">
              كراسي في الخدمة الآن
            </p>
            <Eye className="w-3.5 h-3.5 text-ink-mute group-hover:text-forest opacity-0 group-hover:opacity-100 transition-all" />
          </div>
          <p className="font-serif text-2xl font-bold text-forest">{inServiceCount} كراسي</p>
          <span className="text-[10px] text-ink-mute flex items-center gap-1 mt-1">
            <span>انقر لعرض التفاصيل</span>
            <ChevronLeft className="w-3 h-3 text-forest" />
          </span>
        </div>

        {/* 2. Pending receipts review card */}
        <div
          onClick={() => setActiveKpiModal('pending_receipts')}
          className={`clinic-card p-4 space-y-1 bg-white hover:bg-paper-warm/60 border hover:shadow-clinic-2 cursor-pointer transition-all duration-200 group relative ${
            pendingReviewCount > 0
              ? 'border-terra/40 bg-terra/5 ring-1 ring-terra/20'
              : 'border-border hover:border-terra/50'
          }`}
          title="اضغط لعرض ومراجعة إيصالات الحجز"
        >
          <div className="flex items-center justify-between">
            <p className="text-ink-mute font-bold text-[11px] group-hover:text-terra-deep transition-colors">
              إيصالات بانتظار المراجعة
            </p>
            <Receipt className="w-3.5 h-3.5 text-terra" />
          </div>
          <p className="font-serif text-2xl font-bold text-terra-deep">{pendingReviewCount} إيصالات</p>
          <span className="text-[10px] text-ink-mute flex items-center gap-1 mt-1">
            <span>انقر للمراجعة والاعتماد</span>
            <ChevronLeft className="w-3 h-3 text-terra" />
          </span>
        </div>

        {/* 3. Branch waiting queue card */}
        <div
          onClick={() => setActiveKpiModal('branch_queue')}
          className="clinic-card p-4 space-y-1 bg-white hover:bg-paper-warm/60 border border-border hover:border-forest/50 hover:shadow-clinic-2 cursor-pointer transition-all duration-200 group relative"
          title="اضغط لعرض طابور الانتظار"
        >
          <div className="flex items-center justify-between">
            <p className="text-ink-mute font-bold text-[11px] group-hover:text-forest transition-colors">
              طابور الانتظار بالفرع
            </p>
            <Clock className="w-3.5 h-3.5 text-forest" />
          </div>
          <p className="font-serif text-2xl font-bold text-forest">{branchQueueCount} عملاء</p>
          <span className="text-[10px] text-ink-mute flex items-center gap-1 mt-1">
            <span>انقر لعرض الطابور</span>
            <ChevronLeft className="w-3 h-3 text-forest" />
          </span>
        </div>

        {/* 4. Total branch bookings card */}
        <div
          onClick={() => setActiveKpiModal('branch_bookings')}
          className="clinic-card p-4 space-y-1 bg-white hover:bg-paper-warm/60 border border-border hover:border-ink/40 hover:shadow-clinic-2 cursor-pointer transition-all duration-200 group relative"
          title="اضغط لعرض جدول حجوزات الفرع"
        >
          <div className="flex items-center justify-between">
            <p className="text-ink-mute font-bold text-[11px] group-hover:text-ink transition-colors">
              إجمالي حجوزات هذا الفرع
            </p>
            <Calendar className="w-3.5 h-3.5 text-ink-soft" />
          </div>
          <p className="font-serif text-2xl font-bold text-ink">{branchBookings.length} حجز</p>
          <span className="text-[10px] text-ink-mute flex items-center gap-1 mt-1">
            <span>انقر لعرض كل الحجوزات</span>
            <ChevronLeft className="w-3 h-3 text-ink" />
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setActiveTab('chairs')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold transition-all ${
            activeTab === 'chairs'
              ? 'bg-forest text-paper shadow-clinic-1'
              : 'bg-white/70 border border-border text-ink-soft hover:text-ink hover:bg-paper-warm'
          }`}
        >
          <Armchair className="w-4 h-4" />
          <span>مراقب الكراسي وقائمة الانتظار</span>
        </button>

        <button
          onClick={() => setActiveTab('bookings')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold transition-all ${
            activeTab === 'bookings'
              ? 'bg-forest text-paper shadow-clinic-1'
              : 'bg-white/70 border border-border text-ink-soft hover:text-ink hover:bg-paper-warm'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>جدول الحجوزات ومراجعة الإيصالات ({branchBookings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('revenues')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold transition-all ${
            activeTab === 'revenues'
              ? 'bg-forest text-paper shadow-clinic-1'
              : 'bg-white/70 border border-border text-ink-soft hover:text-ink hover:bg-paper-warm'
          }`}
        >
          <DollarSign className="w-4 h-4 text-terra-soft" />
          <span>إيرادات ومقبوضات الحجوزات</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'chairs' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <ChairGrid branchId={branchId} onSelectChair={handleSelectChairForWalkIn} />
          </div>

          <div className="lg:col-span-4">
            <QueueList branchId={branchId} />
          </div>
        </div>
      ) : activeTab === 'bookings' ? (
        <BookingsTable branchId={branchId} />
      ) : (
        <div className="clinic-card p-4 sm:p-6 bg-white/95 shadow-clinic-2">
          <BookingRevenuesManager />
        </div>
      )}

      {/* Walk-in Modal */}
      <WalkInModal
        branchId={branchId}
        isOpen={isWalkInModalOpen}
        preSelectedChair={selectedChairForWalkIn}
        onClose={() => setIsWalkInModalOpen(false)}
      />

      {/* Payment Proof Modal for reviewing payments */}
      <PaymentProofModal
        booking={selectedProofBooking}
        isOpen={!!selectedProofBooking}
        onClose={() => setSelectedProofBooking(null)}
      />

      {/* ========================================================================= */}
      {/* 1. MODAL: IN-SERVICE CHAIRS DETAILS (كراسي في الخدمة الآن) */}
      {/* ========================================================================= */}
      {activeKpiModal === 'in_service_chairs' && (
        <div className="modal-overlay">
          <div className="modal-container max-w-2xl p-6 space-y-5 text-right">
            <div className="flex items-center justify-between border-b border-border pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-forest/15 text-forest border border-forest/20 flex items-center justify-center font-bold">
                  <Armchair className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-base">
                    الكراسي قيد الخدمة الحالية ({inServiceCount} كراسي)
                  </h3>
                  <p className="text-[11px] text-ink-mute">
                    الفرع: {currentBranch?.name} • العملاء المتواجدون حالياً على الكراسي
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-xl bg-paper-warm text-ink-mute hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inServiceChairsList.length === 0 ? (
              <div className="py-12 text-center space-y-3 bg-paper-warm/50 rounded-2xl border border-border">
                <div className="w-12 h-12 rounded-full bg-forest/10 text-forest mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="font-serif font-bold text-ink text-sm">
                  لا توجد كراسي في الخدمة حالياً
                </p>
                <p className="text-xs text-ink-mute">
                  جميع كراسي الفرع شاغرة ومتاحة لاستقبال عملاء جدد
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inServiceChairsList.map((chair) => {
                  const barber = barbers.find((b) => b.id === chair.barber_id);
                  const currentBooking = bookings.find(
                    (b) =>
                      b.id === chair.current_booking_id ||
                      (b.chair_id === chair.id && b.status === 'in_service')
                  );
                  const primaryService = services.find((s) => s.id === currentBooking?.service_id);

                  return (
                    <div
                      key={chair.id}
                      className="p-4 rounded-2xl border border-terra/30 bg-paper-warm/40 space-y-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between border-b border-border/70 pb-2">
                        <div>
                          <h4 className="font-serif font-bold text-ink text-sm">{chair.name}</h4>
                          <p className="text-[11px] text-ink-mute">{barber?.full_name || 'بدون كابتن'}</p>
                        </div>
                        {chair.mode === 'vip' && (
                          <span className="px-2 py-0.5 rounded-full bg-terra/15 text-terra-deep border border-terra/30 text-[10px] font-bold">
                            VIP
                          </span>
                        )}
                      </div>

                      {currentBooking ? (
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-ink-mute">العميل:</span>
                            <span className="font-bold text-ink">{currentBooking.customer_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-mute">الهاتف:</span>
                            <span className="font-mono text-ink-soft">{currentBooking.customer_phone}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-mute">الخدمة:</span>
                            <span className="font-bold text-forest">{primaryService?.name || 'خدمة مخصصة'}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-ink-mute">موعد الانتهاء:</span>
                            <span className="font-mono text-terra font-bold">
                              {format12Hour(currentBooking.ends_at)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-mute">مشغول حالياً بدون حجز مسجل</p>
                      )}

                      <div className="pt-2 border-t border-border/70 flex gap-2">
                        <button
                          onClick={() => handleFinishChairService(chair, currentBooking?.id)}
                          className="btn-clinic-primary w-full py-2 text-xs font-bold"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>إنهاء الخدمة وتفريغ الكرسي</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => {
                  setActiveKpiModal(null);
                  setActiveTab('chairs');
                }}
                className="btn-clinic-ghost text-xs px-4 py-2 font-bold"
              >
                <span>الانتقال لمراقب الكراسي الكامل</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MODAL: PENDING RECEIPTS REVIEW (إيصالات بانتظار المراجعة) */}
      {/* ========================================================================= */}
      {activeKpiModal === 'pending_receipts' && (
        <div className="modal-overlay">
          <div className="modal-container max-w-2xl p-6 space-y-5 text-right">
            <div className="flex items-center justify-between border-b border-border pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-terra/15 text-terra-deep border border-terra/20 flex items-center justify-center font-bold">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-base">
                    إيصالات وعربونات بانتظار المراجعة ({pendingReviewCount})
                  </h3>
                  <p className="text-[11px] text-ink-mute">
                    مراجعة تحويلات إنستاباي وفودافون كاش واعتماد المواعيد فوراً
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-xl bg-paper-warm text-ink-mute hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pendingReviewBookings.length === 0 ? (
              <div className="py-12 text-center space-y-3 bg-paper-warm/50 rounded-2xl border border-border">
                <div className="w-12 h-12 rounded-full bg-forest/10 text-forest mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="font-serif font-bold text-ink text-sm">
                  لا توجد إيصالات بانتظار المراجعة
                </p>
                <p className="text-xs text-ink-mute">
                  تمت مراجعة واعتماد كافة إيصالات الحجوزات والمدفوعات بنجاح
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingReviewBookings.map((b) => {
                  const barber = barbers.find((br) => br.id === b.barber_id);
                  const proof = b.payment_proof;

                  return (
                    <div
                      key={b.id}
                      className="p-4 rounded-2xl border border-terra/30 bg-paper-warm/40 space-y-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-forest bg-white px-2.5 py-0.5 rounded-full border text-xs">
                            {b.id}
                          </span>
                          <h4 className="font-serif font-bold text-ink text-sm">{b.customer_name}</h4>
                          <span className="text-[10px] text-ink-mute font-mono">{b.customer_phone}</span>
                        </div>
                        <p className="text-xs text-ink-mute">
                          الموعد: <strong className="text-ink">{b.starts_at ? formatDateTime(b.starts_at) : 'موعد فوري'}</strong> • الحلاق: <strong className="text-ink">{barber?.full_name || 'أي كابتن متاح'}</strong>
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[11px] font-bold text-forest">
                            المبلغ المحول: {formatCurrency(proof?.transferred_amount || b.booking_fee_at_booking || 50)}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-border">
                            {proof?.payment_method === 'instapay' ? 'إنستاباي' : 'فودافون كاش'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => setSelectedProofBooking(b)}
                          className="btn-clinic-primary text-xs px-3.5 py-2 font-bold flex items-center gap-1.5 shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>عرض الإيصال واعتماده</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => {
                  setActiveKpiModal(null);
                  setActiveTab('bookings');
                }}
                className="btn-clinic-ghost text-xs px-4 py-2 font-bold"
              >
                <span>الانتقال لجدول الحجوزات الرئيسي</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL: BRANCH WAITING QUEUE (طابور الانتظار بالفرع) */}
      {/* ========================================================================= */}
      {activeKpiModal === 'branch_queue' && (
        <div className="modal-overlay">
          <div className="modal-container max-w-2xl p-6 space-y-5 text-right">
            <div className="flex items-center justify-between border-b border-border pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-forest/15 text-forest border border-forest/20 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-base">
                    طابور الانتظار الحالي بالفرع ({branchQueueCount} عملاء)
                  </h3>
                  <p className="text-[11px] text-ink-mute">
                    الفرع: {currentBranch?.name} • تسلسل أدوار العملاء المتواجدين بالصالون
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-xl bg-paper-warm text-ink-mute hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {branchQueueList.length === 0 ? (
              <div className="py-12 text-center space-y-3 bg-paper-warm/50 rounded-2xl border border-border">
                <div className="w-12 h-12 rounded-full bg-forest/10 text-forest mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="font-serif font-bold text-ink text-sm">
                  طابور الانتظار فارغ حالياً
                </p>
                <p className="text-xs text-ink-mute">
                  لا يوجد عملاء بانتظار دورهم في هذا الفرع الآن
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {branchQueueList.map((item, idx) => {
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border border-border bg-paper-warm/40 flex items-center justify-between gap-4 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-forest text-paper font-mono font-bold flex items-center justify-center text-sm shrink-0">
                          #{item.position || idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-serif font-bold text-ink text-sm">{item.customer_name}</h4>
                          </div>
                          <p className="text-[11px] text-ink-mute">
                            الخدمة: <strong className="text-ink">{item.service_name || 'خدمة الحلاقة'}</strong> • الكابتن: <strong className="text-ink">{item.barber_name || 'أي كابتن متاح'}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-forest font-bold bg-white px-2.5 py-1 rounded-lg border border-border">
                          انتظار: {item.estimated_wait_minutes || 10} د
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => {
                  setActiveKpiModal(null);
                  setActiveTab('chairs');
                }}
                className="btn-clinic-ghost text-xs px-4 py-2 font-bold"
              >
                <span>الانتقال لشاشة الانتظار والكراسي</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: ALL BRANCH BOOKINGS (إجمالي حجوزات هذا الفرع) */}
      {/* ========================================================================= */}
      {activeKpiModal === 'branch_bookings' && (
        <div className="modal-overlay">
          <div className="modal-container max-w-3xl p-6 space-y-5 text-right">
            <div className="flex items-center justify-between border-b border-border pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-ink/10 text-ink border border-border flex items-center justify-center font-bold">
                  <Calendar className="w-5 h-5 text-forest" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-base">
                    سجل كافة حجوزات الفرع ({branchBookings.length} حجز)
                  </h3>
                  <p className="text-[11px] text-ink-mute">
                    الفرع: {currentBranch?.name} • فلترة وبحث سريع في كافة الحجوزات
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveKpiModal(null)}
                className="p-1.5 rounded-xl bg-paper-warm text-ink-mute hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Filter Pills & Search */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute" />
                  <input
                    type="text"
                    value={kpiSearchQuery}
                    onChange={(e) => setKpiSearchQuery(e.target.value)}
                    placeholder="بحث برقم الحجز أو اسم العميل أو الهاتف..."
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl pr-9 pl-3 py-2 text-xs text-ink outline-none"
                  />
                </div>

                {/* Status tabs */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                  {[
                    { id: 'all', label: 'الكل' },
                    { id: 'pending_review', label: 'بانتظار المراجعة' },
                    { id: 'confirmed', label: 'مؤكد' },
                    { id: 'in_service', label: 'في الخدمة' },
                    { id: 'completed', label: 'مكتمل' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setKpiBookingFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        kpiBookingFilter === tab.id
                          ? 'bg-forest text-paper shadow-xs'
                          : 'bg-paper-warm text-ink-soft hover:text-ink'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bookings List */}
              {filteredModalBookings.length === 0 ? (
                <div className="py-10 text-center text-xs text-ink-mute bg-paper-warm/40 rounded-2xl border border-border">
                  لا توجد نتائج مطابقة لخيارات البحث أو الفلتر
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto no-scrollbar">
                  {filteredModalBookings.map((b) => {
                    const barber = barbers.find((br) => br.id === b.barber_id);
                    const primaryService = services.find((s) => s.id === b.service_id);

                    const statusBadgeMap: Record<string, { label: string; class: string }> = {
                      pending_payment: { label: 'بانتظار الدفع', class: 'bg-amber-100 text-amber-900 border-amber-200' },
                      pending_review: { label: 'بانتظار المراجعة', class: 'bg-terra/15 text-terra-deep border-terra/30' },
                      confirmed: { label: 'حجز مؤكد', class: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
                      in_service: { label: 'في الخدمة', class: 'bg-forest text-paper border-forest' },
                      completed: { label: 'مكتمل', class: 'bg-paper-deep text-ink-soft border-border' },
                      cancelled: { label: 'ملغي', class: 'bg-rose-100 text-rose-800 border-rose-200' },
                    };

                    const badge = statusBadgeMap[b.status] || { label: b.status, class: 'bg-paper-warm text-ink' };

                    return (
                      <div
                        key={b.id}
                        className="p-3.5 rounded-2xl border border-border bg-paper-warm/30 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-forest bg-white px-2 py-0.5 rounded-md border text-[11px]">
                              {b.id}
                            </span>
                            <strong className="font-bold text-ink">{b.customer_name}</strong>
                            <span className="font-mono text-[10px] text-ink-mute">{b.customer_phone}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.class}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-ink-mute">
                            الخدمة: <strong className="text-ink">{primaryService?.name || 'خدمة الصالون'}</strong> • الموعد: <span className="font-mono">{b.starts_at ? formatDateTime(b.starts_at) : 'موعد فوري'}</span> • الحلاق: <span className="font-bold">{barber?.full_name || 'أي كابتن متاح'}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-center">
                          <span className="font-serif font-bold text-forest text-sm">
                            {formatCurrency(b.total_at_booking)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={() => {
                  setActiveKpiModal(null);
                  setActiveTab('bookings');
                }}
                className="btn-clinic-primary text-xs px-4 py-2 font-bold"
              >
                <span>الانتقال لجدول الحجوزات والعمليات</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
