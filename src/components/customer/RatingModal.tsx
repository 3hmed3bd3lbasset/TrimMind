import React, { useState, useEffect } from 'react';
import { useSalonStore } from '../../lib/store';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { Star, X, CheckCircle2, MessageSquare, Scissors, Building2, Sparkles, HeartHandshake } from 'lucide-react';
import toast from 'react-hot-toast';

interface RatingModalProps {
  bookingId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const RatingModal: React.FC<RatingModalProps> = ({ bookingId, isOpen, onClose }) => {
  const { rateBooking, bookings, barbers, branches } = useSalonStore();

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  // 3 Multi-dimensional ratings
  const [barberStars, setBarberStars] = useState<number>(5);
  const [hoveredBarberStar, setHoveredBarberStar] = useState<number | null>(null);

  const [placeStars, setPlaceStars] = useState<number>(5);
  const [hoveredPlaceStar, setHoveredPlaceStar] = useState<number | null>(null);

  const [experienceStars, setExperienceStars] = useState<number>(5);
  const [hoveredExpStar, setHoveredExpStar] = useState<number | null>(null);

  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const booking = bookings.find((b) => b.id === bookingId);
  const barber = barbers.find((b) => b.id === booking?.barber_id);
  const branch = branches.find((b) => b.id === booking?.branch_id);

  const overallAvg = Number(((barberStars + placeStars + experienceStars) / 3).toFixed(1));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    rateBooking(
      bookingId,
      {
        overall: overallAvg,
        barber: barberStars,
        place: placeStars,
        experience: experienceStars,
      },
      comment
    );
    toast.success('شكراً لتقييمك! تم تحديث تقييم الكابتن والمكان وتسجيل ملاحظاتك بنجاح.');
    onClose();
  };

  const renderStarRow = (
    value: number,
    hoverValue: number | null,
    onSelect: (val: number) => void,
    onHover: (val: number | null) => void,
    starSize = 'w-7 h-7'
  ) => {
    return (
      <div className="flex items-center gap-1.5" dir="ltr">
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const isFilled = (hoverValue ?? value) >= starIndex;
          return (
            <button
              key={starIndex}
              type="button"
              onClick={() => onSelect(starIndex)}
              onMouseEnter={() => onHover(starIndex)}
              onMouseLeave={() => onHover(null)}
              className="p-1 hover:scale-125 transition-transform"
            >
              <Star
                className={`${starSize} transition-all duration-200 ${
                  isFilled
                    ? 'text-[#f59e0b] fill-[#f59e0b] drop-shadow-[0_2px_8px_rgba(245,158,11,0.5)]'
                    : 'text-[#d1c7b7] hover:text-[#f59e0b]/50'
                }`}
              />
            </button>
          );
        })}
      </div>
    );
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
      <div className="modal-container max-w-lg p-6 sm:p-7 space-y-6 font-sans text-ink">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#f59e0b]/15 border border-[#f59e0b]/30 text-[#b45309] flex items-center justify-center shadow-sm">
              <Star className="w-5 h-5 fill-[#f59e0b] text-[#f59e0b]" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-ink text-lg">تقييم تجربة الحلاقة والخدمة</h3>
              <p className="text-[11px] text-ink-mute">رأيك يهمنا لتطوير مستوى الخدمة وتكريم المتميزين</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ink-mute hover:text-ink rounded-xl bg-paper-warm transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Booking Summary Pill */}
        {booking && (
          <div className="bg-paper-warm p-4 rounded-2xl border border-border text-xs flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-ink-mute text-[10px]">كابتن الحلاقة:</p>
              <p className="font-bold text-ink text-sm mt-0.5">{barber?.full_name || 'كابتن الصالون'}</p>
            </div>
            <div>
              <p className="text-ink-mute text-[10px]">الفرع:</p>
              <p className="font-bold text-forest text-sm mt-0.5">{branch?.name}</p>
            </div>
            <div className="text-left font-mono">
              <p className="text-ink-mute text-[10px]">رقم الحجز:</p>
              <p className="font-bold text-forest text-sm mt-0.5">{booking.id}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1: Barber Rating */}
          <div className="p-4 rounded-2xl bg-white border border-border shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-forest" />
                <span className="font-bold text-xs text-ink">1. تقييم أداء واحترافية الكابتن ({barber?.full_name})</span>
              </div>
              <span className="text-xs font-mono font-bold text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                {barberStars} / 5
              </span>
            </div>
            <p className="text-[11px] text-ink-mute">دقة القص، العناية باللحية، والتنسيق والاهتمام بالتفاصيل.</p>
            <div className="pt-1 flex justify-center">
              {renderStarRow(barberStars, hoveredBarberStar, setBarberStars, setHoveredBarberStar)}
            </div>
          </div>

          {/* Section 2: Place & Ambiance Rating */}
          <div className="p-4 rounded-2xl bg-white border border-border shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-terra" />
                <span className="font-bold text-xs text-ink">2. تقييم المكان والنظافة والضيافة ({branch?.name})</span>
              </div>
              <span className="text-xs font-mono font-bold text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                {placeStars} / 5
              </span>
            </div>
            <p className="text-[11px] text-ink-mute">نظافة الأدوات والكرسي، فخامة اللاونج، وجودة القهوة والمشروبات.</p>
            <div className="pt-1 flex justify-center">
              {renderStarRow(placeStars, hoveredPlaceStar, setPlaceStars, setHoveredPlaceStar)}
            </div>
          </div>

          {/* Section 3: Overall Experience & Speed Rating */}
          <div className="p-4 rounded-2xl bg-white border border-border shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-forest" />
                <span className="font-bold text-xs text-ink">3. تقييم التجربة العامة وحسن الاستقبال</span>
              </div>
              <span className="text-xs font-mono font-bold text-[#b45309] bg-[#fef3c7] px-2 py-0.5 rounded-full">
                {experienceStars} / 5
              </span>
            </div>
            <p className="text-[11px] text-ink-mute">الالتزام بالموعد، سلاسة الحجز، ولطف موظفي الاستقبال.</p>
            <div className="pt-1 flex justify-center">
              {renderStarRow(experienceStars, hoveredExpStar, setExperienceStars, setHoveredExpStar)}
            </div>
          </div>

          {/* Live Overall Average Score Display */}
          <div className="p-3.5 bg-paper-warm rounded-2xl border border-border flex items-center justify-between">
            <div>
              <p className="text-[11px] text-ink-mute">المعدل العام للتقييم:</p>
              <p className="font-serif font-bold text-sm text-forest mt-0.5">
                {overallAvg >= 4.5
                  ? 'تجربة استثنائية تفوق التوقعات'
                  : overallAvg >= 3.5
                  ? 'تجربة ممتازة وخدمة راقية'
                  : overallAvg >= 2.5
                  ? 'خدمة جيدة ومقبولة'
                  : 'ملاحظات بحاجة للتحسين'}
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-border shadow-sm">
              <Star className="w-4 h-4 fill-[#f59e0b] text-[#f59e0b]" />
              <span className="font-mono font-extrabold text-sm text-ink">{overallAvg}</span>
              <span className="text-[10px] text-ink-mute font-mono">/ 5.0</span>
            </div>
          </div>

          {/* Feedback Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs text-ink-soft flex items-center gap-1.5 font-bold">
              <MessageSquare className="w-3.5 h-3.5 text-forest" />
              <span>ملاحظاتك أو كلمة شكر للكابتن وفريق العمل (اختياري):</span>
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="شاركنا رأيك وانطباعك عن جلسة الحلاقة والراحة..."
              className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-3 text-xs text-ink placeholder:text-ink-mute outline-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="btn-clinic-primary flex-1 py-3.5 text-xs font-bold shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>حفظ وإرسال التقييم الشامل</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-clinic-ghost text-xs px-5 font-bold"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
