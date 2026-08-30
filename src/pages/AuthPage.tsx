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
  Key,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import { api } from '../lib/api';

export default function AuthPage() {
  const { profiles, barbers, branches, currentUser, switchRole, setCurrentUser, setSelectedBranchId, settings } = useSalonStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  // Forgot Password / Brevo OTP States
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2 | 3>(1);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetChannel, setResetChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  useBodyScrollLock(isForgotModalOpen);

  useEffect(() => {
    if (!isForgotModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsForgotModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isForgotModalOpen]);

  // Resend OTP Countdown Timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const interval = setInterval(() => {
      setResendCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCountdown]);

  const openForgotModal = () => {
    setResetIdentifier(identifier.trim());
    setResetStep(1);
    setOtpCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setIsForgotModalOpen(true);
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = resetIdentifier.trim();
    if (!cleanId) {
      toast.error('يرجى إدخال البريد الإلكتروني أو رقم الهاتف');
      return;
    }

    setIsResetSubmitting(true);
    try {
      const res: any = await api.forgotPassword({ identifier: cleanId });
      if (res && res.success) {
        setResetChannel(res.data?.channel || 'email');
        setMaskedTarget(res.data?.maskedTarget || cleanId);
        setResetStep(2);
        setResendCountdown(60);
        toast.success(res.message || 'تم إرسال رمز التحقق OTP بنجاح');
      } else {
        toast.error(res?.error || 'تعذر إرسال رمز التحقق');
      }
    } catch (err: any) {
      toast.error(err?.message || 'لم يتم العثور على هذا الحساب بالمنظومة');
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6) {
      toast.error('رمز التحقق يجب أن يتكون من 6 أرقام');
      return;
    }

    setIsResetSubmitting(true);
    try {
      const res: any = await api.verifyOtp({
        identifier: resetIdentifier.trim(),
        otp: cleanOtp,
      });
      if (res && res.success) {
        setResetStep(3);
        toast.success('تم تأكيد الرمز بنجاح! أدخل كلمة المرور الجديدة');
      } else {
        toast.error(res?.error || 'رمز التحقق غير صحيح');
      }
    } catch (err: any) {
      toast.error(err?.message || 'رمز التحقق غير صحيح أو قد انتهت صلاحيته');
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error('كلمة المرور الجديدة يجب أن تحتوي على 6 أحرف على الأقل');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsResetSubmitting(true);
    try {
      const res: any = await api.resetPassword({
        identifier: resetIdentifier.trim(),
        otp: otpCode.trim(),
        newPassword: newPassword,
      });

      if (res && res.success) {
        toast.success('تم تغيير كلمة المرور بنجاح! جاري تسجيل دخولك...');
        // Auto populate login fields
        setIdentifier(resetIdentifier.trim());
        setPassword(newPassword);
        setIsForgotModalOpen(false);

        // Attempt instant auto login
        try {
          const loginRes: any = await api.login({
            identifier: resetIdentifier.trim(),
            password: newPassword,
          });
          if (loginRes?.success && loginRes?.data?.user) {
            const { user } = loginRes.data;
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
            if (profile.branch_id) setSelectedBranchId(profile.branch_id);
            if (profile.role === 'barber') navigate('/barber');
            else if (profile.role === 'receptionist') navigate('/receptionist');
            else if (profile.role === 'manager') navigate('/manager');
          }
        } catch {
          // If auto login fails, user can just click login button
        }
      } else {
        toast.error(res?.error || 'تعذر إعادة تعيين كلمة المرور');
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setIsResetSubmitting(false);
    }
  };

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

      {/* Brevo OTP Password Reset Dynamic Modal */}
      {isForgotModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsForgotModalOpen(false);
            }
          }}
        >
          <div className="modal-container max-w-md p-6 sm:p-7 shadow-clinic-3 space-y-5 bg-white text-right font-sans text-ink relative">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsForgotModalOpen(false)}
              className="absolute left-4 top-4 p-1.5 rounded-full hover:bg-paper-warm text-ink-mute hover:text-ink transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="text-center space-y-2 pt-1">
              <div className="w-14 h-14 rounded-2xl bg-forest/10 border border-forest/20 text-forest mx-auto flex items-center justify-center shadow-clinic-1">
                {resetStep === 1 && <Key className="w-7 h-7" />}
                {resetStep === 2 && <Shield className="w-7 h-7 text-terra" />}
                {resetStep === 3 && <Lock className="w-7 h-7 text-forest" />}
              </div>

              <div>
                <span className="text-[10px] font-mono font-bold text-terra uppercase tracking-wider block">
                  BREVO OTP VERIFICATION
                </span>
                <h3 className="font-serif font-bold text-lg text-ink">
                  {resetStep === 1 && 'استعادة كلمة المرور'}
                  {resetStep === 2 && 'إدخال رمز التحقق OTP'}
                  {resetStep === 3 && 'تعيين كلمة المرور الجديدة'}
                </h3>
              </div>

              {/* Progress Steps Indicator */}
              <div className="flex items-center justify-center gap-2 pt-1">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      resetStep === step
                        ? 'w-8 bg-forest'
                        : resetStep > step
                        ? 'w-4 bg-forest/40'
                        : 'w-4 bg-border'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* STEP 1: Enter Identifier */}
            {resetStep === 1 && (
              <form onSubmit={handleRequestOtp} className="space-y-4 text-xs">
                <p className="text-ink-soft text-center leading-relaxed">
                  أدخل بريدك الإلكتروني أو رقم هاتفك المسجل، وسيصلك رمز تحقق <strong>(OTP)</strong> فوري لتأكيد هويتك.
                </p>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink-soft">البريد الإلكتروني أو الهاتف:</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-ink-mute absolute right-3.5 top-3.5" />
                    <input
                      type="text"
                      required
                      autoFocus
                      value={resetIdentifier}
                      onChange={(e) => setResetIdentifier(e.target.value)}
                      placeholder="مثال: owner@salon.com أو 01012345678"
                      className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl pr-10 pl-3 py-3 text-xs text-ink outline-none font-mono"
                    />
                  </div>
                  <p className="text-[10.5px] text-ink-mute">
                    💡 سيميز النظام تلقائياً لإرسال الرمز عبر البريد أو الرسائل القصيرة (SMS/WhatsApp).
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isResetSubmitting || !resetIdentifier.trim()}
                  className="btn-clinic-primary w-full justify-center py-3.5 text-xs font-bold shadow-md"
                >
                  {isResetSubmitting ? (
                    <span>جاري إرسال رمز التحقق...</span>
                  ) : (
                    <>
                      <span>إرسال رمز التحقق (OTP)</span>
                      <ArrowLeft className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 2: Enter 6-Digit OTP */}
            {resetStep === 2 && (
              <form onSubmit={handleVerifyOtp} className="space-y-4 text-xs">
                <div className="bg-paper-warm p-3.5 rounded-2xl border border-border text-center space-y-1">
                  <p className="text-[11.5px] text-ink-soft">
                    تم إرسال رمز التحقق المكون من 6 أرقام إلى:
                  </p>
                  <p className="font-mono font-bold text-forest text-sm dir-ltr">
                    {maskedTarget}
                  </p>
                  <p className="text-[10px] text-ink-mute">
                    {resetChannel === 'email' ? '📧 عبر البريد الإلكتروني' : '📱 عبر الرسائل النصية (SMS)'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink-soft block text-center">أدخل رمز التحقق (6 أرقام):</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, ''))}
                    placeholder="123456"
                    className="w-full bg-paper-warm border-2 border-forest/40 focus:border-forest rounded-2xl py-3.5 text-center font-mono font-extrabold text-2xl tracking-[8px] text-ink outline-none shadow-xs"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] px-1">
                  <button
                    type="button"
                    onClick={() => setResetStep(1)}
                    className="text-ink-mute hover:text-ink underline"
                  >
                    تغيير البريد / الرقم
                  </button>

                  {resendCountdown > 0 ? (
                    <span className="text-ink-mute font-mono">
                      إعادة الإرسال بعد ({resendCountdown} ث)
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRequestOtp()}
                      disabled={isResetSubmitting}
                      className="text-terra-deep font-bold hover:underline inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>إعادة إرسال الرمز</span>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isResetSubmitting || otpCode.trim().length !== 6}
                  className="btn-clinic-primary w-full justify-center py-3.5 text-xs font-bold shadow-md"
                >
                  {isResetSubmitting ? (
                    <span>جاري التحقق من الرمز...</span>
                  ) : (
                    <>
                      <span>تأكيد الرمز والمتابعة</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* STEP 3: Enter New Password */}
            {resetStep === 3 && (
              <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
                <p className="text-ink-soft text-center leading-relaxed">
                  تم التحقق من هويتك بنجاح! يرجى إدخال كلمة المرور الجديدة لحسابك.
                </p>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="font-bold text-ink-soft">كلمة المرور الجديدة:</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-ink-mute absolute right-3.5 top-3.5" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        autoFocus
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="•••••••• (6 أحرف على الأقل)"
                        className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl pr-10 pl-10 py-3 text-xs text-ink outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute left-3 top-3 text-ink-mute hover:text-ink"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-ink-soft">تأكيد كلمة المرور الجديدة:</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-ink-mute absolute right-3.5 top-3.5" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl pr-10 pl-10 py-3 text-xs text-ink outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResetSubmitting || !newPassword || newPassword.length < 6 || newPassword !== confirmNewPassword}
                  className="btn-clinic-primary w-full justify-center py-3.5 text-xs font-bold shadow-md"
                >
                  {isResetSubmitting ? (
                    <span>جاري حفظ كلمة المرور...</span>
                  ) : (
                    <>
                      <span>حفظ كلمة المرور وتأكيد الدخول</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Direct Admin Contact Footer */}
            <div className="border-t border-border pt-3 text-center">
              <p className="text-[10.5px] text-ink-mute">
                هل تواجه صعوبة؟ تواصل مع المالك:{' '}
                <a href={`tel:${superAdminPhone}`} className="text-forest font-bold hover:underline">
                  {superAdminPhone}
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
