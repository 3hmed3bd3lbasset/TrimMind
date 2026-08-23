import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, Users, Scissors, DollarSign, Star, AlertTriangle, Send, RefreshCw, Bot } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface AIInsightsPanelProps {
  branchId: string;
}

export const AIInsightsPanel: React.FC<AIInsightsPanelProps> = ({ branchId }) => {
  const [periodDays, setPeriodDays] = useState<number>(7);
  const [report, setReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<Array<{ q: string; a: string }>>([]);

  const loadInsights = async () => {
    setIsLoading(true);
    try {
      const res: any = await api.getInsightsSummary(branchId || 'branch-elhdad', periodDays);
      if (res && res.data) {
        setReport(res.data);
      }
    } catch (err: any) {
      console.warn('Insights load error:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInsights();
  }, [branchId, periodDays]);

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    const q = question.trim();
    setQuestion('');
    setIsAsking(true);

    try {
      const res: any = await api.askInsightsAssistant(branchId || 'branch-elhdad', q);
      if (res && res.data) {
        setQaHistory((prev) => [...prev, { q, a: res.data.answer }]);
      }
    } catch (err: any) {
      toast.error('تعذر معالجة السؤال حالياً');
    } finally {
      setIsAsking(false);
    }
  };

  const metrics = report?.metrics;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl font-bold text-ink flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-forest" />
            <span>تقارير وتحليلات المدير الذكية (AI Business Insights)</span>
          </h3>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            ملخص ذكي ومباشر لأداء الصالون، الإيرادات، ساعات الذروة، ونسب الحضور مبني على بيانات حقيقية 100%
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-paper px-3 py-1.5 rounded-xl border border-border">
            <span className="text-xs font-bold text-ink-soft">الفترة:</span>
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-forest focus:outline-none cursor-pointer"
            >
              <option value={3}>آخر 3 أيام</option>
              <option value={7}>آخر أسبوع (7 أيام)</option>
              <option value={14}>آخر أسبوعين</option>
              <option value={30}>آخر شهر (30 يوماً)</option>
            </select>
          </div>

          <button
            onClick={loadInsights}
            className="p-2 text-ink-soft hover:text-ink bg-paper rounded-xl border border-border transition-colors"
            title="تحديث التقرير"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-xs text-ink-soft">جاري تجميع وتحليل مؤشرات الأداء من قاعدة البيانات...</div>
      ) : metrics ? (
        <>
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-surface p-4 rounded-2xl border border-border space-y-1">
              <span className="text-xs text-ink-soft flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-forest" />
                <span>إجمالي الإيرادات</span>
              </span>
              <p className="text-xl sm:text-2xl font-serif font-bold text-ink font-mono">
                {metrics.totalRevenue.toLocaleString()} <span className="text-xs text-ink-soft font-sans">ج.م</span>
              </p>
            </div>

            <div className="bg-surface p-4 rounded-2xl border border-border space-y-1">
              <span className="text-xs text-ink-soft flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                <span>الحجوزات المكتملة</span>
              </span>
              <p className="text-xl sm:text-2xl font-serif font-bold text-ink font-mono">
                {metrics.completedBookings} <span className="text-xs text-ink-soft font-sans">من أصل {metrics.totalBookings}</span>
              </p>
            </div>

            <div className="bg-surface p-4 rounded-2xl border border-border space-y-1">
              <span className="text-xs text-ink-soft flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>نسبة عدم الحضور</span>
              </span>
              <p className="text-xl sm:text-2xl font-serif font-bold text-amber-700 font-mono">
                {metrics.noShowRate}%
              </p>
            </div>

            <div className="bg-surface p-4 rounded-2xl border border-border space-y-1">
              <span className="text-xs text-ink-soft flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>متوسط التقييم</span>
              </span>
              <p className="text-xl sm:text-2xl font-serif font-bold text-ink font-mono">
                {metrics.averageRating} <span className="text-xs text-ink-soft font-sans">/ 5.0</span>
              </p>
            </div>
          </div>

          {/* AI Narrative Report Card */}
          <div className="bg-gradient-to-br from-paper to-paper-warm border border-border p-5 sm:p-6 rounded-2xl space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-forest font-bold text-sm">
              <Bot className="w-5 h-5" />
              <span>ملخص المستشار الذكي وتوصيات الإدارة</span>
            </div>
            <div className="text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-line font-sans bg-white/70 p-4 rounded-xl border border-border/80">
              {report?.narrative_text}
            </div>
          </div>

          {/* Performance Grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Top Barbers */}
            <div className="bg-surface rounded-2xl border border-border p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Users className="w-4 h-4 text-forest" />
                <h4 className="font-bold text-ink text-sm">أداء الكباتن وتحقيق الإيرادات</h4>
              </div>
              <div className="divide-y divide-border/60">
                {metrics.barberPerformance?.map((b: any) => (
                  <div key={b.barber_id || b.barber_name} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-ink">{b.barber_name}</p>
                      <p className="text-[11px] text-ink-soft font-mono">
                        {b.bookings_count} حجز • ⭐ {b.avg_rating}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-forest text-sm">
                      {b.total_revenue.toLocaleString()} ج.م
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Popular Services */}
            <div className="bg-surface rounded-2xl border border-border p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Scissors className="w-4 h-4 text-forest" />
                <h4 className="font-bold text-ink text-sm">الخدمات والباقات الأكثر طلباً</h4>
              </div>
              <div className="divide-y divide-border/60">
                {metrics.popularServices?.map((s: any) => (
                  <div key={s.service_id || s.service_name} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-ink">{s.service_name}</p>
                      <p className="text-[11px] text-ink-soft font-mono">{s.count} طلب</p>
                    </div>
                    <span className="font-mono font-bold text-forest text-sm">
                      {s.total_revenue.toLocaleString()} ج.م
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Q&A Assistant */}
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Bot className="w-4 h-4 text-forest" />
              <h4 className="font-bold text-ink text-sm">اسأل المساعد الذكي عن أداء الصالون والمبيعات</h4>
            </div>

            {qaHistory.length > 0 && (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {qaHistory.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 text-xs">
                    <div className="bg-paper p-2.5 rounded-lg border border-border text-ink font-bold">
                      س: {item.q}
                    </div>
                    <div className="bg-forest/5 p-3 rounded-lg border border-forest/20 text-ink leading-relaxed whitespace-pre-line">
                      {item.a}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAskQuestion} className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="مثال: ليه نسبة الغياب زادت الأسبوع ده؟ أو مين أفضل كابتن؟"
                className="flex-1 px-4 py-2.5 bg-paper border border-border rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-forest"
              />
              <button
                type="submit"
                disabled={isAsking || !question.trim()}
                className="px-4 py-2.5 bg-forest text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 hover:bg-forest-light transition-all shadow-sm disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isAsking ? 'جاري التحليل...' : 'إرسال'}</span>
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
};
