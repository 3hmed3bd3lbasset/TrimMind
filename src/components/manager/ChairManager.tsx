import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Chair, ChairMode } from '../../types';
import { Armchair, Plus, Edit2, Trash2, Crown, Sparkles, Building2, X, Scissors } from 'lucide-react';
import toast from 'react-hot-toast';
import { showConfirmDialog } from '../../lib/dialogStore';

export const ChairManager: React.FC = () => {
  const { chairs, branches, barbers, addChair, updateChair, deleteChair } = useSalonStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChair, setEditingChair] = useState<Chair | null>(null);

  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [barberId, setBarberId] = useState(barbers[0]?.id || '');
  const [mode, setMode] = useState<ChairMode>('normal');

  const openAddModal = () => {
    setEditingChair(null);
    setName('');
    setBranchId(branches[0]?.id || '');
    setBarberId(barbers[0]?.id || '');
    setMode('normal');
    setIsModalOpen(true);
  };

  const openEditModal = (chair: Chair) => {
    setEditingChair(chair);
    setName(chair.name);
    setBranchId(chair.branch_id);
    setBarberId(chair.barber_id || '');
    setMode(chair.mode);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingChair) {
      updateChair(editingChair.id, {
        name,
        branch_id: branchId,
        barber_id: barberId,
        mode,
      });
      toast.success(`تم تحديث بيانات ${name} بنجاح!`);
    } else {
      addChair({
        name,
        branch_id: branchId,
        barber_id: barberId,
        mode,
        is_active: true,
      });
      toast.success('تمت إضافة الكرسي الجديد بنجاح!');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Armchair className="w-5 h-5 text-forest" />
            <span>إدارة كراسي ومحطات الصالون (Chairs & Stations)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">تخصيص الكراسي للفروع، وضع VIP، وتعيين الحلاق المسؤول</p>
        </div>

        <button
          onClick={openAddModal}
          className="btn-clinic-primary text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة كرسي جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {chairs.map((c) => {
          const branch = branches.find((b) => b.id === c.branch_id);
          const barber = barbers.find((b) => b.id === c.barber_id);
          return (
            <div
              key={c.id}
              className="clinic-card p-5 shadow-clinic-2 bg-white/95 space-y-4 relative group flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-serif font-bold text-ink text-sm">{c.name}</h4>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      c.mode === 'vip'
                        ? 'bg-[#fef3c7] text-[#b45309] border-[#f59e0b]/30'
                        : c.mode === 'both'
                        ? 'bg-forest/15 text-forest border-forest/30'
                        : 'bg-paper-deep text-ink border-border'
                    }`}
                  >
                    {c.mode === 'vip' ? 'جناح VIP الملكي' : c.mode === 'both' ? 'عادي + VIP' : 'تجربة عادية'}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-ink-soft">
                  <p className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-forest" />
                    <span>{branch?.name || 'غير مخصص لفرع'}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-terra" />
                    <span>الكابتن المسؤول: <strong className="text-ink">{barber?.full_name || 'غير محدد'}</strong></span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    c.status === 'in_service'
                      ? 'bg-forest text-paper'
                      : c.status === 'cleaning'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-paper-warm text-forest border border-forest/20'
                  }`}
                >
                  {c.status === 'in_service' ? 'مشغول حالياً' : c.status === 'cleaning' ? 'قيد التعقيم' : 'شاغر ومتاح'}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEditModal(c)}
                    className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-forest hover:bg-paper-deep border border-border transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      showConfirmDialog({
                        title: `تأكيد حذف الكرسي ${c.name}`,
                        message: `هل أنت متأكد من رغبتك في حذف كرسي "${c.name}" من الفرع؟`,
                        type: 'danger',
                        confirmText: 'نعم، احذف الكرسي',
                        cancelText: 'إلغاء',
                        onConfirm: () => {
                          deleteChair(c.id);
                          toast.success(`تم حذف الكرسي ${c.name} بنجاح`);
                        },
                      });
                    }}
                    className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-rose-600 hover:bg-rose-50 border border-border transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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
                <Armchair className="w-5 h-5 text-forest" />
                <h4 className="font-serif font-bold text-ink text-base">
                  {editingChair ? 'تعديل بيانات الكرسي' : 'إضافة كرسي جديد'}
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
                <label className="font-bold text-ink-soft">اسم أو رقم الكرسي:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: كرسي العرش 01 (VIP Suite)"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink-soft">الفرع:</label>
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
                  <label className="font-bold text-ink-soft">الحلاق المخصص:</label>
                  <select
                    value={barberId}
                    onChange={(e) => setBarberId(e.target.value)}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                  >
                    {barbers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">نمط التجربة للكرسي:</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ChairMode)}
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                >
                  <option value="normal">تجربة كلاسيكية عادية</option>
                  <option value="vip">جناح VIP الملكي</option>
                  <option value="both">مشترك (عادي + VIP)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="submit"
                  className="btn-clinic-primary flex-1 py-3 text-xs font-bold"
                >
                  {editingChair ? 'حفظ التعديلات' : 'إضافة الكرسي'}
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
