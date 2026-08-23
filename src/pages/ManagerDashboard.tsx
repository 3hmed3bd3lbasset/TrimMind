import React, { useState } from 'react';
import { useSalonStore } from '../lib/store';
import { AnalyticsCharts } from '../components/manager/AnalyticsCharts';
import { BookingRevenuesManager } from '../components/manager/BookingRevenuesManager';
import { BranchManager } from '../components/manager/BranchManager';
import { BarberManager } from '../components/manager/BarberManager';
import { ChairManager } from '../components/manager/ChairManager';
import { ServiceManager } from '../components/manager/ServiceManager';
import { ProductManager } from '../components/manager/ProductManager';
import { SettingsManager } from '../components/manager/SettingsManager';
import { ManagersManager } from '../components/manager/ManagersManager';
import { ReceptionistManager } from '../components/manager/ReceptionistManager';
import { AuditLogViewer } from '../components/manager/AuditLogViewer';
import { AIInsightsPanel } from '../components/manager/AIInsightsPanel';
import { CustomerRecallManager } from '../components/manager/CustomerRecallManager';
import { WaitlistManager } from '../components/manager/WaitlistManager';
import { NotificationBell } from '../components/common/NotificationBell';
import {
  Shield,
  BarChart3,
  DollarSign,
  Building2,
  UserCheck,
  UserPlus,
  Armchair,
  Scissors,
  Coffee,
  Settings,
  FileText,
  Crown,
  Lock,
  Clock,
  Tv,
  X,
  Sparkles,
  Sliders,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';

export default function ManagerDashboard() {
  const { currentUser, branches } = useSalonStore();
  const [activeTab, setActiveTab] = useState<
    | 'analytics'
    | 'insights'
    | 'recall'
    | 'waitlist'
    | 'revenues'
    | 'branches'
    | 'barbers'
    | 'receptionists'
    | 'chairs'
    | 'services'
    | 'products'
    | 'settings'
    | 'managers'
    | 'audit'
  >(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('manager_active_tab');
      if (saved) return saved as any;
    }
    return 'analytics';
  });

  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

  React.useEffect(() => {
    try {
      sessionStorage.setItem('manager_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  const isSuperAdmin = currentUser?.is_super_admin ?? true;
  const assignedBranches = branches.filter((b) =>
    currentUser?.assigned_branch_ids?.includes(b.id) || currentUser?.branch_id === b.id
  );

  const SECTIONS = [
    {
      id: 'insights',
      label: 'تقارير وتحليلات الذكاء الاصطناعي',
      desc: 'ملخص ذكي للإيرادات، ساعات الذروة، ونسب الحضور',
      icon: Sparkles,
      category: 'الذكاء والتحليلات',
    },
    {
      id: 'recall',
      label: 'إعادة جذب العملاء (AI Recall)',
      desc: 'استهداف المنقطعين بحملات واتساب مخصصة',
      icon: UserCheck,
      category: 'الذكاء والتحليلات',
    },
    {
      id: 'waitlist',
      label: 'قائمة الانتظار الذكية',
      desc: 'إدارة الشواغر وإرسال روابط الحجز للشخص التالي',
      icon: Clock,
      category: 'الذكاء والتحليلات',
    },
    {
      id: 'revenues',
      label: 'إيرادات ومقبوضات الحجوزات',
      desc: 'سجل التحويلات المؤكدة والعربونات المقبوضة',
      icon: DollarSign,
      category: 'المالية والمقبوضات',
    },
    {
      id: 'branches',
      label: 'الفروع والمواقع',
      desc: 'إدارة وتخصيص فروع الصالون وأرقامها',
      icon: Building2,
      category: 'التنظيم والفروع',
    },
    {
      id: 'barbers',
      label: 'الحلاقين وفريق العمل',
      desc: 'إدارة وتوزيع الكباتن والتقييمات وكلمات المرور',
      icon: UserCheck,
      category: 'فريق العمل',
    },
    {
      id: 'receptionists',
      label: 'موظفي الاستقبال',
      desc: 'إدارة حسابات الاستقبال بالفروع وكلمات المرور',
      icon: UserPlus,
      category: 'فريق العمل',
    },
    {
      id: 'chairs',
      label: 'الكراسي والمحطات',
      desc: 'كراسي الخدمة وأجنحة VIP',
      icon: Armchair,
      category: 'فريق العمل',
    },
    {
      id: 'services',
      label: 'كتالوج الخدمات والباقات',
      desc: 'الأسعار، المدة، والخدمات الحصرية',
      icon: Scissors,
      category: 'الخدمات والمنتجات',
    },
    {
      id: 'products',
      label: 'الكافيه والمخزون',
      desc: 'المشروبات ومنتجات العناية باللحية',
      icon: Coffee,
      category: 'الخدمات والمنتجات',
    },
    {
      id: 'settings',
      label: 'إعدادات وهوية الصالون',
      desc: 'العربون، أرقام الدفع، ونصوص الفوتر',
      icon: Settings,
      category: 'إعدادات المنظومة',
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'managers',
            label: 'المديرين والشركاء',
            desc: 'صلاحيات الإدارة والوصول للفروع',
            icon: Crown,
            category: 'إعدادات المنظومة',
          },
        ]
      : []),
    {
      id: 'audit',
      label: 'سجل الأمان والتدقيق',
      desc: 'تتبع كافة العمليات والأنشطة الإدارية',
      icon: FileText,
      category: 'الأمان والرقابة',
    },
  ];

  const currentActiveConfig = SECTIONS.find((s) => s.id === activeTab);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 font-sans text-ink">
      {/* Top Header Bar */}
      <div className="clinic-card p-6 shadow-clinic-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-forest text-paper flex items-center justify-center shadow-clinic-1">
            {isSuperAdmin ? <Crown className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-xl font-bold text-ink">
                لوحة الإدارة والتحليلات العليا (Executive Studio)
              </h1>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1 ${
                  isSuperAdmin
                    ? 'bg-forest text-paper shadow-sm'
                    : 'bg-terra/15 text-terra-deep border border-terra/30'
                }`}
              >
                {isSuperAdmin ? 'SUPER ADMIN (المالك)' : 'BRANCH PARTNER (شريك)'}
              </span>
            </div>
            <p className="text-xs text-ink-mute mt-0.5">
              المدير:{' '}
              <strong className="text-ink">{currentUser.full_name}</strong>
              {!isSuperAdmin && (
                <span>
                  {' '}
                  • نطاق الصلاحية:{' '}
                  <strong className="text-forest">
                    {assignedBranches.map((b) => b.name).join('، ') || 'فرع محدد'}
                  </strong>
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <NotificationBell
            onSelectBooking={(bookingId) => {
              setActiveTab('revenues');
            }}
          />

          <a
            href="/display"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-clinic-ghost text-xs flex items-center gap-1.5"
            title="فتح شاشة الانتظار المخصصة للتلفزيون في نافذة مستقلة"
          >
            <Tv className="w-4 h-4 text-terra" />
            <span>شاشة الصالون (TV ↗)</span>
          </a>
        </div>
      </div>

      {/* Modern Compact Navigation Bar with Animated Settings Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/90 p-3 rounded-2xl border border-border shadow-clinic-1">
        {/* Left Side: Primary Views */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'analytics'
                ? 'bg-forest text-paper shadow-clinic-1'
                : 'bg-paper-warm text-ink-soft hover:bg-white hover:text-ink border border-border'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>التحليلات والتقارير</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('revenues')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all ${
              activeTab === 'revenues'
                ? 'bg-forest text-paper shadow-clinic-1'
                : 'bg-paper-warm text-ink-soft hover:bg-white hover:text-ink border border-border'
            }`}
          >
            <DollarSign className="w-4 h-4 text-terra-soft" />
            <span>إيرادات الحجوزات</span>
          </button>

          {activeTab !== 'analytics' && activeTab !== 'revenues' && currentActiveConfig && (
            <div className="flex items-center gap-2 bg-paper-warm px-3 py-1.5 rounded-xl border border-border text-xs">
              <span className="text-ink-mute">القسم المفتوح:</span>
              <span className="font-bold text-forest flex items-center gap-1.5">
                <currentActiveConfig.icon className="w-4 h-4 text-terra" />
                <span>{currentActiveConfig.label}</span>
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="text-[10px] text-ink-mute hover:text-rose-600 mr-1 p-0.5"
                title="إغلاق والرجوع للتحليلات"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Animated Hub Button */}
        <button
          type="button"
          onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-xs ${
            isSettingsMenuOpen
              ? 'bg-terra text-paper shadow-clinic-1 scale-[1.02]'
              : 'bg-paper-warm hover:bg-white text-ink border border-border'
          }`}
        >
          <Sliders className="w-4 h-4 text-forest" />
          <span>إعدادات وإدارة المنظومة</span>
          <span className="px-1.5 py-0.5 rounded-full bg-forest text-paper text-[10px] font-mono">
            {SECTIONS.length} أقسام
          </span>
        </button>
      </div>

      {/* Grid Drawer for Management Hub */}
      {isSettingsMenuOpen && (
        <div className="bg-white p-5 rounded-3xl border border-border shadow-clinic-3 space-y-4 animate-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-forest/10 text-forest flex items-center justify-center">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-ink text-sm">أقسام إدارة وتشغيل الصالون</h3>
                <p className="text-[11px] text-ink-mute">
                  اختر القسم المطلوب لفتحه مباشرة في مساحة العمل
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsMenuOpen(false)}
              className="p-1.5 rounded-xl hover:bg-paper-warm text-ink-mute hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {SECTIONS.map((section) => {
                const isCurrent = activeTab === section.id;
                const Icon = section.icon;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(section.id as any);
                      setIsSettingsMenuOpen(false);
                    }}
                    className={`p-3.5 rounded-2xl border text-right transition-all flex flex-col justify-between space-y-2 group ${
                      isCurrent
                        ? 'bg-forest text-paper border-forest shadow-clinic-2'
                        : 'bg-paper-warm/80 hover:bg-white hover:border-forest/40 border-border text-ink'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isCurrent
                            ? 'bg-paper/20 text-paper'
                            : 'bg-white text-forest shadow-xs border border-border'
                        }`}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <span
                        className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold ${
                          isCurrent
                            ? 'bg-paper/20 text-paper'
                            : 'bg-forest/10 text-forest border border-forest/20'
                        }`}
                      >
                        {section.category}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-serif font-bold text-xs">{section.label}</h4>
                      <p
                        className={`text-[10.5px] line-clamp-2 mt-0.5 ${
                          isCurrent ? 'text-paper/80' : 'text-ink-mute'
                        }`}
                      >
                        {section.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Card */}
      <div className="clinic-card p-3.5 sm:p-6 shadow-clinic-2 bg-white/95">
        {activeTab === 'analytics' && <AnalyticsCharts />}
        {activeTab === 'insights' && <AIInsightsPanel branchId={currentUser.branch_id || 'branch-elhdad'} />}
        {activeTab === 'recall' && <CustomerRecallManager branchId={currentUser.branch_id || 'branch-elhdad'} />}
        {activeTab === 'waitlist' && <WaitlistManager branchId={currentUser.branch_id || 'branch-elhdad'} />}
        {activeTab === 'revenues' && <BookingRevenuesManager />}
        {activeTab === 'branches' && <BranchManager />}
        {activeTab === 'barbers' && <BarberManager />}
        {activeTab === 'receptionists' && <ReceptionistManager />}
        {activeTab === 'chairs' && <ChairManager />}
        {activeTab === 'services' && <ServiceManager />}
        {activeTab === 'products' && <ProductManager />}
        {activeTab === 'settings' && <SettingsManager />}
        {activeTab === 'managers' && isSuperAdmin && <ManagersManager />}
        {activeTab === 'audit' && <AuditLogViewer />}
      </div>
    </div>
  );
}
