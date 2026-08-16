import React from 'react';
import { Barber } from '../../types';
import { Star, Award, Sparkles, Lock, CheckCircle2 } from 'lucide-react';

interface BarberCardProps {
  barber: Barber;
  isSelected?: boolean;
  isNormalMode?: boolean;
  onSelect?: (barber: Barber) => void;
  onAttemptLockedSelect?: () => void;
}

export const BarberCard: React.FC<BarberCardProps> = ({
  barber,
  isSelected,
  isNormalMode,
  onSelect,
  onAttemptLockedSelect,
}) => {
  const handleClick = () => {
    if (isNormalMode && !isSelected) {
      if (onAttemptLockedSelect) {
        onAttemptLockedSelect();
      }
      return;
    }
    if (onSelect) {
      onSelect(barber);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`relative group rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border ${
        isSelected
          ? 'bg-paper-warm border-forest shadow-clinic-2 ring-2 ring-forest/30 scale-[1.01]'
          : isNormalMode
          ? 'bg-white/50 border-border opacity-75 hover:opacity-100 hover:border-border'
          : 'bg-white/70 border-border hover:border-forest/50 hover:bg-white'
      }`}
    >
      {/* Barber Photo with Overlay */}
      <div className="relative h-48 sm:h-56 overflow-hidden bg-forest/10 flex items-center justify-center">
        {barber.photo_url ? (
          <img
            key={`${barber.id}-${barber.photo_url}`}
            src={barber.photo_url}
            alt={barber.full_name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-forest p-4 text-center">
            <span className="w-16 h-16 rounded-full bg-forest text-paper flex items-center justify-center font-serif text-2xl font-bold mb-2 shadow-clinic-1">
              {barber.full_name.trim().charAt(0)}
            </span>
            <span className="font-serif font-bold text-xs text-ink">{barber.full_name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* Rating Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-border text-xs shadow-clinic-1">
          <Star className="w-3.5 h-3.5 text-terra fill-terra" />
          <span className="font-bold text-ink">{barber.rating || 4.9}</span>
          <span className="text-ink-mute text-[10px]">({barber.rating_count || 50})</span>
        </div>

        {/* Master Badge */}
        {barber.full_name.includes('Master') || barber.full_name.includes('VIP') ? (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-forest text-paper px-2.5 py-0.5 rounded-full font-bold text-[10px] shadow-sm">
            <Sparkles className="w-3 h-3" />
            <span>Master Barber</span>
          </div>
        ) : null}

        {/* Normal Mode Lock Overlay on non-selected cards */}
        {isNormalMode && !isSelected && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center">
            <span className="bg-white/90 text-ink text-[11px] font-bold px-3 py-1.5 rounded-full border border-border flex items-center gap-1.5 shadow-sm">
              <Lock className="w-3.5 h-3.5 text-terra" />
              <span>متاح في تجربة VIP</span>
            </span>
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-serif font-bold text-ink text-base">
            {barber.full_name}
          </h4>
          <span className="w-2.5 h-2.5 rounded-full bg-ok shadow-sm" title="متاح للحجز"></span>
        </div>

        <p className="text-xs text-ink-mute line-clamp-2 leading-relaxed">
          {barber.specialty || 'متخصص في أدق قصات الشعر وتصميم اللحية الملكية'}
        </p>

        <div className="pt-2 border-t border-border-soft flex items-center justify-between text-xs">
          <span className="text-forest flex items-center gap-1 font-bold">
            <Award className="w-3.5 h-3.5" />
            <span>خبرة معتمدة</span>
          </span>

          <span
            className={`px-3 py-1 rounded-full font-bold text-xs transition-colors ${
              isSelected
                ? 'bg-forest text-paper flex items-center gap-1'
                : isNormalMode
                ? 'bg-paper-warm text-ink-mute'
                : 'bg-paper-warm text-ink-soft group-hover:bg-forest group-hover:text-paper'
            }`}
          >
            {isSelected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isNormalMode ? 'معين تلقائياً' : 'تم الاختيار'}</span>
              </>
            ) : isNormalMode ? (
              'تحديد يدوي (VIP)'
            ) : (
              'اختيار الحلاق'
            )}
          </span>
        </div>
      </div>
    </div>
  );
};
