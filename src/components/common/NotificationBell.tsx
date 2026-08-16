import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSalonStore } from '../../lib/store';
import { AppNotification } from '../../types';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Receipt,
  Calendar,
  CheckCircle2,
  Clock,
  Armchair,
  Info,
  ChevronLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface NotificationBellProps {
  className?: string;
  onSelectBooking?: (bookingId: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  className = '',
  onSelectBooking,
}) => {
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    clearAllNotifications,
    currentUser,
  } = useSalonStore();

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    return true;
  });

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (notif: AppNotification) => {
    markNotificationAsRead(notif.id);
    setIsOpen(false);

    if (notif.target_id) {
      if (onSelectBooking) {
        onSelectBooking(notif.target_id);
      } else {
        // Navigate to receptionist or manager page and pass state
        if (currentUser.role === 'receptionist') {
          navigate('/receptionist', { state: { focusBookingId: notif.target_id } });
        } else if (currentUser.role === 'manager') {
          navigate('/manager', { state: { focusBookingId: notif.target_id } });
        } else {
          navigate('/track', { state: { bookingId: notif.target_id } });
        }
      }
      toast.success(`تم فتح تفاصيل الإشعار: ${notif.title}`);
    }
  };

  const handleDeleteSingle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteNotification(id);
    toast.success('تم حذف الإشعار نهائياً');
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllNotifications();
    toast.success('تم حذف كافة الإشعارات بنجاح');
  };

  const getNotifIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'pending_review':
      case 'payment_proof_submitted':
        return <Receipt className="w-4 h-4 text-terra" />;
      case 'booking_confirmed':
        return <CheckCircle2 className="w-4 h-4 text-forest" />;
      case 'in_service':
      case 'customer_arrived':
        return <Armchair className="w-4 h-4 text-forest" />;
      case 'new_booking':
      default:
        return <Calendar className="w-4 h-4 text-forest" />;
    }
  };

  const formatNotifTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
      if (diffMinutes < 1) return 'الآن';
      if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `منذ ${diffHours} ساعة`;
      return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-2xl bg-white border border-border hover:border-forest/40 hover:bg-paper-warm text-ink transition-all shadow-xs flex items-center justify-center group"
        title="مركز الإشعارات والتنبيهات"
      >
        <Bell className={`w-4.5 h-4.5 transition-transform group-hover:rotate-12 ${unreadCount > 0 ? 'text-forest animate-pulse' : 'text-ink-soft'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-terra text-white text-[10px] font-mono font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-xs border-2 border-white animate-in zoom-in-50">
            {unreadCount > 9 ? '+9' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Card */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 sm:hidden backdrop-blur-xs"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-x-4 top-20 sm:absolute sm:inset-auto sm:left-0 sm:right-auto sm:mt-2 w-auto sm:w-[390px] max-w-[calc(100vw-2rem)] mx-auto sm:mx-0 bg-white rounded-3xl border border-border shadow-clinic-3 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-right font-sans text-ink">
          {/* Header */}
          <div className="p-4 border-b border-border bg-paper-warm/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-forest/10 text-forest flex items-center justify-center font-bold">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-serif font-bold text-ink text-sm">مركز الإشعارات</h4>
                <p className="text-[10px] text-ink-mute">
                  {unreadCount > 0 ? `${unreadCount} تنبيهات غير مقروءة` : 'كافة الإشعارات مقروءة'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    markAllNotificationsAsRead();
                    toast.success('تم تحديد كافة الإشعارات كمقروءة');
                  }}
                  className="p-1.5 rounded-lg text-ink-mute hover:text-forest hover:bg-white text-[11px] font-bold flex items-center gap-1 transition-colors"
                  title="تحديد الكل كمقروء"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-forest" />
                  <span className="hidden sm:inline">قراءة الكل</span>
                </button>
              )}

              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="p-1.5 rounded-lg text-ink-mute hover:text-rose-600 hover:bg-white transition-colors text-[11px]"
                  title="حذف كافة الإشعارات"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-ink-mute hover:text-ink hover:bg-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-4 py-2 border-b border-border/70 flex items-center justify-between text-xs bg-white">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${filter === 'all' ? 'bg-forest text-paper shadow-xs' : 'text-ink-mute hover:text-ink'}`}
              >
                الكل ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${filter === 'unread' ? 'bg-forest text-paper shadow-xs' : 'text-ink-mute hover:text-ink'}`}
              >
                غير مقروء ({unreadCount})
              </button>
            </div>

            <span className="text-[10px] text-ink-mute">حفظ وتحديث فوري</span>
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto no-scrollbar divide-y divide-border/60">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 text-center space-y-2 bg-paper-warm/20">
                <div className="w-10 h-10 rounded-2xl bg-paper-deep text-ink-mute mx-auto flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="font-serif font-bold text-ink text-xs">صندوق الإشعارات فارغ</p>
                <p className="text-[11px] text-ink-mute">لا توجد تنبيهات جديدة في الوقت الحالي</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const icon = getNotifIcon(notif.type);
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3.5 hover:bg-paper-warm/70 transition-all cursor-pointer flex items-start gap-3 group relative ${!notif.read ? 'bg-paper-warm/40' : 'bg-white'}`}
                  >
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-xl bg-white border border-border shadow-xs flex items-center justify-center shrink-0 mt-0.5">
                      {icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <h5 className={`text-xs ${!notif.read ? 'font-bold text-ink' : 'font-medium text-ink-soft'}`}>
                            {notif.title}
                          </h5>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-terra shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-ink-mute font-mono shrink-0">
                          {formatNotifTime(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-[11px] text-ink-mute leading-relaxed line-clamp-2">
                        {notif.message}
                      </p>

                      {notif.target_id && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="font-mono text-[9.5px] font-bold text-forest bg-forest/10 px-1.5 py-0.2 rounded border border-forest/20">
                            {notif.target_id}
                          </span>
                          <span className="text-[10px] text-terra font-bold flex items-center gap-0.5">
                            <span>انقر لاتخاذ إجراء</span>
                            <ChevronLeft className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Delete Action Button */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSingle(e, notif.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-ink-mute hover:text-rose-600 hover:bg-rose-50 transition-all self-center"
                      title="حذف هذا الإشعار"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          </div>
        </>
      )}
    </div>
  );
};
