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
  Calendar,
  Ban,
  Smartphone,
  QrCode,
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
  const [recallDays, setRecallDays] = useState(settings.recall_days_threshold || 40);
  const [workingHoursText, setWorkingHoursText] = useState(settings.working_hours_text || 'يومياً: 10:00 ص – 11:30 م (الحجز متاح 24/7)');

  const [normalFee, setNormalFee] = useState(settings.booking_fee_normal);
  const [vipFee, setVipFee] = useState(settings.booking_fee_vip);
  const [cancellationHours, setCancellationHours] = useState(settings.cancellation_grace_hours);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(settings.max_advance_days);
  const [vodafoneNumber, setVodafoneNumber] = useState(settings.vodafone_cash_number || '');
  const [instapayUser, setInstapayUser] = useState(settings.instapay_username || '');
  const [bankInfo, setBankInfo] = useState(settings.bank_account_info || '');
  const [offDays, setOffDays] = useState<number[]>(
    Array.isArray(settings.weekly_off_days) ? settings.weekly_off_days : [1]
  );

  const DAYS_OF_WEEK = [
    { id: 6, name: 'السبت' },
    { id: 0, name: 'الأحد' },
    { id: 1, name: 'الإثنين' },
    { id: 2, name: 'الثلاثاء' },
    { id: 3, name: 'الأربعاء' },
    { id: 4, name: 'الخميس' },
    { id: 5, name: 'الجمعة' },
  ];

  const toggleOffDay = (dayId: number) => {
    setOffDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

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
      recall_days_threshold: Number(recallDays),
      working_hours_text: workingHoursText,
      booking_fee_normal: Number(normalFee),
      booking_fee_vip: Number(vipFee),
      cancellation_grace_hours: Number(cancellationHours),
      max_advance_days: Number(maxAdvanceDays),
      vodafone_cash_number: vodafoneNumber,
      instapay_username: instapayUser,
      bank_account_info: bankInfo,
      weekly_off_days: offDays,
    });
    toast.success('تم حفظ وتحديث إعدادات الصالون وأيام الإجازة الأسبوعية بنجاح ✅');
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

          {/* Weekly Off-Days Vacation Section */}
          <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4 border-2 border-rose-500/20">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-600" />
                <span>أيام الإجازة والعطلة الأسبوعية للصالون (Salon Off-Days):</span>
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
                {offDays.length === 0 ? 'الصالون يعمل طوال الأسبوع' : `${offDays.length} يوم إجازة`}
              </span>
            </div>

            <p className="text-ink-mute text-[11px] leading-relaxed">
              اضغط على أي يوم لجعله <strong className="text-rose-700 font-bold">إجازة رسمية</strong> للصالون. سيتم إغلاق استقبال الحجوزات في ذلك اليوم فوراً وإظهار كلمة <strong className="text-rose-700 font-bold">"إجازة"</strong> للعملاء في الروزنامة وتوجيههم لأقرب يوم عمل تالٍ.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {DAYS_OF_WEEK.map((day) => {
                const isOff = offDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleOffDay(day.id)}
                    className={`p-3 rounded-2xl border text-center transition-all duration-200 flex flex-col items-center justify-center gap-1.5 ${
                      isOff
                        ? 'bg-rose-50 border-2 border-rose-500 text-rose-900 shadow-sm ring-2 ring-rose-500/10'
                        : 'bg-paper-warm/60 border-border text-ink-soft hover:bg-white hover:border-forest/40'
                    }`}
                  >
                    <span className="font-serif font-bold text-xs sm:text-sm">{day.name}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isOff
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {isOff ? 'إجازة مغلق 🚫' : 'يوم عمل متاح ✓'}
                    </span>
                  </button>
                );
              })}
            </div>

            {offDays.length > 0 && (
              <div className="p-3 bg-rose-50/80 rounded-xl border border-rose-200/80 text-[11px] text-rose-800 flex items-start gap-2">
                <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  أيام الإجازة المغلقة حالياً:{' '}
                  <strong>{offDays.map((d) => DAYS_OF_WEEK.find((dw) => dw.id === d)?.name).join('، ')}</strong>. لن يتمكن أي عميل من حجز موعد في هذه الأيام.
                </span>
              </div>
            )}
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

            <div className="p-3 bg-forest/5 rounded-xl border border-forest/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-forest shrink-0" />
                <div>
                  <div className="text-[11px] font-bold text-ink">ربط رقم الواتساب بالمنظومة (QR Code)</div>
                  <div className="text-[10px] text-ink-mute">توليد رمز QR ومسحه لربط أي رقم هاتف بدون قيود</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem('manager_active_tab', 'whatsapp_connect');
                  window.location.reload();
                }}
                className="btn-clinic-primary text-[11px] font-bold px-3.5 py-1.5 flex items-center gap-1.5 shrink-0"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>إدارة وربط الـ QR الآن</span>
              </button>
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

          <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4 border border-amber-500/30">
            <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-3">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>استعادة العملاء التلقائية بالذكاء الاصطناعي (AI Customer Recall):</span>
            </h4>

            <div className="space-y-1.5">
              <label className="font-bold text-ink-soft flex items-center gap-1">
                <span>مدة غياب العميل بعد آخر حلاقة لإرسال رسالة الترحيب والاستعادة (بالأيام):</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={recallDays}
                  onChange={(e) => setRecallDays(Number(e.target.value))}
                  className="w-28 bg-paper-warm border border-amber-500/30 focus:border-amber-600 rounded-xl px-3.5 py-2.5 text-xs text-ink outline-none font-mono font-bold text-center"
                />
                <span className="font-bold text-xs text-ink-soft">يوماً (مثلاً 40 أو 50 يوماً من آخر زيارة)</span>
              </div>
              <p className="text-[10px] text-ink-mute">
                💈 يقوم المساعد الذكي تلقائياً بفحص العملاء الذين تجاوزوا هذه المدة وإرسال رسالة واتساب شخصية وودية تذكرهم بأنهم وحشونا، وتذكر حلاقهم المفضل وخدمتهم السابقة وتدعوهم للحجز هذا الأسبوع.
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
