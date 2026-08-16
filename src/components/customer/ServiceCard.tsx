import React from 'react';
import { Service } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Clock, Crown, Check } from 'lucide-react';

interface ServiceCardProps {
  service: Service;
  isSelected?: boolean;
  onToggleSelect?: (service: Service) => void;
}

const CATEGORY_LABELS: Record<Service['category'], { label: string; color: string }> = {
  hair: { label: 'قص وتصفيف الشعر', color: 'text-forest bg-forest/10 border-forest/20' },
  beard: { label: 'حلاقة ولحية', color: 'text-terra-deep bg-terra/15 border-terra/30' },
  skin: { label: 'عناية بالبشرة', color: 'text-forest bg-forest/10 border-forest/20' },
  vip_package: { label: 'باقة VIP ملكية', color: 'text-terra-deep bg-terra/20 border-terra/40' },
  kids: { label: 'قصات أطفال', color: 'text-ink-soft bg-paper-warm border-border' },
};

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, isSelected, onToggleSelect }) => {
  const categoryInfo = CATEGORY_LABELS[service.category] || CATEGORY_LABELS.hair;

  return (
    <div
      onClick={() => onToggleSelect && onToggleSelect(service)}
      className={`relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between ${
        isSelected
          ? 'bg-paper-warm/90 border-forest shadow-clinic-2 ring-2 ring-forest/30'
          : 'bg-white/60 border-border hover:border-forest/50 hover:bg-white'
      }`}
    >
      {/* Top row: Category Badge & VIP Badge */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${categoryInfo.color}`}>
          {categoryInfo.label}
        </span>

        {service.is_vip_only && (
          <span className="flex items-center gap-1 text-[10px] font-extrabold bg-terra text-paper px-2 py-0.5 rounded-full shadow-sm">
            <Crown className="w-3 h-3" />
            <span>VIP EXCLUSIVE</span>
          </span>
        )}
      </div>

      {/* Service Name & Description */}
      <div className="space-y-1.5 flex-1">
        <h4 className="font-serif font-bold text-ink text-base leading-snug">
          {service.name}
        </h4>
        <p className="text-xs text-ink-mute leading-relaxed line-clamp-2">
          {service.description}
        </p>
      </div>

      {/* Bottom row: Duration & Price & Checkmark */}
      <div className="mt-4 pt-3 border-t border-border-soft flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-ink-mute">
          <Clock className="w-3.5 h-3.5 text-forest" />
          <span>{service.duration_minutes} دقيقة</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-base font-serif font-bold text-forest">
            {formatCurrency(service.price)}
          </span>

          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
              isSelected
                ? 'bg-forest border-forest text-paper'
                : 'border-border bg-paper-warm text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </div>
        </div>
      </div>
    </div>
  );
};
