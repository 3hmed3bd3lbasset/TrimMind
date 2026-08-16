import React, { useState } from 'react';
import { Bot, Sparkles, Save, ShieldAlert, CheckCircle2, Play } from 'lucide-react';
import toast from 'react-hot-toast';

export const AIConfigStudio: React.FC = () => {
  const [systemPrompt, setSystemPrompt] = useState(
    `أنت المساعد الذكي الحصري لـ "صالون النخبة VIP".
مهمتك: مساعدة العملاء بلباقة وفخامة في اختيار الخدمات، اقتراح الحلاق الأنسب، استعراض المواعيد المتاحة، حساب الأسعار، وإتمام الحجز وتتبعه.
قواعد الأمان الصارمة:
1. لا تكشف أي بيانات مالية خاصة بالإدارة أو أرباح الصالون أو الخزينة تحت أي ظرف.
2. التزم بالأسعار المعتمدة ولا تمنح أي خصومات عشوائية بدون صلاحيات.
3. التحدث بنبرة راقية وودودة ومرحبة باللغة العربية.`
  );

  const [aiTone, setAiTone] = useState('luxury');
  const [testQuery, setTestQuery] = useState('عايز اعرف اسعار باقات الـ VIP عندكم');
  const [testOutput, setTestOutput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('تم تحديث إعدادات موجه الذكاء الاصطناعي بنجاح');
  };

  const runSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setTestOutput(
        `أهلاً بك يا فندم! باقة النخبة الملكية VIP الكاملة تبلغ قيمتها 450 ج.م وتشمل: (قص شعر فاخر + نحت لحية بالبخار والفوطة الساخنة + جلسة تنظيف بشرة هيدرافيشل + ماسك الذهب + مساج فروة الرأس والكتفين).\n\nهل تود حجز جلستك الملكية الآن مع كابتن أحمد فؤاد في فرع التجمع؟`
      );
      setIsSimulating(false);
    }, 600);
  };

  return (
    <div className="space-y-6 text-xs font-sans text-ink max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="font-serif font-bold text-ink text-base flex items-center gap-2">
            <Bot className="w-5 h-5 text-forest" />
            <span>استوديو إعداد وتوجيه الذكاء الاصطناعي (AI Studio & Guardrails)</span>
          </h3>
          <p className="text-ink-mute text-[11px]">تخصيص نبرة المحادثة، حدود الأمان، واختبار الردود في بيئة تجريبية</p>
        </div>

        <button
          onClick={handleSave}
          className="btn-clinic-primary text-xs font-bold"
        >
          <Save className="w-4 h-4" />
          <span>حفظ إعدادات المساعد</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Prompt & Config */}
        <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4">
          <div className="space-y-1">
            <label className="text-ink-soft font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-forest" />
              <span>التعليمات التوجيهية للنظام (System Instructions):</span>
            </label>
            <textarea
              rows={8}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl p-3 text-xs leading-relaxed text-ink outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-ink-soft font-bold">نبرة الحديث والأسلوب المعتمد:</label>
            <select
              value={aiTone}
              onChange={(e) => setAiTone(e.target.value)}
              className="w-full bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
            >
              <option value="luxury">فخمة وراقية (Luxury Concierge)</option>
              <option value="friendly">ودودة وشبابية سريعة</option>
              <option value="formal">رسمية وموجزة</option>
            </select>
          </div>
        </div>

        {/* Live Testing Sandbox */}
        <div className="clinic-card p-5 sm:p-6 shadow-clinic-2 bg-white/95 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="font-serif font-bold text-ink text-sm flex items-center gap-2 border-b border-border pb-2">
              <Play className="w-4 h-4 text-forest" />
              <span>صندوق الاختبار والمحاكاة المباشرة:</span>
            </h4>

            <div className="space-y-1">
              <label className="text-ink-soft font-bold">رسالة تجريبية من العميل:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="اكتب سؤالاً للتجربة..."
                  className="flex-1 bg-paper-warm border border-border focus:border-forest rounded-xl px-3 py-2.5 text-xs text-ink outline-none"
                />
                <button
                  type="button"
                  onClick={runSimulation}
                  disabled={isSimulating}
                  className="btn-clinic-primary text-xs font-bold px-4"
                >
                  {isSimulating ? '...' : 'اختبار'}
                </button>
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-ink-soft font-bold">رد المساعد الذكي المُولد:</label>
              <div className="p-4 rounded-xl bg-paper-warm border border-border min-h-[140px] text-xs leading-relaxed text-ink whitespace-pre-line">
                {testOutput || <span className="text-ink-mute">اضغط على زر "اختبار" لمعاينة استجابة الذكاء الاصطناعي...</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
