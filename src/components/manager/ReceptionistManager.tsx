import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Profile } from '../../types';
import {
  UserPlus,
  Plus,
  Edit2,
  Trash2,
  Building2,
  User,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  Copy,
  Check,
  X,
  Sparkles,
  Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { showConfirmDialog } from '../../lib/dialogStore';

export const ReceptionistManager: React.FC = () => {
  const { profiles, branches, addReceptionist, updateReceptionist, deleteReceptionist } =
    useSalonStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReceptionist, setEditingReceptionist] = useState<Profile | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('010');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});

  // Filter only receptionists from profiles
  const receptionistProfiles = profiles.filter((p) => p.role === 'receptionist');

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
    toast.success('تم توليد كلمة سر عشوائية قوية');
  };

  const openAddModal = () => {
    setEditingReceptionist(null);
    setFullName('');
    setPhone('010');
    setEmail('');
    setPassword('rec123456');
    setBranchId(branches[0]?.id || '');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (rec: Profile) => {
    setEditingReceptionist(rec);
    setFullName(rec.full_name);
    setPhone(rec.phone || '010');
    setEmail(rec.email || '');
    setPassword(rec.password || 'rec123456');
    setBranchId(rec.branch_id || branches[0]?.id || '');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const toggleCardPassword = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyCredentials = (rec: Profile) => {
    const text = `بيانات دخول موظف الاستقبال:\nالاسم: ${rec.full_name}\nالهاتف: ${rec.phone}\nكلمة السر: ${rec.password || 'غير محددة'}`;
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ بيانات الدخول إلى الحافظة');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim()) {
      toast.error('يرجى إدخال اسم الموظف ورقم الهاتف');
      return;
    }

    if (!password.trim()) {
      toast.error('يرجى تحديد كلمة المرور لحساب الاستقبال');
      return;
    }

    if (editingReceptionist) {
      updateReceptionist(editingReceptionist.id, {
        full_name: fullName,
        phone,
        email: email || undefined,
        password,
        branch_id: branchId,
      });
      toast.success(`تم تحديث بيانات موظف الاستقبال "${fullName}" بنجاح!`);
    } else {
      addReceptionist({
        full_name: fullName,
        phone,
        email: email || undefined,
        password,
        role: 'receptionist',
        branch_id: branchId,
      });
      toast.success('تمت إضافة موظف الاستقبال الجديد بنجاح!');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-forest" />
            <span>إدارة موظفي الاستقبال (Receptionists & Front Desk)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">
            إضافة وتعديل موظفي الاستقبال، ربطهم بالفروع، وتعيين كلمات المرور للدخول
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="btn-clinic-primary text-xs font-bold self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة موظف استقبال جديد</span>
        </button>
      </div>

      {/* Receptionists Grid */}
      {receptionistProfiles.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {receptionistProfiles.map((rec) => {
            const branch = branches.find((b) => b.id === rec.branch_id);
            const isPassVisible = !!visiblePasswords[rec.id];

            return (
              <div
                key={rec.id}
                className="clinic-card p-5 shadow-clinic-2 bg-white/95 space-y-4 relative group flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-forest/10 border border-forest/20 text-forest flex items-center justify-center font-bold text-base font-serif shrink-0 shadow-xs">
                      {rec.full_name ? rec.full_name.trim().charAt(0) : <User className="w-6 h-6" />}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="font-serif font-bold text-ink text-sm truncate">
                        {rec.full_name}
                      </h4>
                      <p className="text-[11px] text-forest font-bold flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{branch?.name || 'فرع عام'}</span>
                      </p>
                      {rec.email && (
                        <p className="text-[10px] text-ink-mute truncate flex items-center gap-1">
                          <Mail className="w-3 h-3 text-ink-mute" />
                          <span>{rec.email}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Credentials / Password Box */}
                  <div className="p-3 rounded-xl bg-paper-warm border border-border space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-ink-mute font-bold flex items-center gap-1">
                        <Phone className="w-3 h-3 text-terra" />
                        <span>الهاتف (اسم الدخول):</span>
                      </span>
                      <span className="font-mono font-bold text-ink">{rec.phone || 'غير مسجل'}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/60">
                      <span className="text-ink-mute font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3 text-forest" />
                        <span>كلمة السر:</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-forest bg-white px-2 py-0.5 rounded border border-border text-[11px]">
                          {isPassVisible ? rec.password || 'rec123456' : '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCardPassword(rec.id)}
                          className="p-1 rounded text-ink-mute hover:text-ink transition-colors"
                          title={isPassVisible ? 'إخفاء' : 'إظهار كلمة السر'}
                        >
                          {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <button
                    onClick={() => copyCredentials(rec)}
                    className="btn-clinic-ghost text-xs px-2.5 py-1.5 font-bold flex items-center gap-1 text-ink-soft hover:text-forest"
                    title="نسخ بيانات الدخول"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ الدخول</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEditModal(rec)}
                      className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-forest hover:bg-paper-deep border border-border transition-colors"
                      title="تعديل بيانات الموظف وكلمة السر"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        showConfirmDialog({
                          title: `تأكيد حذف موظف الاستقبال ${rec.full_name}`,
                          message: `هل أنت متأكد من رغبتك في حذف حساب موظف الاستقبال "${rec.full_name}"؟ سيتم إلغاء صلاحية دخوله للنظام فوراً.`,
                          type: 'danger',
                          confirmText: 'نعم، احذف الحساب',
                          cancelText: 'إلغاء',
                          onConfirm: () => {
                            deleteReceptionist(rec.id);
                            toast.success(`تم حذف موظف الاستقبال ${rec.full_name} بنجاح`);
                          },
                        });
                      }}
                      className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-rose-600 hover:bg-rose-50 border border-border transition-colors"
                      title="حذف هذا الموظف"
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
          <UserPlus className="w-12 h-12 text-forest mx-auto opacity-80" />
          <h4 className="font-serif text-base font-bold text-ink">لا يوجد موظفي استقبال مسجلين حالياً</h4>
          <p className="text-xs max-w-md mx-auto">
            اضغط على زر "إضافة موظف استقبال جديد" أعلاه لإنشاء حسابات موظفي الاستقبال وتعيين كلمات المرور لهم.
          </p>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="clinic-card w-full max-w-md p-6 sm:p-7 shadow-clinic-3 space-y-5 bg-white animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-forest" />
                <h4 className="font-serif font-bold text-ink text-base">
                  {editingReceptionist ? 'تعديل بيانات موظف الاستقبال' : 'إضافة موظف استقبال جديد'}
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
                <label className="font-bold text-ink-soft">الاسم الكامل:</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: سارة عبد الله"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">رقم الهاتف (للدخول):</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">الفرع التابع له:</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                  >
                    {branches.map((br) => (
                      <option key={br.id} value={br.id}>
                        {br.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">البريد الإلكتروني (اختياري):</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="reception@salon.com"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                />
              </div>

              {/* Password Section */}
              <div className="space-y-1.5 p-3.5 rounded-2xl bg-paper-warm border border-border">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-ink text-xs flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-forest" />
                    <span>كلمة المرور لتسجيل الدخول:</span>
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
                    placeholder="أدخل كلمة المرور"
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
                  يستخدم الموظف رقم هاتفه (أو البريد) مع كلمة المرور هذه لتسجيل الدخول من صفحة الدخول.
                </p>
              </div>

              <div className="flex gap-2 pt-3 border-t border-border">
                <button
                  type="submit"
                  className="btn-clinic-primary flex-1 py-3 text-xs font-bold"
                >
                  {editingReceptionist ? 'حفظ التعديلات' : 'إضافة الموظف'}
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
