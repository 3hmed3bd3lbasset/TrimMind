import React, { useState, useEffect } from 'react';
import { useSalonStore } from '../../lib/store';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { Booking } from '../../types';
import {
  formatCurrency,
  formatDateTime,
  isReceiptImageExpired,
  getRemainingReceiptImageMinutes,
} from '../../lib/utils';
import {
  CheckCircle2,
  XCircle,
  X,
  CreditCard,
  Phone,
  Receipt,
  AlertTriangle,
  ZoomIn,
  Trash2,
  Clock,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentProofModalProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PaymentProofModal: React.FC<PaymentProofModalProps> = ({
  booking,
  isOpen,
  onClose,
}) => {
  const { reviewPaymentProof, bookings } = useSalonStore();
  const [rejectionReason, setRejectionReason] = useState('المبلغ المحول غير مطابق لقيمة العربون المطلوبة');
  const [showRejectForm, setShowRejectForm] = useState(false);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !booking) return null;

  const currentStoreBooking = bookings.find((b: any) => b.id === booking.id);
  const storeProof = currentStoreBooking?.payment_proof || (currentStoreBooking as any)?.paymentProof;
  const rawProof = booking.payment_proof || (booking as any).paymentProof || storeProof;
  let proof: any = null;
  try {
    proof = typeof rawProof === 'string' ? JSON.parse(rawProof) : rawProof;
  } catch {
    proof = rawProof;
  }
  if (!proof && storeProof) {
    try {
      proof = typeof storeProof === 'string' ? JSON.parse(storeProof) : storeProof;
    } catch {
      proof = storeProof;
    }
  }

  const isImageExpired = isReceiptImageExpired(proof);
  const remainingMinutes = getRemainingReceiptImageMinutes(proof);
  const imageSrc =
    proof?.image_path ||
    proof?.imagePath ||
    proof?.image_url ||
    proof?.imageUrl ||
    proof?.url ||
    proof?.dataUrl ||
    storeProof?.image_path ||
    (booking as any)?.image_path ||
    (booking as any)?.imagePath ||
    (booking as any)?.proofImage ||
    (booking as any)?.receiptImage ||
    (typeof rawProof === 'string' && (rawProof as string).startsWith('data:') ? (rawProof as string) : null);

  const isPendingReview =
    booking.status === 'pending_review' ||
    booking.status === 'awaiting_payment' ||
    proof?.status === 'pending_review' ||
    !['confirmed', 'completed', 'cancelled', 'rejected', 'in_service', 'customer_arrived'].includes(booking.status);

  const handleApprove = async () => {
    reviewPaymentProof(booking.id, 'approved');
    try {
      await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'confirmed',
          note: 'تم قبول الإيصال وتأكيد الحجز بنجاح',
          booking: booking,
        }),
      });
    } catch (err) {
      console.warn('Review API err:', err);
    }
    toast.success(`تم قبول إيصال الحجز ${booking.id} وإرسال رسالة التأكيد للعميل على الواتساب بنجاح 💈👑`);
    onClose();
  };

  const handleReject = async () => {
    reviewPaymentProof(booking.id, 'rejected', rejectionReason);
    try {
      await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          note: rejectionReason,
          booking: booking,
        }),
      });
    } catch (err) {
      console.warn('Reject API err:', err);
    }
    toast.error(`تم رفض الإيصال للحجز ${booking.id} مع إخطار العميل بالسبب.`);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-container max-w-2xl p-6 sm:p-7 space-y-5 font-sans text-ink">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-forest/10 text-forest border border-forest/20 flex items-center justify-center shadow-xs">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-ink text-base">تدقيق ومراجعة إثبات التحويل</h3>
              <p className="text-xs text-ink-mute">
                حجز رقم: <strong className="font-mono text-forest font-bold">{booking.id}</strong> • العميل: {booking.customer_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-mute hover:text-ink rounded-xl bg-paper-warm transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-Hour Auto-Purge Security Notice */}
        {proof?.status === 'approved' && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
              isImageExpired
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-900'
                : 'bg-emerald-500/10 border-emerald-500/30 text-forest'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                {isImageExpired
                  ? 'تم حذف وإتلاف صورة الإيصال تلقائياً بعد مرور ساعتين على تأكيد ومراجعة الحساب للحفاظ على المساحة والأمان.'
                  : `سياسة الحفظ الآمن: تم تأكيد الإيصال وسيتم حذف الصورة تلقائياً بعد ساعتين (متبقي ${remainingMinutes} دقيقة).`}
              </span>
            </div>
            <span className="font-mono font-bold text-[10px] bg-white px-2 py-0.5 rounded-full border border-border shrink-0">
              {isImageExpired ? 'تم الإتلاف ✓' : `${remainingMinutes} دقيقة`}
            </span>
          </div>
        )}

        {/* Content: Image & Transfer Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
          {/* Receipt Image Preview */}
          <div className="space-y-2">
            <label className="text-ink-soft font-bold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ZoomIn className="w-4 h-4 text-forest" />
                <span>صورة الإيصال المضغوطة:</span>
              </span>
              <span className="text-[10px] text-ink-mute font-mono">WebP / JPG Optimized</span>
            </label>

            <div className="rounded-2xl overflow-hidden border border-border bg-paper-warm aspect-[3/4] flex items-center justify-center relative shadow-inner">
              {imageSrc ? (
                <div className="relative group w-full h-full flex items-center justify-center bg-white/50">
                  <img
                    src={imageSrc}
                    alt="Receipt"
                    className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                  />
                  <a
                    href={imageSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 bg-forest text-white text-[11px] font-bold py-2 px-3.5 rounded-xl shadow-lg flex items-center gap-1.5 transition-all hover:bg-forest-light cursor-pointer active:scale-95"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>فتح الصورة بالحجم الكامل 🔍</span>
                  </a>
                </div>
              ) : isImageExpired ? (
                <div className="text-center p-6 space-y-2 text-ink-mute">
                  <Trash2 className="w-10 h-10 text-terra mx-auto opacity-70" />
                  <p className="font-serif font-bold text-xs text-ink">تم إتلاف الصورة تلقائياً</p>
                  <p className="text-[10px] leading-relaxed">
                    مرت أكثر من ساعتين على اعتماد الحساب وتأكيد الموعد، وتم حذف ملف الصورة لتوفير مساحة التخزين.
                  </p>
                </div>
              ) : (
                <div className="text-center p-6 space-y-2 text-ink-mute">
                  <Receipt className="w-10 h-10 text-forest/40 mx-auto" />
                  <p className="font-bold text-xs text-ink">بيانات الإيصال مسجلة</p>
                  <p className="text-[10px]">المبلغ: {formatCurrency(proof?.transferred_amount || booking.booking_fee_at_booking)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Audit Comparison Details */}
          <div className="space-y-4 flex flex-col justify-between">
            <div className="bg-paper-warm p-4 rounded-2xl border border-border space-y-3">
              <h4 className="font-serif font-bold text-ink text-sm border-b border-border pb-2 flex items-center justify-between">
                <span>بيانات المعاملة المالية:</span>
                <span className="text-[10px] font-mono text-forest font-bold">
                  {proof?.status === 'approved' ? 'معتمد ✓' : proof?.status === 'rejected' ? 'مرفوض ✗' : 'قيد المراجعة'}
                </span>
              </h4>

              <div className="space-y-2 text-ink-soft">
                <div className="flex justify-between">
                  <span>طريقة الدفع:</span>
                  <span className="font-bold text-forest uppercase font-mono">
                    {proof?.payment_method || 'instapay'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>رقم هاتف المحول:</span>
                  <span className="font-mono font-bold text-ink">
                    {proof?.sender_phone || booking.customer_phone}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>المبلغ المحول بالإيصال:</span>
                  <span className="font-serif font-bold text-forest text-sm">
                    {formatCurrency(proof?.transferred_amount || booking.booking_fee_at_booking)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>قيمة العربون المطلوبة:</span>
                  <span className="font-mono font-bold text-ink">
                    {formatCurrency(booking.booking_fee_at_booking)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <span>توقيت رفع الإيصال:</span>
                  <span className="font-mono text-ink text-[11px]">
                    {proof?.submitted_at ? formatDateTime(proof.submitted_at) : 'غير متوفر'}
                  </span>
                </div>
                {proof?.reviewed_at && (
                  <div className="flex justify-between">
                    <span>توقيت المراجعة والاعتماد:</span>
                    <span className="font-mono text-forest text-[11px]">
                      {formatDateTime(proof.reviewed_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions for Reviewers */}
            {isPendingReview ? (
              <div className="space-y-3 pt-2">
                {!showRejectForm ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleApprove}
                      className="btn-clinic-primary flex-1 py-3 text-xs font-bold shadow-md bg-forest text-paper"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>قبول الإيصال وتأكيد الحجز</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRejectForm(true)}
                      className="btn-clinic-ghost text-xs text-terra hover:bg-terra/10 border-terra/30 font-bold px-4"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>رفض الإيصال</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 bg-red-50 rounded-2xl border border-red-200 animate-in fade-in">
                    <label className="text-red-900 font-bold text-[11px] block">سبب رفض الإيصال:</label>
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="w-full bg-white border border-red-300 rounded-xl px-3 py-2 text-xs text-ink outline-none"
                    />
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleReject}
                        className="py-2 px-4 rounded-xl bg-terra text-white font-bold text-xs flex-1 hover:bg-terra-deep transition-colors"
                      >
                        تأكيد الرفض وإخطار العميل
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRejectForm(false)}
                        className="py-2 px-3 rounded-xl bg-paper-warm text-ink text-xs font-bold"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="pt-2">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center text-xs text-forest font-bold">
                  {booking.status === 'confirmed' ? '✓ تم اعتماد وتأكيد هذا الحجز مسبقاً' : `حالة الحجز الحالية: ${booking.status}`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-ink-mute">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-forest" />
            <span>نظام التدقيق الرقمي المشفر - صالون النخبة VIP</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-ink font-bold hover:underline"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
