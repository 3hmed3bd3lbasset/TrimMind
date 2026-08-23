import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Profile } from '../../types';
import {
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  Building2,
  User,
  Phone,
  Mail,
  Crown,
  KeyRound,
  Check,
  X,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { showConfirmDialog } from '../../lib/dialogStore';

export const ManagersManager: React.FC = () => {
  const { profiles, branches, addManager, updateManager, deleteManager, currentUser } =
    useSalonStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<Profile | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});

  // Filter only managers from profiles
  const managerProfiles = profiles.filter((p) => p.role === 'manager');

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
    setEditingManager(null);
    setFullName('');
    setPhone('010');
    setEmail('');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let randPass = '';
    for (let i = 0; i < 10; i++) randPass += chars.charAt(Math.floor(Math.random() * chars.length));
    setPassword(randPass);
    setIsSuperAdmin(false);
    setSelectedBranches([branches[0]?.id || '']);
    setShowPassword(true);
    setIsModalOpen(true);
  };

  const openEditModal = (mgr: Profile) => {
    setEditingManager(mgr);
    setFullName(mgr.full_name);
    setPhone(mgr.phone || '');
    setEmail(mgr.email || '');
    setPassword(mgr.password || '');
    setIsSuperAdmin(!!mgr.is_super_admin);
    setSelectedBranches(mgr.assigned_branch_ids || (mgr.branch_id ? [mgr.branch_id] : []));
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const toggleCardPassword = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyCredentials = (mgr: Profile) => {
    const text = `بيانات دخول المدير:\nالاسم: ${mgr.full_name}\nالبريد / الهاتف: ${mgr.email || mgr.phone}\nكلمة السر: ${mgr.password || '••••••••'}`;
    navigator.clipboard.writeText(text);
    toast.success('تم نسخ بيانات الدخول إلى الحافظة');
  };

  const toggleBranchSelection = (branchId: string) => {
    if (selectedBranches.includes(branchId)) {
      if (selectedBranches.length > 1) {
        setSelectedBranches(selectedBranches.filter((id) => id !== branchId));
      } else {
        toast.error('يجب ربط المدير أو الشريك بفرع واحد على الأقل');
      }
    } else {
      setSelectedBranches([...selectedBranches, branchId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    if (editingManager) {
      updateManager(editingManager.id, {
        full_name: fullName,
        phone,
        email,
        password,
        is_super_admin: isSuperAdmin,
        assigned_branch_ids: isSuperAdmin ? undefined : selectedBranches,
        branch_id: isSuperAdmin ? undefined : selectedBranches[0],
      });
      toast.success(`تم تحديث بيانات المدير ${fullName} بنجاح!`);
    } else {
      addManager({
        full_name: fullName,
        phone,
        email,
        password,
        role: 'manager',
        is_super_admin: isSuperAdmin,
        assigned_branch_ids: isSuperAdmin ? undefined : selectedBranches,
        branch_id: isSuperAdmin ? undefined : selectedBranches[0],
      });
      toast.success('تمت إضافة المدير / الشريك الجديد بنجاح!');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Crown className="w-5 h-5 text-forest" />
            <span>المديرين والشركاء وصلاحيات الفروع (Managers & Partners)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">
            إضافة مديرين فرعيين وشركاء وتحديد الفروع المسموح لهم بالاطلاع عليها وإدارتها
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="btn-clinic-primary text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مدير / شريك جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {managerProfiles.map((mgr) => {
          const isMe = mgr.id === currentUser.id;
          const assignedBranchNames = branches
            .filter((b) => mgr.assigned_branch_ids?.includes(b.id) || mgr.branch_id === b.id)
            .map((b) => b.name);

          return (
            <div
              key={mgr.id}
              className={`clinic-card p-5 shadow-clinic-2 bg-white/95 space-y-4 relative group flex flex-col justify-between ${
                isMe ? 'ring-2 ring-forest/30 border-forest' : ''
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-forest/10 text-forest border border-forest/20 flex items-center justify-center shrink-0">
                      {mgr.is_super_admin ? <Crown className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-1.5">
                        <span>{mgr.full_name}</span>
                        {isMe && (
                          <span className="text-[10px] bg-paper-warm text-forest px-2 py-0.5 rounded-full border border-border">
                            أنت
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-ink-mute font-mono">{mgr.email}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      mgr.is_super_admin
                        ? 'bg-forest text-paper border-forest'
                        : 'bg-terra/15 text-terra-deep border-terra/30'
                    }`}
                  >
                    {mgr.is_super_admin ? 'مدير أساسي (مالك)' : 'شريك فرع'}
                  </span>
                </div>

                <div className="bg-paper-warm p-3 rounded-xl border border-border space-y-2 text-[11px]">
                  <p className="font-bold text-ink-soft flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-forest" />
                    <span>الفروع المصرح بها:</span>
                  </p>
                  {mgr.is_super_admin ? (
                    <p className="text-forest font-bold">صلاحية شاملة ومركزية لكافة الفروع</p>
                  ) : assignedBranchNames.length > 0 ? (
                    <p className="text-ink font-medium leading-relaxed">
                      {assignedBranchNames.join('، ')}
                    </p>
                  ) : (
                    <p className="text-terra font-bold">لم يتم ربطه بأي فرع بعد</p>
                  )}

                  {/* Credentials / Password Box */}
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                    <span className="text-ink-mute font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3 text-forest" />
                      <span>كلمة السر:</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-forest bg-white px-2 py-0.5 rounded border border-border text-[11px]">
                        {visiblePasswords[mgr.id] ? mgr.password || 'مشفّرة' : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCardPassword(mgr.id)}
                        className="p-1 rounded text-ink-mute hover:text-ink transition-colors"
                        title={visiblePasswords[mgr.id] ? 'إخفاء' : 'إظهار كلمة السر'}
                      >
                        {visiblePasswords[mgr.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => copyCredentials(mgr)}
                  className="btn-clinic-ghost text-[11px] px-2 py-1 font-bold flex items-center gap-1 text-ink-soft hover:text-forest"
                  title="نسخ بيانات الدخول"
                >
                  <Copy className="w-3 h-3" />
                  <span>نسخ الدخول</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(mgr)}
                    className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-forest hover:bg-paper-deep border border-border transition-colors"
                    title="تعديل بيانات المدير"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {!isMe && (
                    <button
                      onClick={() => {
                        showConfirmDialog({
                          title: `تأكيد حذف المدير ${mgr.full_name}`,
                          message: `هل أنت متأكد من رغبتك في حذف حساب المدير "${mgr.full_name}"؟ سيتم إلغاء وصوله وصلاحياته في المنظومة فوراً.`,
                          type: 'danger',
                          confirmText: 'نعم، احذف المدير',
                          cancelText: 'إلغاء',
                          onConfirm: () => {
                            deleteManager(mgr.id);
                            toast.success(`تم حذف المدير ${mgr.full_name} بنجاح`);
                          },
                        });
                      }}
                      className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-rose-600 hover:bg-rose-50 border border-border transition-colors"
                      title="حذف هذا المدير"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container max-w-md p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-forest" />
                <h4 className="font-serif font-bold text-ink text-base">
                  {editingManager ? 'تعديل بيانات المدير / الشريك' : 'إضافة مدير أو شريك جديد'}
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
                <label className="font-bold text-ink-soft">الاسم كاملاً:</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: أ. طارق منصور"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="partner@salon.com"
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">رقم الهاتف:</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                  />
                </div>
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
              </div>

              <div className="p-3.5 bg-paper-warm rounded-2xl border border-border space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSuperAdmin}
                    onChange={(e) => setIsSuperAdmin(e.target.checked)}
                    className="w-4 h-4 text-forest rounded focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-ink">
                    منح صلاحيات مدير أساسي (Super Admin - وصول كامل لكافة الفروع)
                  </span>
                </label>
              </div>

              {!isSuperAdmin && (
                <div className="space-y-2">
                  <label className="font-bold text-ink-soft block">
                    الفروع المصرح له بالاطلاع عليها وإدارتها:
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 no-scrollbar">
                    {branches.map((b) => {
                      const isSelected = selectedBranches.includes(b.id);
                      return (
                        <div
                          key={b.id}
                          onClick={() => toggleBranchSelection(b.id)}
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between text-xs transition-all ${
                            isSelected
                              ? 'bg-forest/10 border-forest text-forest font-bold'
                              : 'bg-paper-warm border-border text-ink-soft hover:border-forest/40'
                          }`}
                        >
                          <span className="truncate">{b.name}</span>
                          {isSelected && <Check className="w-4 h-4 text-forest shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="submit"
                  className="btn-clinic-primary flex-1 py-3 text-xs font-bold"
                >
                  {editingManager ? 'حفظ التعديلات' : 'إضافة المدير'}
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
