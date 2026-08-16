import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Product } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Coffee, Plus, Edit2, Trash2, X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { showConfirmDialog } from '../../lib/dialogStore';

export const ProductManager: React.FC = () => {
  const { products, addProduct, updateProduct, deleteProduct } = useSalonStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(45);
  const [category, setCategory] = useState<Product['category']>('hot_drink');

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice(45);
    setCategory('hot_drink');
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || '');
    setPrice(product.price);
    setCategory(product.category);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        name,
        description,
        price: Number(price),
        category,
      });
      toast.success(`تم تعديل منتج "${name}" بنجاح!`);
    } else {
      addProduct({
        name,
        description,
        price: Number(price),
        category,
        is_active: true,
      });
      toast.success('تمت إضافة الصنف الجديد بنجاح!');
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Coffee className="w-5 h-5 text-forest" />
            <span>كافيه الصالون ومنتجات العناية (Cafe & Inventory)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">إدارة المشروبات الساخنة والباردة، زيوت اللحية ومنتجات التصفيف</p>
        </div>

        <button
          onClick={openAddModal}
          className="btn-clinic-primary text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة صنف جديد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => (
          <div
            key={p.id}
            className="clinic-card p-5 shadow-clinic-2 bg-white/95 space-y-3 relative group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-serif font-bold text-ink text-sm leading-tight">{p.name}</h4>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-paper-deep text-forest border border-border">
                  {p.category === 'hot_drink'
                    ? 'مشروب ساخن'
                    : p.category === 'cold_drink'
                    ? 'مشروب بارد'
                    : p.category === 'care_product'
                    ? 'منتج عناية'
                    : 'سيجار وشيشة VIP'}
                </span>
              </div>

              {p.description && (
                <p className="text-[11px] text-ink-mute leading-relaxed line-clamp-2">
                  {p.description}
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between">
              <span className="font-serif font-bold text-forest text-base">
                {formatCurrency(p.price)}
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEditModal(p)}
                  className="p-2 rounded-xl bg-paper-warm text-ink-soft hover:text-forest hover:bg-paper-deep border border-border transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    showConfirmDialog({
                      title: `تأكيد حذف ${p.name}`,
                      message: `هل أنت متأكد من رغبتك في حذف الصنف "${p.name}" (${formatCurrency(p.price)}) من قائمة الكافيه والمنتجات؟`,
                      type: 'danger',
                      confirmText: 'نعم، احذف الصنف',
                      cancelText: 'إلغاء',
                      onConfirm: () => {
                        deleteProduct(p.id);
                        toast.success(`تم حذف ${p.name} بنجاح`);
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
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="clinic-card w-full max-w-md p-6 sm:p-7 shadow-clinic-3 space-y-5 bg-white animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Coffee className="w-5 h-5 text-forest" />
                <h4 className="font-serif font-bold text-ink text-base">
                  {editingProduct ? 'تعديل الصنف' : 'إضافة صنف جديد'}
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
                <label className="font-bold text-ink-soft">اسم الصنف أو المنتج:</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: فنجان قهوة تركي محوج بالحبهان"
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">الوصف والمواصفات:</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="قهوة بن برازيلي فاخر مع حبهان أصلي ومذاق متوازن..."
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
                  <label className="font-bold text-ink-soft">القسم والتصنيف:</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                  >
                    <option value="hot_drink">مشروبات ساخنة</option>
                    <option value="cold_drink">مشروبات وعصائر فريش</option>
                    <option value="care_product">منتجات عناية باللحية والشعر</option>
                    <option value="cigar_shisha">ضيافة VIP خاصة</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="submit"
                  className="btn-clinic-primary flex-1 py-3 text-xs font-bold"
                >
                  {editingProduct ? 'حفظ التعديلات' : 'إضافة الصنف'}
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
