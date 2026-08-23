import React, { useState, useEffect } from 'react';
import { Sparkles, Users, Send, CheckCircle2, History, RefreshCw, MessageSquare } from 'lucide-react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';

interface CustomerRecallManagerProps {
  branchId: string;
}

export const CustomerRecallManager: React.FC<CustomerRecallManagerProps> = ({ branchId }) => {
  const [thresholdDays, setThresholdDays] = useState<number>(30);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [customMessage, setCustomMessage] = useState<string>('');

  const loadCandidates = async () => {
    setIsLoading(true);
    try {
      const [candRes, campRes]: any = await Promise.allSettled([
        api.getRecallCandidates(branchId || 'branch-elhdad', thresholdDays),
        api.getRecallCampaigns(branchId || 'branch-elhdad'),
      ]);

      if (candRes.status === 'fulfilled' && candRes.value?.data) {
        setCandidates(candRes.value.data);
        setSelectedPhones(candRes.value.data.map((c: any) => c.customer_phone));
      }
      if (campRes.status === 'fulfilled' && campRes.value?.data) {
        setCampaigns(campRes.value.data);
      }
    } catch (err: any) {
      console.warn('Customer recall load error:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, [branchId, thresholdDays]);

  const handleToggleAll = () => {
    if (selectedPhones.length === candidates.length) {
      setSelectedPhones([]);
    } else {
      setSelectedPhones(candidates.map((c) => c.customer_phone));
    }
  };

  const handleToggleCandidate = (phone: string) => {
    if (selectedPhones.includes(phone)) {
      setSelectedPhones(selectedPhones.filter((p) => p !== phone));
    } else {
      setSelectedPhones([...selectedPhones, phone]);
    }
  };

  const handleSendCampaign = async () => {
    if (selectedPhones.length === 0) {
      toast.error('يرجى اختيار عميل واحد على الأقل لإرسال الحملة.');
      return;
    }

    setIsSending(true);
    try {
      const res: any = await api.sendRecallCampaign({
        branchId: branchId || 'branch-elhdad',
        thresholdDays,
        candidatePhones: selectedPhones,
        customMessageTemplate: customMessage.trim() || undefined,
      });

      toast.success(res?.message || 'تم إرسال حملة إعادة الجذب بنجاح!');
      loadCandidates();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'فشل إرسال الحملة');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-surface rounded-2xl border border-border p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl font-bold text-ink flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-forest" />
            <span>نظام إعادة جذب العملاء المنقطعين (AI Customer Recall)</span>
          </h3>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            استهداف ذكي للعملاء الذين لم يزوروا الصالون لفترة محددة برسائل ودية مخصصة لزيادة المبيعات والتردد
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-paper px-3 py-1.5 rounded-xl border border-border">
            <span className="text-xs font-bold text-ink-soft">المنقطعين منذ:</span>
            <select
              value={thresholdDays}
              onChange={(e) => setThresholdDays(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-forest focus:outline-none cursor-pointer"
            >
              <option value={15}>15 يوماً</option>
              <option value={30}>30 يوماً</option>
              <option value={45}>45 يوماً</option>
              <option value={60}>60 يوماً</option>
              <option value={90}>90 يوماً</option>
            </select>
          </div>

          <button
            onClick={loadCandidates}
            className="p-2 text-ink-soft hover:text-ink bg-paper rounded-xl border border-border transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Candidates List */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-forest" />
              <h4 className="font-bold text-ink text-sm">قائمة العملاء المؤهلين للتذكير ({candidates.length})</h4>
            </div>

            {candidates.length > 0 && (
              <button
                onClick={handleToggleAll}
                className="text-xs font-bold text-forest hover:underline"
              >
                {selectedPhones.length === candidates.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-xs text-ink-soft">جاري فحص سجلات العملاء وقاعدة البيانات...</div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-12 text-ink-soft text-xs space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600/60 mx-auto" />
              <p className="font-bold text-sm text-ink">ممتاز! لا يوجد عملاء منقطعين منذ {thresholdDays} يوماً.</p>
              <p>كافة عملائك يترددون بانتظام على الصالون.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {candidates.map((c) => (
                <label
                  key={c.customer_phone}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                    selectedPhones.includes(c.customer_phone)
                      ? 'bg-forest/5 border-forest/40'
                      : 'bg-paper/60 border-border hover:bg-paper'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedPhones.includes(c.customer_phone)}
                      onChange={() => handleToggleCandidate(c.customer_phone)}
                      className="rounded border-border text-forest focus:ring-forest w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <p className="font-bold text-sm text-ink">{c.customer_name || 'عميل الصالون'}</p>
                      <p className="text-xs text-ink-soft font-mono">{c.customer_phone}</p>
                    </div>
                  </div>

                  <div className="text-left text-xs text-ink-soft space-y-0.5">
                    <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      منذ {c.days_since_last_visit} يوم
                    </span>
                    <p className="text-[11px] text-ink-soft">آخر خدمة: {c.last_service}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Message Preview & Action */}
        <div className="bg-surface rounded-2xl border border-border p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <MessageSquare className="w-4 h-4 text-forest" />
              <h4 className="font-bold text-ink text-sm">صياغة الرسالة المخصصة</h4>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              سيقوم الذكاء الاصطناعي باستبدال المتغيرات تلقائياً باسم كل عميل وآخر خدمة وكابتن حجز معه:
            </p>

            <div className="p-3.5 bg-paper rounded-xl border border-border text-xs text-ink font-sans leading-relaxed whitespace-pre-line space-y-2">
              <p className="text-forest font-bold">📋 نص الرسالة الافتراضي المعتمد:</p>
              <p className="text-ink-soft text-[11px] bg-white p-2.5 rounded-lg border border-border/80">
                أهلاً يا [اسم العميل]! 💈✨<br />
                وحشتنا في صالون TrimMind (الحداد VIP).. بقالك فترة ما شرفتناش من بعد آخر [الخدمة] مع كابتن [الكابتن]!<br /><br />
                جاهزين لك دائماً بأفضل تجربة عناية وحلاقة ملكية تليق بك 👑✂️<br /><br />
                👉 احجز موعدك القادم بضغطة واحدة من هنا:<br />
                https://trimmind.up.railway.app
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-ink-soft">المستهدفين المحددين:</span>
              <strong className="text-forest font-mono text-sm">{selectedPhones.length} عميل</strong>
            </div>

            <button
              onClick={handleSendCampaign}
              disabled={isSending || selectedPhones.length === 0}
              className="w-full py-3 bg-forest text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-forest-light transition-all shadow-md disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isSending ? 'جاري الإرسال...' : `إرسال الحملة (${selectedPhones.length}) الآن`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Campaigns History */}
      {campaigns.length > 0 && (
        <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <History className="w-4 h-4 text-forest" />
            <h4 className="font-bold text-ink text-sm">سجل الحملات السابقة ونسب إعادة الحجز (Attribution)</h4>
          </div>

          <div className="divide-y divide-border/60">
            {campaigns.map((camp) => (
              <div key={camp.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-ink">{camp.notes || 'حملة إعادة جذب'}</span>
                  <p className="text-[11px] text-ink-soft font-mono">{new Date(camp.created_at).toLocaleString('ar-EG')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-paper px-2.5 py-1 rounded-lg border border-border font-mono">
                    المرسل: {camp.total_sends || 0}
                  </span>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold font-mono">
                    أعادوا الحجز: {camp.total_rebooked || 0} ✓
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
