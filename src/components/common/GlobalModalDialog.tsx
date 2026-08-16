import React from 'react';
import { useDialogStore, DialogType } from '../../lib/dialogStore';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  X,
  ShieldAlert,
} from 'lucide-react';

export const GlobalModalDialog: React.FC = () => {
  const { isOpen, options, confirm, cancel, closeDialog } = useDialogStore();

  if (!isOpen || !options) return null;

  const {
    title,
    message,
    type = 'info',
    confirmText = 'تأكيد',
    cancelText = 'تراجع وإلغاء',
    showCancel = true,
  } = options;

  const getIconAndColors = (dialogType: DialogType) => {
    switch (dialogType) {
      case 'danger':
        return {
          icon: <ShieldAlert className="w-6 h-6 text-rose-600" />,
          iconBg: 'bg-rose-100 border-rose-200',
          confirmBtnClass:
            'bg-rose-600 hover:bg-rose-700 text-white shadow-clinic-1',
          accentColor: 'text-rose-950',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-amber-600" />,
          iconBg: 'bg-amber-100 border-amber-200',
          confirmBtnClass:
            'bg-terra hover:bg-terra-deep text-white shadow-clinic-1',
          accentColor: 'text-amber-950',
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
          iconBg: 'bg-emerald-100 border-emerald-200',
          confirmBtnClass:
            'bg-forest hover:bg-forest-soft text-paper shadow-clinic-1',
          accentColor: 'text-emerald-950',
        };
      case 'info':
      default:
        return {
          icon: <Info className="w-6 h-6 text-forest" />,
          iconBg: 'bg-forest/10 border-forest/20',
          confirmBtnClass:
            'bg-forest hover:bg-forest-soft text-paper shadow-clinic-1',
          accentColor: 'text-forest',
        };
    }
  };

  const { icon, iconBg, confirmBtnClass } = getIconAndColors(type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/65 backdrop-blur-sm animate-in fade-in duration-200 font-sans text-ink">
      <div className="clinic-card w-full max-w-md p-6 sm:p-7 shadow-clinic-3 space-y-5 bg-white animate-in zoom-in-95 duration-200 text-right">
        {/* Header with Custom Icon */}
        <div className="flex items-center justify-between border-b border-border pb-3.5">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 shadow-xs ${iconBg}`}
            >
              {icon}
            </div>
            <div>
              <h3 className="font-serif font-bold text-ink text-base">
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={closeDialog}
            className="p-1.5 text-ink-mute hover:text-ink rounded-xl bg-paper-warm transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dialog Body Message */}
        <div className="text-xs text-ink-soft leading-relaxed space-y-2">
          {typeof message === 'string' ? (
            <p className="font-medium text-ink">{message}</p>
          ) : (
            message
          )}
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          {showCancel && (
            <button
              type="button"
              onClick={cancel}
              className="btn-clinic-ghost text-xs px-4 py-2.5 font-bold"
            >
              {cancelText}
            </button>
          )}

          <button
            type="button"
            onClick={confirm}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${confirmBtnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
