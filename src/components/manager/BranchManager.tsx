import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Branch } from '../../types';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Phone,
  Clock,
  Upload,
  CreditCard,
  X,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { processHighQualityPhoto } from '../../lib/utils';
import { showConfirmDialog } from '../../lib/dialogStore';

export const BranchManager: React.FC = () => {
  const { branches, addBranch, updateBranch, deleteBranch, clearAllBranches } = useSalonStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [openingTime, setOpeningTime] = useState('10:00');
  const [closingTime, setClosingTime] = useState('23:00');
  const [imageUrl, setImageUrl] = useState('');
  const [instapayUsername, setInstapayUsername] = useState('');
  const [vodafoneCashNumber, setVodafoneCashNumber] = useState('');
  const [bankAccountInfo, setBankAccountInfo] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const openAddModal = () => {
    setEditingBranch(null);
    setName('');
    setAddress('');
    setPhone('010');
    setOpeningTime('10:00');
    setClosingTime('23:00');
    setImageUrl('https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&auto=format&fit=crop&q=80');
    setInstapayUsername('');
    setVodafoneCashNumber('');
    setBankAccountInfo('');
    setIsModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setName(branch.name);
    setAddress(branch.address);
    setPhone(branch.phone);
    setOpeningTime(branch.opening_time);
    setClosingTime(branch.closing_time);
    setImageUrl(branch.image_url || '');
    setInstapayUsername(branch.instapay_username || '');
    setVodafoneCashNumber(branch.vodafone_cash_number || '');
    setBankAccountInfo(branch.bank_account_info || '');
    setIsModalOpen(true);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading('جاري معالجة وضبط صورة الفرع بأعلى جودة (HD)...');
    try {
      const hdBranchData = await processHighQualityPhoto(file, 1800, 0.92);
      setImageUrl(hdBranchData);
      setIsUploading(false);
      toast.success('تم تحميل وتعيين صورة الفرع بدقة HD بنجاح ✨', { id: toastId });
    } catch (err) {
      console.error('Error processing high-res branch image:', err);
      setIsUploading(false);
      toast.error('تعذر معالجة الصورة، يرجى المحاولة مجدداً', { id: toastId });
    }
  };

  const handleClearAll = () => {
    if (window.confirm('هل أنت متأكد من حذف كافة الفروع التجريبية لإضافة فروع صالونك الحقيقية؟')) {
      clearAllBranches();
      toast.success('تم إخلاء قائمة الفروع. يمكنك الآن إضافة فرعك الأول');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingBranch) {
      updateBranch(editingBranch.id, {
        name,
        address,
        phone,
        opening_time: openingTime,
        closing_time: closingTime,
        image_url: imageUrl,
        instapay_username: instapayUsername,
        vodafone_cash_number: vodafoneCashNumber,
        bank_account_info: bankAccountInfo,
      });
      toast.success(`تم تحديث بيانات الفرع "${name}" بنجاح!`);
    } else {
      addBranch({
        name,
        address,
        phone,
        opening_time: openingTime,
        closing_time: closingTime,
        image_url: imageUrl,
        instapay_username: instapayUsername,
        vodafone_cash_number: vodafoneCashNumber,
        bank_account_info: bankAccountInfo,
        is_active: true,
      });
      toast.success('تمت إضافة الفرع الجديد وتفاصيل الدفع بنجاح!');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Building2 className="w-5 h-5 text-forest" />
            <span>إدارة الفروع والمواقع (Branches Management)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">إضافة الفروع وتحديد بيانات الدفع والحسابات الخاصة بكل فرع</p>
        </div>

        <div className="flex items-center gap-2">
          {branches.length > 0 && (
            <button
              onClick={handleClearAll}
              className="btn-clinic-ghost text-xs text-terra hover:bg-terra/10 border-terra/30 font-bold"
              title="إخلاء الفروع والبدء من جديد"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف الفروع والبدء من الصفر</span>
            </button>
          )}

          <button
            onClick={openAddModal}
            className="btn-clinic-primary text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة فرع جديد</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {branches.map((b) => (
          <div
            key={b.id}
            className="clinic-card p-5 shadow-clinic-2 bg-white/95 space-y-4 relative group flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="relative h-44 rounded-2xl overflow-hidden border border-border bg-paper-warm">
                <img
                  src={b.image_url || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&auto=format&fit=crop&q=80'}
                  alt={b.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-border shadow-sm">
                  <span className="text-[11px] font-bold text-forest">{b.name}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <p className="text-ink-mute flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-terra shrink-0" />
                  <span className="truncate">{b.address}</span>
                </p>
                <p className="text-ink-soft flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5 text-forest shrink-0" />
                  <span>{b.phone}</span>
                </p>
                <p className="text-ink-mute flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-forest shrink-0" />
                  <span>يومياً من {b.opening_time} حتى {b.closing_time}</span>
                </p>
              </div>

              {/* Payment Details Box */}
              <div className="bg-paper-warm p-3 rounded-xl border border-border text-[11px] space-y-1">
                <p className="font-bold text-forest flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>بيانات الدفع المربوطة بالفرع:</span>
                </p>
                <p className="text-ink-soft">
                  إنستاباي: <strong className="font-mono text-ink">{b.instapay_username || 'غير مسجل'}</strong>
                </p>
                <p className="text-ink-soft">
                  فودافون كاش: <strong className="font-mono text-ink">{b.vodafone_cash_number || 'غير مسجل'}</strong>
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => openEditModal(b)}
                className="btn-clinic-ghost text-xs px-3 py-2 font-bold"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>تعديل</span>
              </button>
              <button
                onClick={() => {
                  showConfirmDialog({
                    title: `تأكيد حذف فرع ${b.name}`,
                    message: `هل أنت متأكد من رغبتك في حذف فرع "${b.name}"؟ سيتم إلغاء ربط الكراسي والحسابات المرتبطة به.`,
                    type: 'danger',
                    confirmText: 'نعم، احذف الفرع',
                    cancelText: 'إلغاء',
                    onConfirm: () => {
                      deleteBranch(b.id);
                      toast.success(`تم حذف فرع ${b.name} بنجاح`);
                    },
                  });
                }}
                className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-rose-600 hover:bg-rose-50 border border-border transition-colors"
                title="حذف هذا الفرع"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container max-w-lg p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-forest" />
                <h4 className="font-serif font-bold text-ink text-base">
                  {editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}
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
                <label className="font-bold text-ink-soft">اسم الفرع:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: فرع التجمع الخامس - VIP Lounge"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">العنوان التفصيلي:</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="شارع التسعين الشمالي، مول النخبة..."
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">رقم هاتف الفرع (خدمة العملاء):</label>
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
                  <label className="font-bold text-ink-soft">ساعات العمل:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={openingTime}
                      onChange={(e) => setOpeningTime(e.target.value)}
                      placeholder="10:00"
                      className="w-1/2 bg-paper-warm border border-border focus:border-forest rounded-xl px-2 py-2.5 text-xs text-center font-mono"
                    />
                    <input
                      type="text"
                      value={closingTime}
                      onChange={(e) => setClosingTime(e.target.value)}
                      placeholder="23:00"
                      className="w-1/2 bg-paper-warm border border-border focus:border-forest rounded-xl px-2 py-2.5 text-xs text-center font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="p-4 rounded-2xl bg-paper-warm border border-border space-y-3">
                <h5 className="font-serif font-bold text-forest text-xs">تفاصيل الحسابات البنكية والإلكترونية للفرع:</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-ink-soft">عنوان إنستاباي (InstaPay):</label>
                    <input
                      type="text"
                      value={instapayUsername}
                      onChange={(e) => setInstapayUsername(e.target.value)}
                      placeholder="branch.vip@instapay"
                      className="w-full bg-white border border-border focus:border-forest rounded-xl px-3 py-2 text-xs font-mono outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-ink-soft">رقم فودافون كاش:</label>
                    <input
                      type="text"
                      value={vodafoneCashNumber}
                      onChange={(e) => setVodafoneCashNumber(e.target.value)}
                      placeholder="01012345678"
                      className="w-full bg-white border border-border focus:border-forest rounded-xl px-3 py-2 text-xs font-mono outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Image Upload */}
              <div className="space-y-1.5">
                <label className="font-bold text-ink-soft">صورة واجهة الفرع:</label>
                <div className="flex items-center gap-3">
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="w-14 h-14 rounded-2xl object-cover border border-border shadow-xs shrink-0"
                    />
                  )}
                  <label className="flex-1 py-2.5 px-3 rounded-xl border border-dashed border-forest bg-forest/5 hover:bg-forest/10 text-forest font-bold text-center cursor-pointer flex items-center justify-center gap-1.5 transition-colors">
                    <Upload className="w-4 h-4" />
                    <span>{isUploading ? 'جاري التحميل...' : 'رفع صورة الفرع'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="submit"
                  className="btn-clinic-primary flex-1 py-3 text-xs font-bold"
                >
                  {editingBranch ? 'حفظ التعديلات' : 'إضافة الفرع'}
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
