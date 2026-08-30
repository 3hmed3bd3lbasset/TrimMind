import React, { useState, useEffect } from 'react';
import { useSalonStore } from '../lib/store';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';
import { Profile } from '../types';
import {
  Scissors,
  Lock,
  Mail,
  Shield,
  ArrowLeft,
  Phone,
  MessageCircle,
  X,
  AlertTriangle,
  Sparkles,
  LogOut,
  UserCheck,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import { api } from '../lib/api';

export default function AuthPage() {
  const { profiles, barbers, branches, currentUser, switchRole, setCurrentUser, setSelectedBranchId, settings } = useSalonStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useBodyScrollLock(isForgotModalOpen);

  useEffect(() => {
    if (!isForgotModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsForgotModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isForgotModalOpen]);

  const superAdminPhone = settings.primary_phone || '010 1234 5678';

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = identifier.trim();

    if (!cleanId) {
      toast.error('يرجى إدخال البريد الإلكتروني أو رقم الهاتف');
      return;
    }

    if (!password) {
      toast.error('يرجى إدخال كلمة المرور');
      return;
    }

    setIsSubmitting(true);

    // 1. Try real Server Backend Authentication (Bcrypt + JWT)
    try {
      const res: any = await api.login({ identifier: cleanId, password });
      if (res && res.success && res.data) {
        const { user } = res.data;
        if (user) {
          const profile: Profile = {
            id: user.id,
            full_name: user.full_name,
            phone: user.phone,
            email: user.email,
            role: user.role,
            is_super_admin: Boolean(user.is_super_admin),
            branch_id: user.branch_id,
            barber_id: user.barber_id,
            assigned_branch_ids: user.assigned_branch_ids || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          setCurrentUser(profile);
          if (profile.branch_id) {
            setSelectedBranchId(profile.branch_id);
          } else if (profile.assigned_branch_ids && profile.assigned_branch_ids.length > 0) {
            setSelectedBranchId(profile.assigned_branch_ids[0]);
          }

          let roleArabicTitle = 'عضو طاقم العمل';
          if (profile.role === 'barber') roleArabicTitle = 'كابتن حلاقة';
          else if (profile.role === 'receptionist') roleArabicTitle = 'موظف استقبال';
          else if (profile.role === 'manager')
            roleArabicTitle = profile.is_super_admin
              ? 'المدير الأساسي (المالك)'
              : 'مدير فرع وشريك';

          toast.success(`أهلاً بك يا ${profile.full_name}! (${roleArabicTitle})`);

          if (profile.role === 'barber') navigate('/barber');
          else if (profile.role === 'receptionist') navigate('/receptionist');
          else if (profile.role === 'manager') navigate('/manager');
          else navigate('/');
          setIsSubmitting(false);
          return;
        }
      }
    } catch (apiErr: any) {
      // Server auth did not find user in backend DB, seamlessly verify against store profiles
      console.log('Server auth check notice, falling back to local staff profiles:', apiErr?.message);
    }

    // 2. Staff Profiles Store Authentication
    const cleanPhoneDigits = cleanId.replace(/\D+/g, '');
    const matchedProfile = profiles.find(
      (p) =>
        (p.email && p.email.toLowerCase().trim() === cleanId.toLowerCase().trim()) ||
        (p.phone && cleanPhoneDigits.length >= 7 && p.phone.replace(/\D+/g, '') === cleanPhoneDigits)
    );

    if (matchedProfile) {
      const envManagerPass = (import.meta as any).env?.VITE_INITIAL_MANAGER_PASSWORD || (import.meta as any).env?.VITE_MANAGER_PASSWORD;
      const isPassValid =
        (matchedProfile.password && matchedProfile.password === password) ||
        (matchedProfile.is_super_admin && envManagerPass && password === envManagerPass);

      if (!isPassValid) {
        toast.error('كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور الخاصة بحسابك.');
        setIsSubmitting(false);
        return;
      }

      setCurrentUser(matchedProfile);
      if (matchedProfile.branch_id) {
        setSelectedBranchId(matchedProfile.branch_id);
      } else if (matchedProfile.assigned_branch_ids && matchedProfile.assigned_branch_ids.length > 0) {
        setSelectedBranchId(matchedProfile.assigned_branch_ids[0]);
      }

      let roleArabicTitle = 'عضو الإدارة';
      if (matchedProfile.role === 'receptionist') roleArabicTitle = 'موظف استقبال';
      else if (matchedProfile.role === 'manager') roleArabicTitle = matchedProfile.is_super_admin ? 'المدير الأساسي (المالك)' : 'مدير فرع وشريك';

      toast.success(`أهلاً بك يا ${matchedProfile.full_name}! (${roleArabicTitle})`);

      if (matchedProfile.role === 'receptionist') {
        navigate('/receptionist');
      } else if (matchedProfile.role === 'manager') {
        navigate('/manager');
      } else {
        navigate('/');
      }
      setIsSubmitting(false);
      return;
    }

    toast.error('بيانات الدخول غير مسجلة. يرجى التأكد من رقم الهاتف أو البريد وكلمة المرور.');
    setIsSubmitting(false);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    sessionStorage.clear();
    switchRole('customer');
    toast.success('تم تسجيل الخروج بنجاح');
    navigate('/');
  };

  if (currentUser.role !== 'customer') {
    const roleArabicTitle =
      currentUser.role === 'manager'
        ? currentUser.is_super_admin
          ? 'المدير العام (المالك)'
          : 'مدير فرع وشريك'
        : 'موظف استقبال';

    const dashboardPath =
      currentUser.role === 'manager'
        ? '/manager'
        : '/receptionist';

    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12 font-sans text-ink">
        <div className="clinic-card w-full max-w-md p-6 sm:p-8 shadow-clinic-3 bg-white/95 space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-forest/10 border border-forest/20 text-forest mx-auto flex items-center justify-center shadow-clinic-1">
            {currentUser.role === 'manager' ? (
              <Shield className="w-8 h-8" />
            ) : (
              <UserCheck className="w-8 h-8" />
            )}
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-mono font-bold text-forest uppercase tracking-wider block">
              جلسة عمل نشطة ومسجلة
            </span>
            <h1 className="font-serif text-2xl font-bold text-ink">
              أهلاً بك، {currentUser.full_name}
            </h1>
            <p className="text-xs text-ink-mute">
              أنت مسجل الدخول حالياً بصلاحية: <strong className="text-forest">{roleArabicTitle}</strong>
            </p>
          </div>

          <div className="pt-2 space-y-3">
            <Link
              to={dashboardPath}
              className="btn-clinic-primary w-full justify-center py-3.5 text-xs font-bold shadow-md inline-flex items-center gap-2"
            >
              <span>الانتقال إلى لوحة العمل</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-3 rounded-xl border border-rose-200 bg-rose-50/80 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95"
            >
              <LogOut className="w-4 h-4 text-rose-600" />
              <span>تسجيل الخروج والتبديل لحساب آخر</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12 font-sans text-ink">
      <div className="clinic-card w-full max-w-md p-6 sm:p-8 shadow-clinic-3 bg-white/95 space-y-6">
        {/* Brand & Security Header */}
        <div className="text-center space-y-2.5">
          <div className="w-14 h-14 rounded-2xl bg-forest text-paper flex items-center justify-center mx-auto shadow-clinic-2">
            <Scissors className="w-7 h-7" />
          </div>
          <span className="text-[10px] font-mono font-bold text-terra uppercase tracking-wider block">
            SECURE MANAGEMENT & RECEPTION ACCESS
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-ink">
            تسجيل دخول الإدارة والاستقبال
          </h1>
          <p className="text-xs text-ink-mute leading-relaxed max-w-xs mx-auto">
            البوابة المخصصة لمديري الفروع والشركاء وموظفي الاستقبال
          </p>
        </div>

        {/* Focused Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-bold text-ink-soft">البريد الإلكتروني أو رقم الهاتف المسجل:</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-ink-mute absolute right-3.5 top-3.5" />
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="مثال: owner@salon.com أو 01012345678"
                className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl pr-10 pl-3 py-3 text-xs text-ink outline-none font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-ink-soft">كلمة المرور:</label>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(true)}
                className="text-[11px] text-terra-deep hover:underline font-bold"
              >
                نسيت كلمة المرور؟
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-ink-mute absolute right-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl pr-10 pl-3 py-3 text-xs text-ink outline-none font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-clinic-primary w-full justify-center py-3.5 text-xs font-bold shadow-md"
          >
            {isSubmitting ? (
              <span>جاري التحقق من الصلاحيات...</span>
            ) : (
              <>
                <span>تسجيل الدخول الآمن</span>
                <ArrowLeft className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Customer Booking Assurance Note */}
        <div className="p-3.5 rounded-2xl bg-paper-warm/80 border border-border text-center space-y-1">
          <p className="text-[11px] text-ink-soft font-semibold">
            هل أنت عميل ترغب في حجز موعد؟
          </p>
          <p className="text-[10px] text-ink-mute">
            يمكنك حجز موعدك وتحديد كرسيك مباشرة دون الحاجة لإنشاء أي حساب.
          </p>
          <div className="pt-1">
            <Link to="/book" className="text-forest font-bold text-xs hover:underline inline-flex items-center gap-1">
              <span>انتقل لحجز موعد جديد الآن</span>
              <span>←</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Forgot Password Security Notice Modal */}
      {isForgotModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsForgotModalOpen(false);
            }
          }}
        >
          <div className="modal-container max-w-md p-6 sm:p-7 shadow-clinic-3 space-y-5 bg-white text-center font-sans text-ink">
            <div className="w-14 h-14 rounded-2xl bg-terra/15 border border-terra/30 text-terra-deep mx-auto flex items-center justify-center shadow-clinic-1">
              <Shield className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="font-serif font-bold text-lg text-ink">
                إعادة تعيين كلمة المرور
              </h3>
              <p className="text-xs text-ink-soft leading-relaxed">
                تواصل مع <strong>المدير العام (المالك)</strong> لإعادة تعيين كلمة السر الخاصة بك للحفاظ على الأمان والتحقق من الصلاحيات الممنوحة لحسابك.
              </p>
            </div>

            {/* Direct Admin Contact Box */}
            <div className="bg-paper-warm p-4 rounded-2xl border border-border space-y-2.5 text-xs text-right">
              <div className="flex items-center justify-between">
                <span className="text-ink-mute">رقم إدارة الصالون المركزية:</span>
                <strong dir="ltr" className="text-forest font-mono font-bold">{superAdminPhone}</strong>
              </div>
              <div className="flex gap-2 pt-1">
                <a
                  href={`tel:${superAdminPhone}`}
                  className="flex-1 py-2 rounded-xl bg-forest text-paper font-bold text-center flex items-center justify-center gap-1.5 hover:bg-forest-soft transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>اتصال مباشر</span>
                </a>
                <a
                  href={`https://wa.me/2${superAdminPhone.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 rounded-xl bg-terra text-paper font-bold text-center flex items-center justify-center gap-1.5 hover:bg-terra-deep transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>محادثة واتساب</span>
                </a>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsForgotModalOpen(false)}
              className="btn-clinic-ghost w-full py-2.5 text-xs font-bold"
            >
              إغلاق النافذة
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
