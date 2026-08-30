import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSalonStore } from '../../lib/store';
import {
  Scissors,
  CalendarCheck,
  Search,
  Sparkles,
  Shield,
  UserCheck,
  User,
  LogIn,
  LogOut,
  Menu,
  X,
  Tv,
  ArrowLeft,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface NavbarProps {
  onOpenAiDrawer?: () => void;
  onOpenTrackModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAiDrawer }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, switchRole, setAiDrawerOpen, settings } = useSalonStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network errors on logout
    }
    sessionStorage.clear();
    switchRole('customer');
    toast.success('تم تسجيل الخروج بنجاح');
    setMobileMenuOpen(false);
    navigate('/');
  };

  const getRoleArabicTitle = () => {
    if (currentUser.role === 'manager') {
      return currentUser.is_super_admin ? 'المدير العام' : 'مدير الفرع';
    }
    if (currentUser.role === 'receptionist') return 'موظف استقبال';
    if (currentUser.role === 'barber') return 'كابتن حلاقة';
    return 'عميل';
  };

  return (
    <header className="sticky top-0 z-40 bg-[#f3eee4]/90 backdrop-blur-md border-b border-border transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-forest text-paper flex items-center justify-center shadow-clinic-2">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-bold text-lg sm:text-xl text-ink tracking-tight">
                  {settings?.salon_name?.split('VIP')[0]?.trim() || 'صالون النخبة'}
                </span>
                <span className="bg-terra/15 text-terra-deep border border-terra/30 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                  VIP
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-ink-mute tracking-wider font-mono">ELITE BARBER & SPA</p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            <Link
              to="/"
              className={`px-3.5 py-2 rounded-full text-sm font-semibold transition-all ${
                isActive('/')
                  ? 'text-forest bg-paper-warm shadow-clinic-1 border border-border'
                  : 'text-ink-soft hover:text-ink hover:bg-paper-warm/60'
              }`}
            >
              الرئيسية
            </Link>

            {/* Customer Only Booking Link */}
            {currentUser.role === 'customer' && (
              <Link
                to="/book"
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-all ${
                  isActive('/book')
                    ? 'text-forest bg-paper-warm shadow-clinic-1 border border-border'
                    : 'text-ink-soft hover:text-ink hover:bg-paper-warm/60'
                }`}
              >
                <CalendarCheck className="w-4 h-4 text-forest" />
                <span>حجز موعد جديد</span>
              </Link>
            )}

            <Link
              to="/track"
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-all ${
                isActive('/track')
                  ? 'text-forest bg-paper-warm shadow-clinic-1 border border-border'
                  : 'text-ink-soft hover:text-ink hover:bg-paper-warm/60'
              }`}
            >
              <Search className="w-4 h-4 text-ink-mute" />
              <span>تتبع الحجز والانتظار</span>
            </Link>

            {/* Queue TV Display - Only for Receptionist and Manager */}
            {(currentUser.role === 'receptionist' || currentUser.role === 'manager') && (
              <a
                href="/display"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold text-terra-deep hover:bg-paper-warm/80 transition-all border border-terra/20"
                title="فتح شاشة الانتظار الحية في نافذة مستقلة لشاشات التلفزيون"
              >
                <Tv className="w-4 h-4 text-terra" />
                <span>شاشة الانتظار (TV ↗)</span>
              </a>
            )}



            {/* Receptionist Link - Only when logged in as Receptionist */}
            {currentUser.role === 'receptionist' && (
              <Link
                to="/receptionist"
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold transition-all ${
                  isActive('/receptionist')
                    ? 'text-terra-deep bg-terra/15 border border-terra/30'
                    : 'text-terra-deep hover:bg-paper-warm'
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>لوحة الاستقبال</span>
              </Link>
            )}

            {/* Manager Link - Only when logged in as Manager */}
            {currentUser.role === 'manager' && (
              <Link
                to="/manager"
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold transition-all ${
                  isActive('/manager')
                    ? 'text-forest bg-forest/10 border border-forest/30'
                    : 'text-forest hover:bg-paper-warm'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span>لوحة الإدارة</span>
              </Link>
            )}
          </nav>

          {/* Right Action buttons */}
          <div className="hidden sm:flex items-center gap-2.5">
            {/* Staff User Identity Badge + Direct Logout Button */}
            {currentUser.role !== 'customer' ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-paper-warm border border-border shadow-xs">
                  <div className="w-6 h-6 rounded-full bg-forest text-paper flex items-center justify-center text-[10px] font-bold shadow-xs">
                    {currentUser.role === 'manager' ? (
                      <Shield className="w-3.5 h-3.5" />
                    ) : currentUser.role === 'receptionist' ? (
                      <UserCheck className="w-3.5 h-3.5" />
                    ) : (
                      <Scissors className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="text-right leading-tight">
                    <span className="text-xs font-bold text-ink block max-w-[120px] truncate">
                      {currentUser.full_name}
                    </span>
                    <span className="text-[10px] text-ink-mute block font-semibold">
                      {getRoleArabicTitle()}
                    </span>
                  </div>
                </div>

                {/* Direct Luxury Logout Button */}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-rose-200 bg-rose-50/90 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                  title="تسجيل الخروج والعودة كزائر"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  <span>تسجيل الخروج</span>
                </button>
              </>
            ) : (
              /* Public Login Button for Staff */
              <Link
                to="/auth"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-border bg-white/80 hover:bg-paper-warm text-ink text-xs font-bold transition-all shadow-xs"
                title="بوابة تسجيل دخول طاقم العمل والإدارة"
              >
                <LogIn className="w-3.5 h-3.5 text-forest" />
                <span>تسجيل الدخول</span>
              </Link>
            )}

            {/* Notification Bell for Receptionist and Manager */}
            {(currentUser.role === 'receptionist' || currentUser.role === 'manager') && (
              <NotificationBell />
            )}

            {/* AI Assistant Ghost Button */}
            <button
              onClick={() => {
                if (onOpenAiDrawer) onOpenAiDrawer();
                else setAiDrawerOpen(true);
              }}
              className="btn-clinic-ghost text-xs"
            >
              <Sparkles className="w-4 h-4 text-forest" />
              <span>المساعد الذكي</span>
            </button>

            {/* Direct Book Primary Tactile Button - Only for Customers */}
            {currentUser.role === 'customer' && (
              <Link to="/book" className="btn-clinic-primary text-xs">
                <span>احجز موعدك الآن</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-2">
            {(currentUser.role === 'receptionist' || currentUser.role === 'manager') && (
              <NotificationBell />
            )}
            <button
              onClick={() => setAiDrawerOpen(true)}
              className="p-2.5 rounded-full bg-paper-warm text-forest border border-border shadow-clinic-1"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-full bg-paper-warm text-ink border border-border shadow-clinic-1"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-paper-warm border-b border-border px-5 pt-3 pb-6 space-y-3 shadow-clinic-2">
          {currentUser.role !== 'customer' && (
            <div className="p-3 bg-white rounded-2xl border border-border flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-forest text-paper flex items-center justify-center text-xs font-bold">
                  {currentUser.role === 'manager' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-bold text-ink">{currentUser.full_name}</div>
                  <div className="text-[10px] text-ink-mute">{getRoleArabicTitle()}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </button>
            </div>
          )}

          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-4 py-2.5 rounded-xl text-sm text-ink hover:bg-paper font-semibold"
          >
            الرئيسية
          </Link>
          {currentUser.role === 'customer' && (
            <Link
              to="/book"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm text-forest font-bold hover:bg-paper"
            >
              حجز موعد جديد
            </Link>
          )}
          <Link
            to="/track"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-4 py-2.5 rounded-xl text-sm text-ink hover:bg-paper"
          >
            تتبع الحجز والانتظار
          </Link>
          {(currentUser.role === 'receptionist' || currentUser.role === 'manager') && (
            <a
              href="/display"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm text-terra-deep font-bold hover:bg-paper"
            >
              شاشة الانتظار (TV ↗)
            </a>
          )}

          {currentUser.role === 'receptionist' && (
            <Link
              to="/receptionist"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm text-terra-deep font-bold hover:bg-paper"
            >
              لوحة الاستقبال
            </Link>
          )}
          {currentUser.role === 'manager' && (
            <Link
              to="/manager"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm text-forest font-bold hover:bg-paper"
            >
              لوحة الإدارة
            </Link>
          )}
          {currentUser.role === 'customer' && (
            <Link
              to="/auth"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm text-ink font-bold hover:bg-paper border border-border bg-white text-center"
            >
              تسجيل دخول طاقم العمل
            </Link>
          )}
        </div>
      )}
    </header>
  );
};
