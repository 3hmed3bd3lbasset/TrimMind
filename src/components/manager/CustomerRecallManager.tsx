import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Users,
  Send,
  CheckCircle2,
  History,
  RefreshCw,
  MessageSquare,
  Clock,
  Crown,
  Scissors,
  Save,
  Search,
  Check,
  Smartphone,
  Calendar,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { useSalonStore } from '../../lib/store';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface CustomerRecallManagerProps {
  branchId: string;
}

interface RecallCandidateDisplay {
  customer_phone: string;
  customer_name: string;
  last_visit_date: string;
  days_since_last_visit: number;
  total_visits: number;
  last_barber: string;
  last_service: string;
  booking_type: string;
  is_vip: boolean;
  isReady: boolean;
}

export const CustomerRecallManager: React.FC<CustomerRecallManagerProps> = ({ branchId }) => {
  const { bookings, barbers, services, settings, updateSettings } = useSalonStore();

  // Load saved threshold from settings or localStorage or default to 30
  const [thresholdDays, setThresholdDays] = useState<number>(() => {
    return settings?.recall_days_threshold || 30;
  });

  const [candidates, setCandidates] = useState<RecallCandidateDisplay[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'ready' | 'counting'>('all');

  const defaultTemplate = `أهلاً يا [اسم العميل]! 💈✨
وحشتنا في صالون TrimMind (الحداد VIP).. بقالك فترة ما شرفتناش من بعد آخر [الخدمة] مع كابتن [الكابتن]!

جاهزين لك دائماً بأفضل تجربة عناية وحلاقة ملكية تليق بك 👑✂️

👉 احجز موعدك القادم بضغطة واحدة من هنا:
https://trimmind.up.railway.app

نتشرف بزيارتك دائماً! ❤️`;

  const [customMessage, setCustomMessage] = useState<string>(defaultTemplate);

  // Sync settings threshold on load
  useEffect(() => {
    if (settings?.recall_days_threshold) {
      setThresholdDays(settings.recall_days_threshold);
    }
  }, [settings?.recall_days_threshold]);

  // Load candidates from server and merge with store bookings
  const loadCandidates = async () => {
    setIsLoading(true);
    try {
      const candidatesMap = new Map<string, RecallCandidateDisplay>();

      // 1. Process all accepted bookings from store
      const acceptedBookings = bookings.filter(
        (b) =>
          b.status === 'completed' ||
          b.status === 'confirmed' ||
          b.status === 'in_service' ||
          b.payment_proof?.status === 'approved'
      );

      for (const b of acceptedBookings) {
        const phone = (b.customer_phone || (b as any).customerPhone || '').trim();
        if (!phone) continue;

        const dateStr = b.starts_at || b.created_at || new Date().toISOString();
        const visitDate = new Date(dateStr);
        const daysSince = Math.max(
          0,
          Math.floor((Date.now() - visitDate.getTime()) / (1000 * 60 * 60 * 24))
        );

        const barberObj = barbers.find((bar) => bar.id === b.barber_id);
        const barberName = barberObj?.full_name || b.barber_name || (b as any).barberName || 'محمد الحداد';
        const serviceObj = services.find((s) => s.id === b.service_id);
        const serviceName = serviceObj?.name || b.service_name || (b as any).serviceName || 'قص شعر وتصفيف كلاسيكي';
        const isVip = b.booking_type === 'vip' || serviceName.toLowerCase().includes('vip');

        if (!candidatesMap.has(phone)) {
          candidatesMap.set(phone, {
            customer_phone: phone,
            customer_name: b.customer_name || (b as any).customerName || 'عميل الصالون',
            last_visit_date: dateStr,
            days_since_last_visit: daysSince,
            total_visits: 1,
            last_barber: barberName,
            last_service: serviceName,
            booking_type: isVip ? 'VIP ملكي' : 'عادي',
            is_vip: isVip,
            isReady: daysSince >= thresholdDays,
          });
        } else {
          const existing = candidatesMap.get(phone)!;
          if (new Date(dateStr) > new Date(existing.last_visit_date)) {
            existing.last_visit_date = dateStr;
            existing.days_since_last_visit = daysSince;
            existing.last_barber = barberName;
            existing.last_service = serviceName;
            existing.booking_type = isVip ? 'VIP ملكي' : 'عادي';
            existing.is_vip = isVip;
            existing.isReady = daysSince >= thresholdDays;
          }
          existing.total_visits = (existing.total_visits || 1) + 1;
        }
      }

      // 2. Fetch from backend endpoint to merge any remote historical records
      try {
        const [candRes, campRes]: any = await Promise.allSettled([
          api.getRecallCandidates(branchId || 'branch-elhdad', thresholdDays),
          api.getRecallCampaigns(branchId || 'branch-elhdad'),
        ]);

        if (candRes.status === 'fulfilled' && Array.isArray(candRes.value?.data)) {
          for (const c of candRes.value.data) {
            const phone = (c.customer_phone || '').trim();
            if (!phone) continue;
            const daysSince = Number(c.days_since_last_visit || 0);
            const isVip = c.booking_type === 'vip' || c.is_vip || String(c.last_service).toLowerCase().includes('vip');

            if (!candidatesMap.has(phone)) {
              candidatesMap.set(phone, {
                customer_phone: phone,
                customer_name: c.customer_name || 'عميل الصالون',
                last_visit_date: c.last_visit_date || new Date().toISOString(),
                days_since_last_visit: daysSince,
                total_visits: Number(c.total_visits || 1),
                last_barber: c.last_barber || 'محمد الحداد',
                last_service: c.last_service || 'قص شعر وتصفيف كلاسيكي',
                booking_type: isVip ? 'VIP ملكي' : 'عادي',
                is_vip: isVip,
                isReady: daysSince >= thresholdDays,
              });
            }
          }
        }

        if (campRes.status === 'fulfilled' && campRes.value?.data) {
          setCampaigns(campRes.value.data);
        }
      } catch (err: any) {
        console.warn('Backend recall sync notice:', err.message);
      }

      const list = Array.from(candidatesMap.values());
      // Sort: Ready candidates first, then descending by days
      list.sort((a, b) => {
        if (a.isReady && !b.isReady) return -1;
        if (!a.isReady && b.isReady) return 1;
        return b.days_since_last_visit - a.days_since_last_visit;
      });

      setCandidates(list);
      // Auto-select only ready candidates
      const readyPhones = list.filter((c) => c.isReady).map((c) => c.customer_phone);
      setSelectedPhones(readyPhones);
    } catch (err: any) {
      console.warn('Customer recall load error:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, [branchId, thresholdDays, bookings.length]);

  // Save Settings handler
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      updateSettings({ recall_days_threshold: thresholdDays });
      toast.success(`تم حفظ إعدادات الانقطاع (${thresholdDays} يوماً) بنجاح!`);
    } catch (err: any) {
      toast.error('حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Filtered Candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // Tab filter
      if (filterTab === 'ready' && !c.isReady) return false;
      if (filterTab === 'counting' && c.isReady) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.customer_name.toLowerCase().includes(q);
        const matchPhone = c.customer_phone.includes(q);
        const matchBarber = c.last_barber.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchBarber) return false;
      }
      return true;
    });
  }, [candidates, filterTab, searchQuery]);

  const readyCandidates = useMemo(() => candidates.filter((c) => c.isReady), [candidates]);
  const countingCandidates = useMemo(() => candidates.filter((c) => !c.isReady), [candidates]);

  const handleToggleCandidate = (phone: string) => {
    if (selectedPhones.includes(phone)) {
      setSelectedPhones(selectedPhones.filter((p) => p !== phone));
    } else {
      setSelectedPhones([...selectedPhones, phone]);
    }
  };

  const handleToggleSelectAllReady = () => {
    const readyPhones = readyCandidates.map((c) => c.customer_phone);
    const allSelected = readyPhones.every((p) => selectedPhones.includes(p));

    if (allSelected) {
      setSelectedPhones(selectedPhones.filter((p) => !readyPhones.includes(p)));
    } else {
      setSelectedPhones(Array.from(new Set([...selectedPhones, ...readyPhones])));
    }
  };

  const handleSendCampaign = async () => {
    // Only dispatch to selected candidates who are actually completed/ready!
    const targetPhones = selectedPhones.filter((p) =>
      readyCandidates.some((rc) => rc.customer_phone === p)
    );

    if (targetPhones.length === 0) {
      toast.error('يرجى اختيار عميل واحد على الأقل من العملاء المكتملين الجاهزين للتذكير.');
      return;
    }

    setIsSending(true);
    try {
      const res: any = await api.sendRecallCampaign({
        branchId: branchId || 'branch-elhdad',
        thresholdDays,
        candidatePhones: targetPhones,
        customMessageTemplate: customMessage.trim() || undefined,
      });

      toast.success(res?.message || `تم إرسال حملة إعادة الجذب بنجاح إلى ${targetPhones.length} عميل!`);
      loadCandidates();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'فشل إرسال الحملة');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 font-sans text-ink" dir="rtl">
      {/* Header & Settings Bar (Compact & Sleek) */}
      <div className="clinic-card p-4 sm:p-5 bg-white/95 shadow-clinic-1 space-y-3 sm:space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-forest text-paper flex items-center justify-center font-bold shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-base sm:text-lg font-extrabold text-ink flex items-center gap-1.5">
                <span>نظام إعادة جذب العملاء وتذكير الانقطاع</span>
                <span className="text-[10px] font-mono font-bold bg-forest/10 text-forest border border-forest/20 px-2 py-0.5 rounded-full">
                  AI Recall
                </span>
              </h3>
              <p className="text-[11px] sm:text-xs text-ink-soft">
                تتبع انقطاع العملاء بعداد أيام ذكي وإرسال رسائل ودية مخصصة فور اكتمال العداد
              </p>
            </div>
          </div>

          {/* Days Threshold & Save Settings Controls */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <div className="flex items-center gap-1.5 bg-paper-warm px-3 py-1.5 rounded-xl border border-border text-xs">
              <Clock className="w-3.5 h-3.5 text-forest" />
              <span className="text-[11px] font-bold text-ink-mute">أيام الانقطاع:</span>
              <select
                value={thresholdDays}
                onChange={(e) => setThresholdDays(Number(e.target.value))}
                className="bg-transparent font-bold text-forest focus:outline-none cursor-pointer text-xs font-mono"
              >
                <option value={15}>15 يوماً</option>
                <option value={20}>20 يوماً</option>
                <option value={30}>30 يوماً</option>
                <option value={45}>45 يوماً</option>
                <option value={60}>60 يوماً</option>
                <option value={90}>90 يوماً</option>
              </select>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="px-3 py-1.5 rounded-xl bg-forest/10 hover:bg-forest text-forest hover:text-white border border-forest/25 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
              title="حفظ عدد الأيام كإعداد افتراضي دائم"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات'}</span>
            </button>

            <button
              onClick={loadCandidates}
              className="p-2 text-ink-soft hover:text-forest bg-paper-warm rounded-xl border border-border transition-colors cursor-pointer"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick KPI Stat Badges (3 Compact Badges) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
          <div className="p-2.5 rounded-xl bg-paper-warm border border-border/80 space-y-0.5">
            <span className="text-[10px] text-ink-mute font-bold block">إجمالي العملاء</span>
            <strong className="text-sm sm:text-base font-serif font-extrabold text-ink font-mono">
              {candidates.length}
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-0.5">
            <span className="text-[10px] text-emerald-800 font-bold block">مكتملين وجاهزين</span>
            <strong className="text-sm sm:text-base font-serif font-extrabold text-emerald-700 font-mono">
              {readyCandidates.length} عميل
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-0.5">
            <span className="text-[10px] text-amber-800 font-bold block">قيد العد النشط</span>
            <strong className="text-sm sm:text-base font-serif font-extrabold text-amber-700 font-mono">
              {countingCandidates.length} عميل
            </strong>
          </div>
        </div>
      </div>

      {/* Main Content: Candidates Grid & Campaign Messenger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Candidates List Column (Takes 2 Columns on Desktop) */}
        <div className="lg:col-span-2 clinic-card p-4 sm:p-5 bg-white/95 shadow-clinic-1 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            {/* Search & Tabs Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-border">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-paper-warm p-1 rounded-xl border border-border text-xs">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                    filterTab === 'all' ? 'bg-forest text-white shadow-xs' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  الكل ({candidates.length})
                </button>
                <button
                  onClick={() => setFilterTab('ready')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                    filterTab === 'ready' ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-800 hover:text-emerald-950'
                  }`}
                >
                  🟢 المكتملين ({readyCandidates.length})
                </button>
                <button
                  onClick={() => setFilterTab('counting')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                    filterTab === 'counting' ? 'bg-amber-700 text-white shadow-xs' : 'text-amber-800 hover:text-amber-950'
                  }`}
                >
                  ⏳ قيد العد ({countingCandidates.length})
                </button>
              </div>

              {/* Search Box */}
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-ink-mute absolute right-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="بحث باسم العميل، الهاتف، الكابتن..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-8 py-1.5 rounded-xl bg-paper-warm border border-border text-xs focus:outline-none focus:border-forest/50"
                />
              </div>
            </div>

            {/* Select All Ready Helper */}
            {readyCandidates.length > 0 && filterTab !== 'counting' && (
              <div className="flex items-center justify-between text-xs px-1 text-ink-soft">
                <span className="text-[11px]">
                  المحدد للإرسال: <strong className="text-forest font-mono">{selectedPhones.filter((p) => readyCandidates.some((rc) => rc.customer_phone === p)).length}</strong> من {readyCandidates.length} مكتمل
                </span>
                <button
                  onClick={handleToggleSelectAllReady}
                  className="text-xs font-bold text-forest hover:underline cursor-pointer"
                >
                  {readyCandidates.every((c) => selectedPhones.includes(c.customer_phone))
                    ? 'إلغاء تحديد المكتملين'
                    : 'تحديد كافة المكتملين'}
                </button>
              </div>
            )}

            {/* Candidates Compact Items */}
            {isLoading ? (
              <div className="text-center py-12 text-xs text-ink-soft space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-forest" />
                <p>جاري فحص سجلات الحجوزات والعملاء المؤهلين...</p>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="text-center py-10 text-ink-soft text-xs space-y-2 bg-paper-warm/50 rounded-2xl border border-dashed border-border p-6">
                <CheckCircle2 className="w-8 h-8 text-emerald-600/70 mx-auto" />
                <p className="font-bold text-sm text-ink">
                  {filterTab === 'ready'
                    ? `لا يوجد عملاء اكتمل عداد انقطاعهم (${thresholdDays} يوماً) حالياً.`
                    : 'لا توجد سجلات مطابقة للبحث.'}
                </p>
                <p className="text-[11px]">يتم تسجيل أي عميل يتم قبول حجزه تلقائياً ويبدأ العداد في العمل فوراً.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {filteredCandidates.map((c) => {
                  const progressPct = Math.min(100, Math.round((c.days_since_last_visit / thresholdDays) * 100));
                  const isSelected = selectedPhones.includes(c.customer_phone);

                  return (
                    <div
                      key={c.customer_phone}
                      onClick={() => c.isReady && handleToggleCandidate(c.customer_phone)}
                      className={`p-3 rounded-xl border transition-all text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        c.isReady ? 'cursor-pointer' : 'opacity-90'
                      } ${
                        isSelected && c.isReady
                          ? 'bg-forest/5 border-forest/50 shadow-xs'
                          : c.isReady
                          ? 'bg-emerald-50/40 border-emerald-200/80 hover:bg-emerald-50/80'
                          : 'bg-paper-warm/60 border-border/70'
                      }`}
                    >
                      {/* Right: Checkbox + Customer Info */}
                      <div className="flex items-start gap-2.5 min-w-0">
                        {c.isReady ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCandidate(c.customer_phone)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 rounded border-border text-forest focus:ring-forest w-4 h-4 cursor-pointer shrink-0"
                          />
                        ) : (
                          <div className="w-4 h-4 mt-1 rounded-full bg-amber-200/60 border border-amber-300 flex items-center justify-center shrink-0">
                            <Clock className="w-2.5 h-2.5 text-amber-800" />
                          </div>
                        )}

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <strong className="font-serif font-bold text-ink text-xs sm:text-sm truncate">
                              {c.customer_name}
                            </strong>
                            {c.is_vip && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-[#fef3c7] text-[#b45309] border border-[#f59e0b]/30 px-1.5 py-0.2 rounded">
                                <Crown className="w-2.5 h-2.5 fill-[#f59e0b]" /> VIP
                              </span>
                            )}
                            <span className="font-mono text-[10px] text-ink-mute">{c.customer_phone}</span>
                          </div>

                          {/* Last Booking Details (Barber + Service) */}
                          <div className="flex items-center gap-2 text-[10.5px] text-ink-soft flex-wrap">
                            <span className="flex items-center gap-0.5 text-forest font-medium">
                              <Scissors className="w-3 h-3 shrink-0" /> {c.last_barber}
                            </span>
                            <span>•</span>
                            <span className="truncate text-ink-soft font-medium">{c.last_service}</span>
                          </div>
                        </div>
                      </div>

                      {/* Left: Days Counter & Progress Meter */}
                      <div className="sm:text-left space-y-1 sm:w-48 shrink-0">
                        <div className="flex items-center justify-between sm:justify-end gap-1.5">
                          {c.isReady ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-300 font-mono">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              <span>مكتمل وجاهز للتذكير</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md border border-amber-300 font-mono">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>قيد العد (باقي {thresholdDays - c.days_since_last_visit} يوم)</span>
                            </span>
                          )}
                        </div>

                        {/* Progress Bar (0 to thresholdDays) */}
                        <div className="space-y-0.5">
                          <div className="w-full bg-border-soft h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                c.isReady ? 'bg-emerald-600' : 'bg-amber-500'
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[9.5px] text-ink-mute font-mono">
                            <span>العداد: {c.days_since_last_visit} يوم</span>
                            <span>الهدف: {thresholdDays} يوم ({progressPct}%)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Message Composer & Send Column (Takes 1 Column on Desktop) */}
        <div className="clinic-card p-4 sm:p-5 bg-white/95 shadow-clinic-1 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <MessageSquare className="w-4 h-4 text-forest" />
              <h4 className="font-serif font-bold text-ink text-sm">صياغة رسالة الحملة المخصصة</h4>
            </div>

            <p className="text-[11px] text-ink-soft leading-relaxed">
              سيقوم النظام باستبدال <code className="text-forest font-bold">[اسم العميل]</code>،{' '}
              <code className="text-forest font-bold">[الكابتن]</code>، و{' '}
              <code className="text-forest font-bold">[الخدمة]</code> ببيانات كل عميل تلقائياً:
            </p>

            <textarea
              rows={8}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="w-full p-3 rounded-xl bg-paper-warm border border-border text-xs leading-relaxed font-sans focus:outline-none focus:border-forest/50 resize-none text-ink"
              placeholder="اكتب نص رسالة التذكير هنا..."
            />

            <div className="flex items-center justify-between text-[10px] text-ink-mute">
              <span>تصل الرسالة للعميل عبر الواتساب مباشرة</span>
              <button
                onClick={() => setCustomMessage(defaultTemplate)}
                className="text-forest hover:underline font-bold cursor-pointer"
              >
                استعادة النص الافتراضي
              </button>
            </div>
          </div>

          {/* Send Button & Target Summary */}
          <div className="pt-3 border-t border-border space-y-2.5">
            <div className="p-2.5 bg-paper-warm rounded-xl border border-border text-xs flex items-center justify-between">
              <span className="text-ink-soft text-[11px]">العملاء المكتملين المحددين:</span>
              <strong className="text-forest font-mono text-sm font-bold">
                {selectedPhones.filter((p) => readyCandidates.some((rc) => rc.customer_phone === p)).length} عميل
              </strong>
            </div>

            <button
              onClick={handleSendCampaign}
              disabled={
                isSending ||
                selectedPhones.filter((p) => readyCandidates.some((rc) => rc.customer_phone === p)).length === 0
              }
              className="w-full py-3 bg-forest hover:bg-forest-light text-paper rounded-xl font-serif font-bold text-xs flex items-center justify-center gap-2 shadow-clinic-1 transition-all disabled:opacity-40 cursor-pointer active:scale-98"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSending
                  ? 'جاري إرسال الحملة...'
                  : `إرسال الحملة (${
                      selectedPhones.filter((p) => readyCandidates.some((rc) => rc.customer_phone === p)).length
                    }) الآن`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Campaigns History */}
      {campaigns.length > 0 && (
        <div className="clinic-card p-4 sm:p-5 bg-white/95 shadow-clinic-1 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <History className="w-4 h-4 text-forest" />
            <h4 className="font-serif font-bold text-ink text-sm">سجل الحملات السابقة ونسب الاستجابة</h4>
          </div>

          <div className="divide-y divide-border/60">
            {campaigns.map((camp) => (
              <div key={camp.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-ink">{camp.notes || 'حملة إعادة جذب'}</span>
                  <p className="text-[10px] text-ink-mute font-mono">
                    {new Date(camp.created_at).toLocaleString('ar-EG')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-paper-warm px-2.5 py-1 rounded-lg border border-border font-mono text-[11px]">
                    المرسل: {camp.total_sends || 0}
                  </span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold font-mono text-[11px]">
                    أعادوا الحجز: {camp.total_rebooked || 0} ✓
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
