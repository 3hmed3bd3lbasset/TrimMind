import React, { useState, useEffect } from 'react';
import { useSalonStore } from '../../lib/store';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { Barber } from '../../types';
import {
  UserCheck,
  Plus,
  Edit2,
  Trash2,
  Star,
  Upload,
  Scissors,
  X,
  Phone,
  User,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Mail,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { processHighQualityPhoto } from '../../lib/utils';
import { showConfirmDialog } from '../../lib/dialogStore';

export const BarberManager: React.FC = () => {
  const { barbers, branches, profiles, addBarber, updateBarber, deleteBarber, clearAllBarbers } =
    useSalonStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);

  useBodyScrollLock(isModalOpen);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('011');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [specialty, setSpecialty] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
    toast.success('تم توليد كلمة سر عشوائية قوية للكابتن');
  };

  const openAddModal = () => {
    setEditingBarber(null);
    setFullName('');
    setPhone('011');
    setEmail('');
    setPassword('barber123456');
    setBranchId(branches[0]?.id || '');
    setSpecialty('');
    setPhotoUrl('https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (barber: Barber) => {
    setEditingBarber(barber);
    setFullName(barber.full_name);
    setPhone(barber.phone || '011');
    const matchedProfile = profiles.find((p) => p.barber_id === barber.id || p.phone === barber.phone);
    setEmail(barber.email || matchedProfile?.email || '');
    setPassword(barber.password || matchedProfile?.password || 'barber123456');
    setBranchId(barber.branch_id);
    setSpecialty(barber.specialty || '');
    setPhotoUrl(barber.photo_url || '');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const toggleCardPassword = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyCredentials = (barber: Barber) => {
    const matchedProfile = profiles.find((p) => p.barber_id === barber.id || p.phone === barber.phone);
    const pass = barber.password || matchedProfile?.password || 'barber123456';
    const text = `بيانات دخول الكابتن (حلاق الصالون):\nالاسم: ${barber.full_name}\nالهاتف: ${barber.phone}\nكلمة السر: ${pass}`;
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ بيانات دخول الكابتن إلى الحافظة');
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading('جاري معالجة وضبط الصورة بأعلى جودة...');
    try {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          setPhotoUrl(result);
        }
      };
      reader.readAsDataURL(file);

      const hdPhotoData = await processHighQualityPhoto(file, 1600, 0.92).catch(() => null);
      if (hdPhotoData) {
        setPhotoUrl(hdPhotoData);
      }
      setIsUploading(false);
      toast.success('تمت معالجة وضبط صورة الكابتن بنجاح ✨', { id: toastId });
    } catch (err) {
      console.error('Error processing high-res barber photo:', err);
      setIsUploading(false);
      toast.error('تعذر معالجة الصورة، يرجى المحاولة مرة أخرى', { id: toastId });
    }
  };

  const handleClearAll = () => {
    showConfirmDialog({
      title: 'تأكيد إخلاء قائمة الحلاقين',
      message: 'هل أنت متأكد من حذف جميع الحلاقين لإضافة فريق العمل الخاص بك من البداية؟',
      type: 'danger',
      confirmText: 'نعم، إخلاء القائمة',
      cancelText: 'تراجع',
      onConfirm: () => {
        clearAllBarbers();
        toast.success('تم إخلاء قائمة الحلاقين بنجاح! يمكنك الآن إضافة حلاقيك الحقيقيين.');
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      toast.error('يرجى إدخال اسم الكابتن ورقم الهاتف');
      return;
    }

    if (!password.trim()) {
      toast.error('يرجى تعيين كلمة المرور لحساب الكابتن');
      return;
    }

    if (editingBarber) {
      updateBarber(editingBarber.id, {
        full_name: fullName,
        phone,
        email: email || undefined,
        password,
        branch_id: branchId,
        specialty,
        photo_url: photoUrl,
      });
      toast.success(`تم حفظ وتحديث بيانات الكابتن ${fullName} وكلمة المرور بنجاح!`);
    } else {
      addBarber({
        full_name: fullName,
        phone,
        email: email || undefined,
        password,
        branch_id: branchId,
        specialty,
        photo_url: photoUrl,
        is_active: true,
      });
      toast.success('تمت إضافة الكابتن الجديد وتعيين كلمة المرور بنجاح!');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-forest" />
            <span>إدارة الحلاقين وفريق العمل (Staff & Barbers)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">إضافة وتعديل وحذف الحلاقين ورفع صورهم الحقيقية وربطهم بالفروع</p>
        </div>

        <div className="flex items-center gap-2">
          {barbers.length > 0 && (
            <button
              onClick={handleClearAll}
              className="btn-clinic-ghost text-xs text-terra hover:bg-terra/10 border-terra/30 font-bold"
              title="حذف كل الحلاقين"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف الكل والبدء من الصفر</span>
            </button>
          )}

          <button
            onClick={openAddModal}
            className="btn-clinic-primary text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة كابتن حلاق جديد</span>
          </button>
        </div>
      </div>

      {barbers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {barbers.map((b) => {
            const branch = branches.find((br) => br.id === b.branch_id);
            return (
              <div
                key={b.id}
                className="clinic-card p-5 shadow-clinic-2 bg-white/95 space-y-4 relative group flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3.5">
                    {b.photo_url ? (
                      <img
                        key={`${b.id}-${b.photo_url}`}
                        src={b.photo_url}
                        alt={b.full_name}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallbackEl = e.currentTarget.parentElement?.querySelector('.avatar-placeholder');
                          if (fallbackEl) (fallbackEl as HTMLElement).style.display = 'flex';
                        }}
                        className="w-16 h-16 rounded-2xl object-cover border border-border shrink-0 shadow-xs bg-paper-warm"
                      />
                    ) : null}
                    <div
                      style={{ display: b.photo_url ? 'none' : 'flex' }}
                      className="avatar-placeholder w-16 h-16 rounded-2xl bg-forest/10 border border-forest/20 text-forest flex items-center justify-center font-bold text-lg font-serif shrink-0 shadow-xs"
                    >
                      {b.full_name ? b.full_name.trim().charAt(0) : <User className="w-7 h-7" />}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="font-serif font-bold text-ink text-sm truncate">{b.full_name}</h4>
                      <p className="text-[11px] text-forest font-bold">{branch?.name || 'غير محدد'}</p>
                      <p className="text-[11px] text-ink-mute line-clamp-1">{b.specialty}</p>
                    </div>
                  </div>

                  {/* Credentials / Password Box */}
                  <div className="p-3 rounded-xl bg-paper-warm border border-border space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-ink-mute font-bold flex items-center gap-1">
                        <Phone className="w-3 h-3 text-terra" />
                        <span>الهاتف (اسم الدخول):</span>
                      </span>
                      <span className="font-mono font-bold text-ink">{b.phone || 'غير مسجل'}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/60">
                      <span className="text-ink-mute font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3 text-forest" />
                        <span>كلمة السر:</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const matchedProf = profiles.find((p) => p.barber_id === b.id || p.phone === b.phone);
                          const pass = b.password || matchedProf?.password || 'barber123456';
                          const isPassVis = !!visiblePasswords[b.id];
                          return (
                            <>
                              <span className="font-mono font-bold text-forest bg-white px-2 py-0.5 rounded border border-border text-[11px]">
                                {isPassVis ? pass : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleCardPassword(b.id)}
                                className="p-1 rounded text-ink-mute hover:text-ink transition-colors"
                                title={isPassVis ? 'إخفاء' : 'إظهار كلمة السر'}
                              >
                                {isPassVis ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-bold text-xs text-[#b45309]">
                      <Star className="w-3.5 h-3.5 fill-[#f59e0b] text-[#f59e0b]" />
                      <span className="font-mono">{b.rating || 4.9}</span>
                      <span className="text-ink-mute text-[10px] font-mono">({b.rating_count || 50})</span>
                    </span>

                    <button
                      onClick={() => copyCredentials(b)}
                      className="btn-clinic-ghost text-[11px] px-2 py-1 font-bold flex items-center gap-1 text-ink-soft hover:text-forest"
                      title="نسخ بيانات الدخول"
                    >
                      <Copy className="w-3 h-3" />
                      <span>نسخ الدخول</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditModal(b)}
                      className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-forest hover:bg-paper-deep border border-border transition-colors"
                      title="تعديل بيانات الحلاق وكلمة السر والصورة"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        showConfirmDialog({
                          title: `تأكيد حذف الحلاق ${b.full_name}`,
                          message: `هل أنت متأكد من رغبتك في حذف الكابتن "${b.full_name}"؟ سيتم إلغاء تعيينه من الكراسي والحجوزات غير المكتملة.`,
                          type: 'danger',
                          confirmText: 'نعم، احذف الحلاق',
                          cancelText: 'إلغاء',
                          onConfirm: () => {
                            deleteBarber(b.id);
                            toast.success(`تم حذف الحلاق ${b.full_name} بنجاح`);
                          },
                        });
                      }}
                      className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-rose-600 hover:bg-rose-50 border border-border transition-colors"
                      title="حذف هذا الحلاق"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="clinic-card border-dashed border-2 border-border p-12 text-center text-ink-mute space-y-3 bg-white">
          <UserCheck className="w-12 h-12 text-forest mx-auto opacity-80" />
          <h4 className="font-serif text-base font-bold text-ink">لا يوجد حلاقين مسجلين حالياً</h4>
          <p className="text-xs max-w-md mx-auto">
            اضغط على زر "إضافة كابتن حلاق جديد" أعلاه لإدخال أسماء حلاقي الصالون وتعيين كلمات المرور ورفع صورهم.
          </p>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <div className="modal-container max-w-md p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-forest" />
                <h4 className="font-serif font-bold text-ink text-base">
                  {editingBarber ? 'تعديل بيانات الكابتن وكلمة المرور' : 'إضافة كابتن حلاق جديد'}
                </h4>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-ink-mute hover:text-ink rounded-xl bg-paper-warm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="font-bold text-ink-soft">الاسم كاملاً واللقب:</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: كابتن أحمد عبدالباسط"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">الفرع التابع له:</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">رقم الهاتف (اسم الدخول):</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01285694670"
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">البريد الإلكتروني (اختياري):</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="barber@salon.com"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">التخصص والمهارة المميزة:</label>
                <input
                  type="text"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="مثال: قصات كلاسيكية ونحت اللحية الملكية"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              {/* Password Section */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-paper-warm border border-border">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-ink text-xs flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-forest" />
                    <span>كلمة المرور لدخول الكابتن إلى البروفايل:</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[10px] text-forest font-bold hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>توليد تلقائي</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور للكابتن"
                    className="w-full bg-white border border-border focus:border-forest rounded-xl px-3 py-2.5 pl-10 text-xs text-ink outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-3 text-ink-mute hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-ink-mute">
                  يستخدم الكابتن رقم هاتفه مع كلمة المرور هذه لتسجيل الدخول إلى بروفايله ولوحة تحكم الكراسي.
                </p>
              </div>

              {/* Image Upload */}
              <div className="space-y-1.5">
                <label className="font-bold text-ink-soft">صورة الحلاق (HD فائق الدقة):</label>
                <div className="flex items-center gap-3">
                  {photoUrl && photoUrl.trim() !== '' && (
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-border shadow-xs shrink-0 bg-paper-warm flex items-center justify-center">
                      <img
                        src={photoUrl}
                        alt={fullName || 'صورة الكابتن'}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&auto=format&fit=crop&q=80';
                        }}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <label className="flex-1 py-2.5 px-3 rounded-xl border border-dashed border-forest bg-forest/5 hover:bg-forest/10 text-forest font-bold text-center cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
                    <Upload className="w-4 h-4" />
                    <span>{isUploading ? 'جاري التحميل...' : 'رفع صورة الحلاق'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-border">
                <button
                  type="submit"
                  className="btn-clinic-primary flex-1 py-3 text-xs font-bold"
                >
                  {editingBarber ? 'حفظ التعديلات' : 'إضافة الحلاق'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-clinic-ghost text-xs px-5 font-bold"
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
};
