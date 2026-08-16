import React from 'react';
import { Scissors, MapPin, Phone, Clock, ShieldCheck, Heart, MessageCircle } from 'lucide-react';
import { useSalonStore } from '../../lib/store';

export const Footer: React.FC = () => {
  const { branches, settings } = useSalonStore();

  return (
    <footer className="bg-paper-warm border-t border-border text-ink-soft text-sm mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Col 1: About */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-forest text-paper flex items-center justify-center shadow-clinic-1">
                <Scissors className="w-5 h-5" />
              </div>
              <span className="font-serif font-bold text-xl text-ink">
                {settings?.salon_name || 'صالون النخبة VIP'}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-mute">
              {settings?.about_text ||
                'الوجهة الأولى للرجل العصري الباحث عن الدقة والأناقة الفائقة. خدمات حلاقة احترافية، عناية بالبشرة واللحية، ونظام حجز رقمي ذكي يضمن وقتك بدون أي انتظار.'}
            </p>
            <div className="flex items-center gap-2 text-xs text-forest bg-white/70 border border-border p-2.5 rounded-xl shadow-clinic-1 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0 text-forest" />
              <span>حجز مشفر ومؤمن بالكامل مع خصوصية تامة للبيانات</span>
            </div>
          </div>

          {/* Col 2: Branches */}
          <div>
            <h4 className="font-serif font-bold text-ink mb-4 text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-forest"></span> فروعنا الرئيسية
            </h4>
            <ul className="space-y-3 text-xs">
              {branches.slice(0, 3).map((branch) => (
                <li key={branch.id} className="space-y-1 bg-white/50 p-2.5 rounded-xl border border-border-soft">
                  <div className="flex items-center gap-1.5 text-ink font-bold">
                    <MapPin className="w-3.5 h-3.5 text-terra shrink-0" />
                    <span>{branch.name}</span>
                  </div>
                  <p className="text-[11px] text-ink-mute pr-5">{branch.address}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Working hours & Contacts */}
          <div>
            <h4 className="font-serif font-bold text-ink mb-4 text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-forest"></span> مواعيد العمل والاتصال
            </h4>
            <div className="space-y-3 text-xs">
              <div className="flex items-start gap-2 bg-white/70 p-3.5 rounded-2xl border border-border shadow-clinic-1">
                <Clock className="w-4 h-4 text-forest shrink-0 mt-0.5" />
                <div>
                  <p className="text-ink font-bold">مواعيد استقبال الصالون:</p>
                  <p className="text-[11px] text-ink-mute mt-0.5">
                    {settings?.working_hours_text || 'يومياً: 10:00 ص – 11:30 م'}
                  </p>
                  <p className="text-[11px] text-forest font-bold mt-0.5">الحجز الإلكتروني متاح 24/7</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-ink-soft bg-white/60 p-2.5 rounded-xl border border-border text-xs">
                <Phone className="w-3.5 h-3.5 text-forest" />
                <span dir="ltr" className="font-mono font-bold">
                  {settings?.primary_phone || '010 1234 5678'}
                  {settings?.secondary_phone ? ` / ${settings.secondary_phone}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-ink-mute gap-4">
          <p>© {new Date().getFullYear()} {settings?.salon_name || 'صالون النخبة VIP Barber & Spa'}. جميع الحقوق محفوظة.</p>
          <div className="flex items-center gap-1.5 font-medium">
            <span>نظام إداري مشفر ومحمي بالكامل</span>
            <Heart className="w-3.5 h-3.5 text-terra fill-terra" />
          </div>
        </div>

        {/* Developer Signature & Plain WhatsApp Link */}
        <div className="border-t border-border/80 mt-6 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-mute">
          <p>
            Designed & Developed by <strong className="text-ink font-bold font-sans">Ahmed Abdelbaset Mohamed</strong>
          </p>

          <a
            href="https://wa.me/201285694670"
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className="font-mono text-ink font-bold hover:text-forest hover:underline transition-colors"
          >
            01285694670
          </a>
        </div>
      </div>
    </footer>
  );
};
