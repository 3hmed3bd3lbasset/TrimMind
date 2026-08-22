import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Service } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Scissors, Plus, Edit2, Trash2, Clock, Crown, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { showConfirmDialog } from '../../lib/dialogStore';

export const ServiceManager: React.FC = () => {
  const { services, addService, updateService, deleteService } = useSalonStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(180);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [category, setCategory] = useState<Service['category']>('hair');
  const [isVipOnly, setIsVipOnly] = useState(false);

  const openAddModal = () => {
    setEditingService(null);
    setName('');
    setDescription('');
    setPrice(180);
    setDurationMinutes(30);
    setCategory('hair');
    setIsVipOnly(false);
    setIsModalOpen(true);
  };

  const openEditModal = (service: Service) => {
    setEditingService(service);
    setName(service.name);
    setDescription(service.description || '');
    setPrice(service.price);
    setDurationMinutes(service.duration_minutes);
    setCategory(service.category);
    setIsVipOnly(!!service.is_vip_only);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingService) {
      updateService(editingService.id, {
        name,
        description,
        price: Number(price),
        duration_minutes: Number(durationMinutes),
        category,
        is_vip_only: isVipOnly,
      });
      toast.success(`تم تحديث بيانات خدمة "${name}" بنجاح!`);
    } else {
      addService({
        name,
        description,
        price: Number(price),
        duration_minutes: Number(durationMinutes),
        category,
        is_vip_only: isVipOnly,
        is_active: true,
      });
      toast.success('تمت إضافة الخدمة الجديدة بنجاح!');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Scissors className="w-5 h-5 text-forest" />
            <span>كتالوج الخدمات والباقات (Services & Packages)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">إدارة باقات الحلاقة، الأسعار، المدة الزمنية، والفئات</p>
        </div>

        <button
          onClick={openAddModal}
          className="btn-clinic-primary text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة خدمة جديدة</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((s) => (
          <div
            key={s.id}
            className="clinic-card p-5 shadow-clinic-2 bg-white/95 space-y-3 relative group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-serif font-bold text-ink text-sm leading-tight">{s.name}</h4>
                {s.is_vip_only && (
                  <span className="flex items-center gap-1 bg-[#fef3c7] text-[#b45309] border border-[#f59e0b]/30 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0">
                    <Crown className="w-3 h-3 fill-[#f59e0b] text-[#f59e0b]" />
                    <span>VIP</span>
                  </span>
                )}
              </div>

              {s.description && (
                <p className="text-[11px] text-ink-mute leading-relaxed line-clamp-2">
                  {s.description}
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between">
              <div>
                <span className="font-serif font-bold text-forest text-base">
                  {formatCurrency(s.price)}
                </span>
                <span className="text-[11px] text-ink-mute font-mono flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3 text-terra" />
                  <span>{s.duration_minutes} دقيقة</span>
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEditModal(s)}
                  className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-forest hover:bg-paper-deep border border-border transition-colors"
                  title="تعديل الخدمة"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    showConfirmDialog({
                      title: `تأكيد حذف خدمة ${s.name}`,
                      message: `هل أنت متأكد من رغبتك في حذف خدمة "${s.name}" (${formatCurrency(s.price)}) من قائمة الخدمات المتاحة للعملاء؟`,
                      type: 'danger',
                      confirmText: 'نعم، احذف الخدمة',
                      cancelText: 'إلغاء',
                      onConfirm: () => {
                        deleteService(s.id);
                        toast.success(`تم حذف خدمة ${s.name} بنجاح`);
                      },
                    });
                  }}
                  className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-rose-600 hover:bg-rose-50 border border-border transition-colors"
                  title="حذف الخدمة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container max-w-md p-6 sm:p-7 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-forest" />
                <h4 className="font-serif font-bold text-ink text-base">
                  {editingService ? 'تعديل بيانات الخدمة' : 'إضافة خدمة جديدة'}
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
                <label className="font-bold text-ink-soft">اسم الخدمة أو الباقة:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: قص وتصفيف الشعر الكلاسيكي (Signature Cut)"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">وصف الخدمة ومكوناتها:</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="قص شعر احترافي مع غسيل بالشامبو الإيطالي وتصفيف بالسيشوار..."
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">السعر (ج.م):</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">المدة (بالدقائق):</label>
                  <input
                    type="number"
                    required
                    min={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">تصنيف الخدمة:</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                  >
                    <option value="hair">شعر ورأس</option>
                    <option value="beard">لحية وشوارب</option>
                    <option value="skin">عناية وبشرة</option>
                    <option value="vip_package">باقة ملكية VIP</option>
                    <option value="kids">قصات أطفال</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">حصرية VIP:</label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isVipOnly}
                      onChange={(e) => setIsVipOnly(e.target.checked)}
                      className="w-4 h-4 text-forest rounded focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-ink font-bold">باقة VIP خاصة</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="submit"
                  className="btn-clinic-primary flex-1 py-3 text-xs font-bold"
                >
                  {editingService ? 'حفظ التعديلات' : 'إضافة الخدمة'}
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
