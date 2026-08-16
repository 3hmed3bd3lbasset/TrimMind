import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { Booking } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Coffee, Plus, X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface AddOrderModalProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AddOrderModal: React.FC<AddOrderModalProps> = ({ booking, isOpen, onClose }) => {
  const { products, addBookingItem } = useSalonStore();
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState(1);

  if (!isOpen || !booking) return null;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    addBookingItem(booking.id, selectedProductId, quantity);
    const prod = products.find((p) => p.id === selectedProductId);
    toast.success(`تمت إضافة ${prod?.name} (${quantity}) إلى حساب العميل ${booking.customer_name} ☕`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-[#121824] border border-[#233047] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-base">إضافة مشروب / منتج لحساب العميل</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#182133] p-3 rounded-xl border border-slate-800 text-xs flex justify-between">
          <span className="text-slate-400">العميل:</span>
          <span className="font-bold text-white">{booking.customer_name} ({booking.id})</span>
        </div>

        <form onSubmit={handleAddItem} className="space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-slate-300 font-medium">اختر المشروب أو المنتج:</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-amber-500 rounded-xl p-2.5 text-white outline-none"
            >
              {products.map((prod) => (
                <option key={prod.id} value={prod.id}>
                  {prod.name} — {formatCurrency(prod.price)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-medium">العدد / الكمية:</label>
            <input
              type="number"
              min={1}
              max={10}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full bg-[#0D121C] border border-[#2A374F] focus:border-amber-500 rounded-xl p-2.5 text-white font-mono outline-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>إضافة للفاتورة</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl bg-slate-800 text-slate-300"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
