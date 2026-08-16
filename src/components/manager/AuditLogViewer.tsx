import React from 'react';
import { useSalonStore } from '../../lib/store';
import { formatDateTime, ROLE_CONFIG } from '../../lib/utils';
import { Shield, FileText, UserCheck, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; badgeColor: string }> = {
  CREATE_BOOKING: { label: 'حجز موعد جديد', badgeColor: 'bg-forest/10 text-forest border-forest/30' },
  STATUS_IN_SERVICE: { label: 'استدعاء للكرسي', badgeColor: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30' },
  STATUS_COMPLETED: { label: 'اكتمال جلسة الحلاقة', badgeColor: 'bg-forest text-paper border-forest' },
  STATUS_CANCELLED: { label: 'إلغاء الموعد', badgeColor: 'bg-red-500/10 text-red-700 border-red-500/30' },
  STATUS_CONFIRMED: { label: 'تأكيد الحجز', badgeColor: 'bg-forest/15 text-forest border-forest/30' },
  STATUS_CUSTOMER_ARRIVED: { label: 'تسجيل وصول العميل', badgeColor: 'bg-amber-500/10 text-amber-800 border-amber-500/30' },
  APPROVE_PAYMENT_PROOF: { label: 'اعتماد إيصال التحويل', badgeColor: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30' },
  REJECT_PAYMENT_PROOF: { label: 'رفض إيصال التحويل', badgeColor: 'bg-red-500/10 text-red-700 border-red-500/30' },
  UPDATE_BOOKING_INVOICE: { label: 'تعديل الفاتورة والخدمات', badgeColor: 'bg-terra/15 text-terra-deep border-terra/30' },
  ADD_BOOKING_ITEM: { label: 'إضافة مشروب / منتج', badgeColor: 'bg-amber-500/10 text-amber-800 border-amber-500/30' },
  UPDATE_SETTINGS: { label: 'تحديث إعدادات الصالون', badgeColor: 'bg-paper-deep text-ink border-border' },
  START_SERVICE: { label: 'بدء تقديم الخدمة', badgeColor: 'bg-forest/10 text-forest border-forest/30' },
};

const formatMetadataHuman = (meta: Record<string, any> | undefined): string => {
  if (!meta || typeof meta !== 'object' || Object.keys(meta).length === 0) {
    return 'عملية قياسية مسجلة في المنظومة';
  }

  const parts: string[] = [];

  if (meta.note) {
    parts.push(meta.note);
  }

  if (meta.old_total !== undefined && meta.new_total !== undefined) {
    parts.push(`تعديل الحساب من ${meta.old_total} ج.م إلى ${meta.new_total} ج.م`);
  }

  if (meta.amount) {
    parts.push(`المبلغ المحول: ${meta.amount} ج.م (عبر ${meta.method === 'instapay' ? 'إنستاباي' : meta.method === 'vodafone_cash' ? 'فودافون كاش' : meta.method || 'التحويل الإلكتروني'})`);
  }

  if (meta.to_status) {
    const statusArabic =
      meta.to_status === 'in_service'
        ? 'على الكرسي الآن'
        : meta.to_status === 'completed'
        ? 'مكتمل بنجاح'
        : meta.to_status === 'confirmed'
        ? 'حجز مؤكد'
        : meta.to_status === 'customer_arrived'
        ? 'وصل للصالون'
        : meta.to_status === 'cancelled'
        ? 'ملغي'
        : meta.to_status;
    if (!meta.note) {
      parts.push(`تم تحويل الحالة إلى: ${statusArabic}`);
    }
  }

  if (meta.service) {
    parts.push(`الخدمة: ${meta.service}`);
  }

  if (meta.product_name) {
    parts.push(`تمت إضافة: ${meta.product_name} (${meta.quantity || 1} قطعة - ${meta.price || ''} ج.م)`);
  }

  if (meta.status === 'approved') {
    if (!meta.amount) parts.push('تمت مطابقة الإيصال وقبول المعاملة بنجاح');
  } else if (meta.status === 'rejected') {
    parts.push(`السبب: ${meta.reason || 'المبلغ غير مطابق'}`);
  }

  if (meta.key) {
    parts.push(`تحديث بند (${meta.key}) من ${meta.old_value} إلى ${meta.new_value}`);
  }

  if (parts.length === 0) {
    // If no mapped keys found, create clean readable text
    return Object.entries(meta)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' • ');
  }

  return parts.join(' • ');
};

export const AuditLogViewer: React.FC = () => {
  const { auditLogs } = useSalonStore();

  return (
    <div className="space-y-4 font-sans text-ink">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-forest/10 text-forest border border-forest/20 flex items-center justify-center shadow-xs shrink-0">
            <Shield className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-serif font-bold text-ink text-sm sm:text-base truncate">
              سجل التدقيق والأمان غير القابل للتعديل
            </h3>
            <p className="text-[11px] text-ink-mute truncate">تتبع فوري وموثق لكافة العمليات وتغيير الحالات</p>
          </div>
        </div>

        <span className="font-mono text-forest bg-forest/10 border border-forest/20 px-2.5 py-1 rounded-full font-bold text-xs shrink-0">
          {auditLogs.length} عملية
        </span>
      </div>

      {/* 1. Mobile Feed View (Ultra-Compact, Space-Efficient, Zero Wasted Area) */}
      <div className="space-y-2.5 md:hidden">
        {auditLogs.map((log) => {
          const roleConfig = (log.actor_role && ROLE_CONFIG[log.actor_role]) || ROLE_CONFIG.manager;
          const actionConfig = ACTION_LABELS[log.action] || {
            label: log.action,
            badgeColor: 'bg-paper-deep text-ink border-border',
          };
          const humanDescription = formatMetadataHuman(log.metadata);
          const targetName =
            log.target_table === 'bookings'
              ? 'حجز'
              : log.target_table === 'payment_proofs'
              ? 'إيصال'
              : log.target_table === 'settings'
              ? 'إعدادات'
              : log.target_table;

          return (
            <div
              key={log.id}
              className="p-3 rounded-2xl bg-paper-warm/80 border border-border space-y-2 shadow-xs transition-all hover:bg-white"
            >
              {/* Row 1: Actor + Role + Timestamp in one sleek row */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-ink text-xs truncate max-w-[170px]">
                    {log.actor_name}
                  </span>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${roleConfig.color}`}
                  >
                    {roleConfig.label}
                  </span>
                </div>

                <span className="text-[10px] text-ink-mute font-mono shrink-0 whitespace-nowrap bg-white px-2 py-0.5 rounded border border-border/80">
                  {formatDateTime(log.created_at)}
                </span>
              </div>

              {/* Row 2: Action Badge + Target Entity */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`font-bold px-2 py-0.5 rounded-lg border text-[10.5px] ${actionConfig.badgeColor}`}
                >
                  {actionConfig.label}
                </span>
                {log.target_table && (
                  <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-border text-ink-soft">
                    {targetName} {log.target_id ? `(#${log.target_id})` : ''}
                  </span>
                )}
              </div>

              {/* Row 3: Concise Details Box */}
              <div className="bg-white p-2.5 rounded-xl border border-border/80 text-[11.5px] text-ink leading-relaxed">
                <p className="font-medium text-ink-soft">{humanDescription}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Desktop Table View (For Tablets, Laptops & Desktops) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="border-b border-border text-ink-mute text-[11px] font-bold">
              <th className="pb-3 pr-3">التوقيت والتاريخ</th>
              <th className="pb-3">المستخدم والصفة</th>
              <th className="pb-3">نوع الإجراء</th>
              <th className="pb-3">الهدف المسجل</th>
              <th className="pb-3 pl-3">البيانات الوصفية والإيضاحات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {auditLogs.map((log) => {
              const roleConfig = (log.actor_role && ROLE_CONFIG[log.actor_role]) || ROLE_CONFIG.manager;
              const actionConfig = ACTION_LABELS[log.action] || {
                label: log.action,
                badgeColor: 'bg-paper-deep text-ink border-border',
              };
              const humanDescription = formatMetadataHuman(log.metadata);

              return (
                <tr key={log.id} className="hover:bg-paper-warm/80 transition-colors">
                  <td className="py-3.5 pr-3 text-ink-mute font-mono text-[11px] whitespace-nowrap">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="py-3.5 whitespace-nowrap">
                    <span className="text-ink font-bold block">{log.actor_name}</span>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleConfig.color}`}
                    >
                      {roleConfig.label}
                    </span>
                  </td>
                  <td className="py-3.5 whitespace-nowrap">
                    <span
                      className={`font-bold px-2.5 py-1 rounded-xl border text-[11px] inline-block ${actionConfig.badgeColor}`}
                    >
                      {actionConfig.label}
                    </span>
                  </td>
                  <td className="py-3.5 whitespace-nowrap font-mono text-ink-soft">
                    <span className="bg-paper-warm px-2 py-1 rounded-lg border border-border">
                      {log.target_table === 'bookings'
                        ? 'حجز'
                        : log.target_table === 'payment_proofs'
                        ? 'إيصال دفع'
                        : log.target_table === 'settings'
                        ? 'الإعدادات'
                        : log.target_table}{' '}
                      {log.target_id && `(#${log.target_id})`}
                    </span>
                  </td>
                  <td className="py-3.5 pl-3 text-ink leading-relaxed max-w-md">
                    <p className="text-xs text-ink-soft bg-paper-warm/50 p-2 rounded-xl border border-border/70">
                      {humanDescription}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
