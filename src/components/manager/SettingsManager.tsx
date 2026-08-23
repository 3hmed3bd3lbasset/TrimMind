import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import {
  Settings,
  Save,
  ShieldCheck,
  Building2,
  Phone,
  Clock,
  FileText,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const SettingsManager: React.FC = () => {
  const { settings, updateSettings } = useSalonStore();

  const [salonName, setSalonName] = useState(settings.salon_name || 'صالون النخبة VIP Barber & Spa');
  const [tagline, setTagline] = useState(settings.tagline || 'الوجهة الأولى للرجل العصري الباحث عن الدقة والأناقة الفائقة.');
  const [aboutText, setAboutText] = useState(settings.about_text || '');
  const [primaryPhone, setPrimaryPhone] = useState(settings.primary_phone || '010 1234 5678');
  const [secondaryPhone, setSecondaryPhone] = useState(settings.secondary_phone || '010 2345 6789');
  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsapp_number || '01012345678');
  const [managerReportPhone, setManagerReportPhone] = useState(settings.manager_report_phone || settings.whatsapp_number || '01285694670');
  const [workingHoursText, setWorkingHoursText] = useState(settings.working_hours_text || 'يومياً: 10:00 ص – 11:30 م (الحجز متاح 24/7)');

  const [normalFee, setNormalFee] = useState(settings.booking_fee_normal);
  const [vipFee, setVipFee] = useState(settings.booking_fee_vip);
  const [cancellationHours, setCancellationHours] = useState(settings.cancellation_grace_hours);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(settings.max_advance_days);
  const [vodafoneNumber, setVodafoneNumber] = useState(settings.vodafone_cash_number || '');
  const [instapayUser, setInstapayUser] = useState(settings.instapay_username || '');
  const [bankInfo, setBankInfo] = useState(settings.bank_account_info || '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      salon_name: salonName,
      tagline,
      about_text: aboutText,
      primary_phone: primaryPhone,
      secondary_phone: secondaryPhone,
      whatsapp_number: whatsappNumber,
      manager_report_phone: managerReportPhone,
      working_hours_text: workingHoursText,
      booking_fee_normal: Number(normalFee),
      booking_fee_vip: Number(vipFee),
      cancellation_grace_hours: Number(cancellationHours),
      max_advance_days: Number(maxAdvanceDays),
      vodafone_cash_number: vodafoneNumber,
      instapay_username: instapayUser,
      bank_account_info: bankInfo,
    });
    toast.success('تم حفظ وتحديث إعدادات وبيانات الصالون وتقارير الذكاء الاصطناعي بنجاح');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 text-xs font-sans text-ink">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Settings className="w-5 h-5 text-forest" />
            <span>إعدادات وهوية الصالون (Salon Settings & Identity)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">التحكم في بيانات الصالون، أرقام التواصل في الفوتر، ومبالغ العربون</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="btn-clinic-primary text-xs font-bold shadow-clinic-1"
          >
            <Save className="w-4 h-4" />
            <span>حفظ الإعدادات</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info & Footer Branding */}
        <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4">
          <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-3">
            <Building2 className="w-4 h-4 text-forest" />
            <span>الهوية والنصوص التعريفية (تنعكس في الفوتر والصفحات):</span>
          </h4>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="font-bold text-ink-soft">اسم الصالون الرسمي:</label>
              <input
                type="text"
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-ink-soft">الشعار أو العبارة التسويقية (Tagline):</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-ink-soft">نبذة عن الصالون (About Us):</label>
              <textarea
                rows={3}
                value={aboutText}
                onChange={(e) => setAboutText(e.target.value)}
                className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-3 text-xs text-ink outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-ink-soft">نص مواعيد وساعات العمل:</label>
              <input
                type="text"
                value={workingHoursText}
                onChange={(e) => setWorkingHoursText(e.target.value)}
                className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
              />
            </div>
          </div>
        </div>

        {/* Contact Numbers & Booking Policies */}
        <div className="space-y-6">
          <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4">
            <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-3">
              <Phone className="w-4 h-4 text-terra" />
              <span>أرقام التواصل وخدمة العملاء (معروضة في الفوتر):</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-ink-soft">الرقم الرئيسي:</label>
                <input
                  type="text"
                  value={primaryPhone}
                  onChange={(e) => setPrimaryPhone(e.target.value)}
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">رقم الواتساب:</label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4 border border-emerald-500/30">
            <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-3">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>تقارير الذكاء الاصطناعي اليومية (AI Daily Report):</span>
            </h4>

            <div className="space-y-1.5">
              <label className="font-bold text-ink-soft flex items-center gap-1">
                <span>رقم هاتف المدير لاستلام التقرير الصباحي على الواتساب:</span>
              </label>
              <input
                type="text"
                value={managerReportPhone}
                onChange={(e) => setManagerReportPhone(e.target.value)}
                placeholder="01005437633"
                className="w-full bg-paper-warm border border-emerald-500/30 focus:border-emerald-600 rounded-xl px-3.5 py-2.5 text-xs text-ink outline-none font-mono font-bold"
              />
              <p className="text-[10px] text-ink-mute">
                💡 يرسل المساعد الذكي ملخص التشغيل اليومي، باقات VIP، أوقات الذروة، وتوصية الذكاء الاصطناعي لهذا الرقم كل صباح الساعة 09:00 ص.
              </p>
            </div>
          </div>

          <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4">
            <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-3">
              <CreditCard className="w-4 h-4 text-forest" />
              <span>سياسات ومبالغ العربون (Booking Fees):</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-bold text-ink-soft">عربون الحجز العادي (ج.م):</label>
                <input
                  type="number"
                  min={0}
                  value={normalFee}
                  onChange={(e) => setNormalFee(Number(e.target.value))}
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink-soft">عربون حجز VIP الملكي (ج.م):</label>
                <input
                  type="number"
                  min={0}
                  value={vipFee}
                  onChange={(e) => setVipFee(Number(e.target.value))}
                  className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
