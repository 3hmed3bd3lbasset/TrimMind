import React, { useState, useRef, useEffect } from 'react';
import { useSalonStore } from '../../lib/store';
import { AIMessage, UserRole } from '../../types';
import {
  processAiMessage,
  getInitialGreeting,
  getAiQuotaStatus,
  AiQuotaStatus,
  AI_RATE_LIMIT,
} from '../../lib/aiService';
import {
  Sparkles,
  X,
  Send,
  Scissors,
  MapPin,
  Clock,
  CalendarCheck,
  Bot,
  User,
  Trash2,
  ChevronLeft,
  Armchair,
  Receipt,
  TrendingUp,
  Award,
  Shield,
  UserCheck,
  AlertTriangle,
  Timer,
  CheckCircle,
  Star,
  Crown,
} from 'lucide-react';
import { formatCurrency, generateUUID } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

const FormattedMessageText: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
  if (isUser) {
    return <p className="whitespace-pre-line leading-relaxed font-semibold">{content}</p>;
  }

  // Split content by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-xs leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const codeLines = part.slice(3, -3).trim().split('\n');
          const firstLine = codeLines[0]?.trim() || '';
          const isLangHeader = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const lang = isLangHeader ? firstLine : '';
          const code = (isLangHeader ? codeLines.slice(1) : codeLines).join('\n');

          return (
            <div key={index} className="my-2 rounded-xl overflow-hidden border border-border/40 bg-[#161b22] text-[#e6edf3]">
              {lang && (
                <div className="px-3 py-1 bg-[#21262d] text-[10px] font-mono text-[#8b949e] border-b border-[#30363d] flex justify-between items-center">
                  <span>{lang}</span>
                </div>
              )}
              <pre className="p-3 font-mono text-[11px] overflow-x-auto text-left" dir="ltr">
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        // Regular markdown text parsing
        const lines = part.split('\n');
        return (
          <div key={index} className="space-y-1.5">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={lineIdx} className="h-1" />;
              }

              // Headers
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="font-bold text-ink text-xs pt-1.5 text-forest">
                    {parseInlineMarkdown(trimmed.replace(/^###\s+/, ''))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
                return (
                  <h3 key={lineIdx} className="font-bold text-ink text-sm pt-2 text-forest">
                    {parseInlineMarkdown(trimmed.replace(/^#+\s+/, ''))}
                  </h3>
                );
              }

              // Bullet points
              if (/^[•\-\*]\s+/.test(trimmed)) {
                return (
                  <div key={lineIdx} className="flex items-start gap-1.5 pr-1">
                    <span className="text-forest text-[10px] mt-0.5">•</span>
                    <span className="flex-1">{parseInlineMarkdown(trimmed.replace(/^[•\-\*]\s+/, ''))}</span>
                  </div>
                );
              }

              // Numbered lists
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
              if (numMatch) {
                return (
                  <div key={lineIdx} className="flex items-start gap-1.5 pr-1">
                    <span className="font-bold text-forest text-[11px] min-w-[16px]">{numMatch[1]}.</span>
                    <span className="flex-1">{parseInlineMarkdown(numMatch[2])}</span>
                  </div>
                );
              }

              // Regular paragraph
              return (
                <p key={lineIdx} className="leading-relaxed">
                  {parseInlineMarkdown(trimmed)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

// Helper for inline markdown: **bold**, *italic*, `code`
function parseInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-bold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={i} className="italic text-ink-soft">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-paper-warm text-terra-deep font-mono text-[10.5px] border border-border/60 mx-0.5"
          dir="ltr"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export const AIChatDrawer: React.FC = () => {
  const { isAiDrawerOpen, setAiDrawerOpen, currentUser, switchRole, settings } = useSalonStore();
  const salonDisplayName = settings?.salon_name || 'صالون VIP';
  const [messages, setMessages] = useState<AIMessage[]>([getInitialGreeting(currentUser)]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quota, setQuota] = useState<AiQuotaStatus>(getAiQuotaStatus(currentUser.role));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Reset/update greeting & quota whenever current user role/identity changes
  useEffect(() => {
    setMessages([getInitialGreeting(currentUser)]);
    setQuota(getAiQuotaStatus(currentUser.role));
  }, [currentUser.role, currentUser.full_name]);

  // Live timer to refresh quota status for customers
  useEffect(() => {
    const interval = setInterval(() => {
      setQuota(getAiQuotaStatus(currentUser.role));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentUser.role]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAiDrawerOpen) {
      setQuota(getAiQuotaStatus(currentUser.role));
      scrollToBottom();
    }
  }, [messages, isAiDrawerOpen, currentUser.role]);

  if (!isAiDrawerOpen) return null;

  const isCustomer = currentUser.role === 'customer';
  const isInputDisabled = isCustomer && quota.isBlocked;

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || isLoading || (isCustomer && quota.isBlocked)) return;

    const userMessage: AIMessage = {
      id: generateUUID(),
      conversation_id: 'conv-1',
      role: 'user',
      content: query.trim(),
      created_at: new Date().toISOString(),
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInputText('');
    setIsLoading(true);

    try {
      const botResponse = await processAiMessage(query.trim(), newHistory);
      setMessages((prev) => [...prev, botResponse]);
      setQuota(getAiQuotaStatus(currentUser.role));
    } catch (err) {
      console.error('AI chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([getInitialGreeting(currentUser)]);
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-ink/40 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-y-0 left-0 max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen max-w-md bg-paper border-r border-border shadow-clinic-3 flex flex-col justify-between">
          {/* 1. Header with Role Switch Tabs & Quota Indicator */}
          <div className="p-4 border-b border-border bg-paper-warm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-forest text-paper flex items-center justify-center shadow-clinic-1">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-ink text-sm flex items-center gap-1.5">
                    <span>المساعد الذكي (AI Concierge)</span>
                    <span className="w-2 h-2 rounded-full bg-ok animate-ping" />
                  </h3>
                  <p className="text-[11px] text-ink-mute truncate max-w-[200px]">
                    {currentUser.role === 'barber'
                      ? `في خدمة: ${currentUser.full_name}`
                      : currentUser.role === 'receptionist'
                      ? `يتحدث مع: ${currentUser.full_name}`
                      : currentUser.role === 'manager'
                      ? `في خدمة: ${currentUser.full_name}`
                      : `في خدمة: عميل ${salonDisplayName}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleClearChat}
                  className="p-2 rounded-xl text-ink-mute hover:text-terra hover:bg-paper transition-colors"
                  title="مسح المحادثة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setAiDrawerOpen(false)}
                  className="p-2 rounded-xl text-ink-mute hover:text-ink hover:bg-paper transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Active Role Context Badge */}
            <div className="flex items-center justify-between bg-white/70 px-3 py-1.5 rounded-2xl border border-border text-[11px]">
              <div className="flex items-center gap-1.5">
                {currentUser.role === 'manager' ? (
                  <Shield className="w-3.5 h-3.5 text-ink" />
                ) : currentUser.role === 'receptionist' ? (
                  <UserCheck className="w-3.5 h-3.5 text-terra" />
                ) : currentUser.role === 'barber' ? (
                  <Scissors className="w-3.5 h-3.5 text-forest" />
                ) : (
                  <User className="w-3.5 h-3.5 text-forest" />
                )}
                <span className="font-bold text-ink">
                  {currentUser.role === 'manager'
                    ? 'المساعد الذكي لإدارة الصالون'
                    : currentUser.role === 'receptionist'
                    ? 'المساعد الذكي لموظف الاستقبال'
                    : currentUser.role === 'barber'
                    ? 'المساعد الذكي للكابتن'
                    : 'مساعد خدمة العملاء والحجوزات'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-ink-mute bg-paper px-2 py-0.5 rounded-md border border-border">
                {currentUser.role === 'customer' ? 'عميل' : currentUser.role.toUpperCase()}
              </span>
            </div>

            {/* Quota Banner */}
            {isCustomer ? (
              <div className="flex items-center justify-between text-[11px] bg-white/80 px-3.5 py-1.5 rounded-full border border-border text-ink-mute shadow-clinic-1">
                <div className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-terra" />
                  <span>
                    رصيد العميل:{' '}
                    <strong className={quota.remaining <= 2 ? 'text-terra-deep' : 'text-forest'}>
                      {quota.remaining} / {quota.total}
                    </strong>{' '}
                    رسالة
                  </span>
                </div>
                <span className="font-mono text-[10px] text-ink-mute">
                  تتجدد خلال: <span className="text-ink font-bold">{formatCountdown(quota.secondsRemaining)}</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px] bg-forest/10 px-3.5 py-1.5 rounded-full border border-forest/20 text-forest font-bold">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-forest" />
                  <span>صلاحيات خاصة وغير محدودة</span>
                </div>
                <span className="text-[10px] bg-forest text-paper px-2 py-0.5 rounded-full font-mono">
                  UNLIMITED
                </span>
              </div>
            )}
          </div>

          {/* 2. Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-forest text-paper font-bold'
                      : 'bg-paper-warm text-forest border border-border'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[82%] rounded-2xl p-3.5 space-y-2.5 shadow-clinic-1 ${
                    msg.role === 'user'
                      ? 'bg-forest text-paper font-semibold rounded-tl-none'
                      : 'bg-white text-ink border border-border-soft rounded-tr-none'
                  }`}
                >
                  <FormattedMessageText content={msg.content} isUser={msg.role === 'user'} />

                  {/* Quick Action Buttons for Barber */}
                  {msg.payload?.type === 'quick_actions_barber' && (
                    <div className="pt-2 border-t border-border-soft flex flex-col gap-1.5">
                      <p className="text-[10px] text-forest font-bold">مهام سريعة للكابتن:</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleSendMessage('مين العملاء اللي في انتظار دورهم عندي؟')}
                          className="px-2.5 py-1.5 rounded-full bg-paper-warm hover:bg-white border border-border text-forest text-[11px] font-bold"
                        >
                          طابور العملاء
                        </button>
                        <button
                          onClick={() => handleSendMessage('إيه أسعار باقات العناية بالبشرة واللحية؟')}
                          className="px-2.5 py-1.5 rounded-full bg-paper-warm hover:bg-white border border-border text-ink-soft text-[11px] font-medium"
                        >
                          أسعار باقات العناية
                        </button>
                        <button
                          onClick={() => {
                            setAiDrawerOpen(false);
                            navigate('/barber');
                          }}
                          className="px-2.5 py-1.5 rounded-full bg-forest text-paper text-[11px] font-bold"
                        >
                          فتح شاشة الكابتن
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.payload?.type === 'quick_actions_receptionist' && (
                    <div className="pt-2 border-t border-border-soft flex flex-col gap-1.5">
                      <p className="text-[10px] text-terra-deep font-bold">مهام خادم الاستقبال الذكي:</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleSendMessage('افتحلي صفحة الحجوزات')}
                          className="px-2.5 py-1.5 rounded-full bg-forest text-paper text-[11px] font-bold shadow-xs hover:bg-forest-soft"
                        >
                          📋 فتح الحجوزات
                        </button>
                        <button
                          onClick={() => handleSendMessage('افتح شاشة الانتظار')}
                          className="px-2.5 py-1.5 rounded-full bg-terra text-paper text-[11px] font-bold shadow-xs hover:bg-terra-deep"
                        >
                          📺 شاشة التلفزيون
                        </button>
                        <button
                          onClick={() => handleSendMessage('حجوزات النهاردة')}
                          className="px-2.5 py-1.5 rounded-full bg-paper-warm hover:bg-white border border-border text-ink-soft text-[11px]"
                        >
                          استعراض الحجوزات
                        </button>
                        <button
                          onClick={() => handleSendMessage('إيه وضع الكراسي والإيصالات دلوقتي؟')}
                          className="px-2.5 py-1.5 rounded-full bg-paper-warm hover:bg-white border border-border text-terra-deep text-[11px] font-bold"
                        >
                          الكراسي والإيصالات
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.payload?.type === 'quick_actions_manager' && (
                    <div className="pt-2 border-t border-border-soft flex flex-col gap-1.5">
                      <p className="text-[10px] text-forest font-bold">أوامر وسلطات المدير التنفيذية:</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleSendMessage('افتحلي صفحة الحجوزات')}
                          className="px-2.5 py-1.5 rounded-full bg-forest text-paper text-[11px] font-bold shadow-xs hover:bg-forest-soft"
                        >
                          📋 فتح الحجوزات
                        </button>
                        <button
                          onClick={() => handleSendMessage('افتح شاشة الانتظار')}
                          className="px-2.5 py-1.5 rounded-full bg-terra text-paper text-[11px] font-bold shadow-xs hover:bg-terra-deep"
                        >
                          📺 شاشة التلفزيون
                        </button>
                        <button
                          onClick={() => handleSendMessage('افتح كتالوج الخدمات')}
                          className="px-2.5 py-1.5 rounded-full bg-paper-warm hover:bg-white border border-border text-ink font-bold text-[11px]"
                        >
                          ✂️ كتالوج الخدمات
                        </button>
                        <button
                          onClick={() => handleSendMessage('افتح التقارير المالية')}
                          className="px-2.5 py-1.5 rounded-full bg-paper-warm hover:bg-white border border-border text-forest text-[11px] font-bold"
                        >
                          📊 تقرير الإيرادات
                        </button>
                        <button
                          onClick={() => handleSendMessage('حجوزات النهاردة')}
                          className="px-2.5 py-1.5 rounded-full bg-paper-warm hover:bg-white border border-border text-ink-soft text-[11px]"
                        >
                          قائمة الحجوزات
                        </button>
                      </div>
                    </div>
                  )}

                  {msg.payload?.type === 'quick_actions_customer' && (
                    <div className="pt-2 border-t border-border-soft flex flex-col gap-1.5">
                      <p className="text-[10px] text-forest font-bold">خيارات سريعة واستفسارات شائعة:</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleSendMessage('ايه الفرق بين الحجز العادي والـ VIP؟')}
                          className="px-2.5 py-1 rounded-full bg-paper-warm hover:bg-white border border-border text-ink font-bold text-[11px]"
                        >
                          👑 مميزات VIP vs العادي
                        </button>
                        <button
                          onClick={() => handleSendMessage('انا مستعجل وعايز اقرب وقت متاح')}
                          className="px-2.5 py-1 rounded-full bg-terra/10 hover:bg-terra text-terra hover:text-paper border border-terra/30 text-[11px] font-bold"
                        >
                          ⚡ أنا مستعجل (أقرب موعد)
                        </button>
                        <button
                          onClick={() => handleSendMessage('عايز احجز بكره الساعه 5')}
                          className="px-2.5 py-1 rounded-full bg-paper-warm hover:bg-white border border-border text-ink-soft text-[11px]"
                        >
                          📅 حجز موعد محدد
                        </button>
                        <button
                          onClick={() => handleSendMessage('ما هي باقات وخدمات صالون النخبة؟')}
                          className="px-2.5 py-1 rounded-full bg-paper-warm hover:bg-white border border-border text-ink-soft text-[11px]"
                        >
                          الخدمات والأسعار
                        </button>
                        <button
                          onClick={() => handleSendMessage('عايز احجز موعد لجناح VIP')}
                          className="px-2.5 py-1 rounded-full bg-forest text-paper text-[11px] font-bold"
                        >
                          حجز جناح VIP 👑
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Render VIP Pitch Card */}
                  {msg.payload?.type === 'vip_pitch_card' && (
                    <div className="pt-2 flex flex-col gap-2">
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          navigate('/book?type=vip');
                        }}
                        className="btn-clinic-primary w-full text-xs py-2.5 flex items-center justify-center gap-1.5 shadow-clinic-1 font-bold"
                      >
                        <Crown className="w-4 h-4 text-amber-300" />
                        <span>حجز جناح كبار الزوار (VIP Suite 👑)</span>
                      </button>
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          navigate('/book?type=normal');
                        }}
                        className="btn-clinic-ghost w-full text-xs py-2 border border-border text-ink font-bold"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>حجز عادي في الصالة العامة ✂️</span>
                      </button>
                    </div>
                  )}

                  {/* Render Choose Booking Type */}
                  {msg.payload?.type === 'choose_booking_type' && (
                    <div className="pt-2 flex flex-col gap-2">
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          navigate('/book?type=vip');
                        }}
                        className="btn-clinic-primary w-full text-xs py-2.5 flex items-center justify-center gap-1.5 shadow-clinic-1 font-bold"
                      >
                        <Crown className="w-4 h-4 text-amber-300" />
                        <span>تأكيد حجز جناح VIP الملكي 👑</span>
                      </button>
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          navigate('/book?type=normal');
                        }}
                        className="btn-clinic-ghost w-full text-xs py-2 border border-border text-ink font-bold"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>تأكيد الحجز العادي في الصالة ✂️</span>
                      </button>
                    </div>
                  )}

                  {/* Render Slot Suggestions Card */}
                  {msg.payload?.type === 'slots_suggest_card' && (
                    <div className="pt-2 space-y-2">
                      <p className="text-[11px] font-bold text-ink-soft">اختر موعداً بديلاً متاحاً اليوم:</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {msg.payload.availableTimes?.map((t: string) => (
                          <button
                            key={t}
                            onClick={() => {
                              setAiDrawerOpen(false);
                              navigate('/book');
                            }}
                            className="p-2 rounded-xl bg-paper-warm hover:bg-forest hover:text-white border border-border text-center text-xs font-bold transition-all"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          navigate('/book');
                        }}
                        className="btn-clinic-primary w-full text-xs py-2 font-bold"
                      >
                        تصفح جدول الأيام والمواعيد كاملة ↗
                      </button>
                    </div>
                  )}

                  {/* Render Navigation Action Button */}
                  {msg.payload?.type === 'navigation_action' && (
                    <div className="pt-2">
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          if (msg.payload?.targetUrl) {
                            navigate(msg.payload.targetUrl);
                          }
                        }}
                        className="btn-clinic-primary w-full text-xs py-2.5 flex items-center justify-center gap-1.5 shadow-clinic-1 font-bold"
                      >
                        <span>{msg.payload?.buttonLabel || 'الانتقال للصفحة ↗'}</span>
                      </button>
                    </div>
                  )}

                  {/* Render Open Tab Action Button */}
                  {msg.payload?.type === 'open_tab_action' && (
                    <div className="pt-2">
                      <a
                        href={msg.payload?.targetUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-clinic-terra w-full text-xs py-2.5 flex items-center justify-center gap-1.5 shadow-clinic-1 font-bold"
                      >
                        <span>{msg.payload?.buttonLabel || 'فتح النافذة ↗'}</span>
                      </a>
                    </div>
                  )}

                  {/* Render Booking Cancelled Card */}
                  {msg.payload?.type === 'booking_cancelled_card' && (
                    <div className="mt-2 bg-rose-50/90 p-3 rounded-2xl border border-rose-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-rose-800">
                        <span className="flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حجز ملغي بنجاح</span>
                        </span>
                        <span className="text-[10px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full font-mono font-bold">
                          {msg.payload.booking?.id?.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-ink-soft text-[11px]">العميل: <strong className="text-ink">{msg.payload.booking?.customer_name}</strong></p>
                      <p className="text-ink-mute text-[10px]">تم تحديث جدول الكراسي وإخلاء الموعد فورياً.</p>
                    </div>
                  )}

                  {/* Render Cancel Selection Card */}
                  {msg.payload?.type === 'cancel_select_card' && (
                    <div className="mt-2 space-y-1.5 bg-paper-warm/90 p-3 rounded-2xl border border-border">
                      <p className="text-[11px] font-bold text-terra-deep">اختر الحجز لإلغائه فوراً:</p>
                      {msg.payload.bookings?.map((b: any) => (
                        <div
                          key={b.id}
                          className="p-2 rounded-xl bg-white hover:bg-rose-50 border border-border hover:border-rose-300 flex items-center justify-between transition-all"
                        >
                          <div>
                            <p className="font-bold text-ink text-[11px]">{b.customer_name}</p>
                            <p className="text-[10px] text-ink-mute">
                              موعد: {b.starts_at ? b.starts_at.slice(11, 16) : 'الآن'} | كود: {b.id.slice(0, 8).toUpperCase()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleSendMessage(`الغي حجز ${b.customer_name}`)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold shadow-xs transition-all"
                          >
                            إلغاء ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Render Booking Created Card */}
                  {msg.payload?.type === 'booking_created_card' && (
                    <div className="mt-2 bg-emerald-50/90 p-3 rounded-2xl border border-emerald-200 text-xs space-y-2">
                      <div className="flex items-center justify-between font-bold text-emerald-800">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>حجز جديد مؤكد</span>
                        </span>
                        <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full font-mono font-bold">
                          {msg.payload.booking?.id?.slice(0, 8).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-ink-soft text-[11px]">العميل: <strong className="text-ink">{msg.payload.booking?.customer_name}</strong></p>
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          if (msg.payload?.booking?.id) {
                            navigate(`/track?q=${msg.payload.booking.id}`);
                          } else {
                            navigate('/track');
                          }
                        }}
                        className="btn-clinic-primary w-full text-[11px] py-1.5 font-bold"
                      >
                        تتبع الحجز في شاشة التتبع ↗
                      </button>
                    </div>
                  )}

                  {/* Render Security Blocked Alert */}
                  {msg.payload?.type === 'security_blocked' && (
                    <div className="mt-2 bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-amber-900 text-[11px] flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-700 shrink-0" />
                      <span className="font-bold">بروتوكول الأمان المالي: رصيد الخزنة مشفر ومحمي تماماً.</span>
                    </div>
                  )}

                  {/* Render Services List */}
                  {msg.payload?.type === 'services_list' && (
                    <div className="space-y-1.5 pt-2">
                      {msg.payload.data?.map((srv: any) => (
                        <div
                          key={srv.id}
                          className="bg-paper-warm/80 p-2.5 rounded-xl border border-border flex items-center justify-between"
                        >
                          <div>
                            <p className="font-bold text-ink text-[11px]">{srv.name}</p>
                            <p className="text-[10px] text-ink-mute">المدة: {srv.duration_minutes} دقيقة</p>
                          </div>
                          <span className="text-forest font-bold text-xs">
                            {formatCurrency(srv.price)}
                          </span>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          navigate('/book');
                        }}
                        className="btn-clinic-primary w-full mt-2 text-xs py-2"
                      >
                        <CalendarCheck className="w-3.5 h-3.5" />
                        <span>الانتقال لحجز باقة الآن</span>
                      </button>
                    </div>
                  )}

                  {/* Render Branches List */}
                  {msg.payload?.type === 'branches_list' && (
                    <div className="space-y-1.5 pt-2">
                      {msg.payload.data?.map((br: any) => (
                        <div
                          key={br.id}
                          className="bg-paper-warm/80 p-2.5 rounded-xl border border-border space-y-1"
                        >
                          <p className="font-bold text-forest text-[11px] flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-terra" />
                            <span>{br.name}</span>
                          </p>
                          <p className="text-[10px] text-ink-soft">{br.address}</p>
                          <p className="text-[10px] text-ink-mute flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{br.opening_time} - {br.closing_time}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Render Barbers List */}
                  {msg.payload?.type === 'barbers_list' && (
                    <div className="space-y-1.5 pt-2">
                      {msg.payload.data?.map((bar: any) => (
                        <div
                          key={bar.id}
                          className="bg-paper-warm/80 p-2.5 rounded-xl border border-border flex items-center gap-2.5"
                        >
                          <img
                            src={bar.photo_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80'}
                            alt={bar.full_name}
                            className="w-9 h-9 rounded-xl object-cover border border-border"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-ink text-[11px] truncate">{bar.full_name}</p>
                            <p className="text-[10px] text-forest font-semibold">{bar.specialty}</p>
                          </div>
                          <span className="text-forest font-bold text-[11px] flex items-center gap-1">
                            <Star className="w-3 h-3 fill-forest" />
                            <span>{bar.rating || 4.9}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Render Booking CTA */}
                  {msg.payload?.type === 'booking_cta' && (
                    <div className="pt-2">
                      <button
                        onClick={() => {
                          setAiDrawerOpen(false);
                          navigate('/book');
                        }}
                        className="btn-clinic-primary w-full text-xs py-2.5"
                      >
                        <CalendarCheck className="w-4 h-4" />
                        <span>فتح شاشة حجز موعد</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-forest text-xs py-2 bg-white px-4 rounded-full w-fit border border-border shadow-clinic-1 animate-pulse">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>المساعد الذكي يكتب رده...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* 3. Input Footer & Rate Limit Warning */}
          <div className="p-3.5 border-t border-border bg-paper-warm space-y-2">
            {isInputDisabled ? (
              <div className="bg-terra-light/60 border border-terra/40 p-3 rounded-2xl text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-terra-deep font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-terra" />
                  <span>وصلت للحد الأقصى ({quota.total} رسالة)</span>
                </div>
                <p className="text-[11px] text-ink-soft">
                  يتجدد رصيدك تلقائياً خلال:{' '}
                  <strong className="text-forest font-mono font-bold">
                    {formatCountdown(quota.secondsRemaining)}
                  </strong>
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    currentUser.role === 'barber'
                      ? 'اسأل عن الطابور أو باقات العناية يا كابتن...'
                      : currentUser.role === 'receptionist'
                      ? 'اطلب أي مساعدة في الاستقبال أو الكراسي...'
                      : currentUser.role === 'manager'
                      ? 'اطلب أي تقرير مالي أو إداري...'
                      : 'اسأل عن الباقات، الحلاقين، أو احجز موعدك...'
                  }
                  className="flex-1 bg-white border border-border rounded-full px-4 py-2.5 text-ink text-xs outline-none focus:border-forest shadow-clinic-1 transition-all placeholder:text-ink-mute"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isLoading}
                  className="p-2.5 rounded-full bg-forest text-paper hover:bg-forest-soft disabled:opacity-40 shadow-clinic-1 transition-all"
                >
                  <Send className="w-4 h-4 rotate-180" />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
