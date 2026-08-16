// Cross-tab & Multi-device Live Synchronization Layer
import { playCallChime } from './utils';
import toast from 'react-hot-toast';

export type SyncEventType =
  | 'SYNC_STATE'
  | 'BOOKING_CANCELLED'
  | 'CUSTOMER_CALLED'
  | 'BOOKING_CREATED'
  | 'PAYMENT_PROOF_REVIEWED'
  | 'NOTIFICATION_CREATED'
  | 'NOTIFICATION_DELETED';

export interface SyncMessage {
  type: SyncEventType;
  payload?: any;
  senderId: string;
  timestamp: number;
}

const TAB_ID = `tab-${Math.random().toString(36).substring(2, 9)}`;

let channel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel('clinicmind_realtime_sync');
  }
} catch (e) {
  console.warn('BroadcastChannel not supported or restricted, fallback to storage events');
}

export const broadcastEvent = (type: SyncEventType, payload?: any) => {
  const message: SyncMessage = {
    type,
    payload,
    senderId: TAB_ID,
    timestamp: Date.now(),
  };

  if (channel) {
    try {
      channel.postMessage(message);
    } catch (err) {
      console.error('Error broadcasting message:', err);
    }
  }

  // Fallback / local storage trigger
  try {
    localStorage.setItem('clinicmind_sync_ping', JSON.stringify(message));
  } catch (e) {}
};

export const initRealtimeSync = (
  onStateSync: (payload?: any) => void,
  onBookingCancelled?: (data: { bookingId: string; customerName?: string; queueNumber?: number }) => void,
  onCustomerCalled?: (data: any) => void
) => {
  const handleMessage = (msg: SyncMessage) => {
    if (!msg || msg.senderId === TAB_ID) return;

    if (msg.type === 'SYNC_STATE') {
      onStateSync(msg.payload);
    } else if (msg.type === 'BOOKING_CANCELLED') {
      onStateSync();
      if (onBookingCancelled && msg.payload) {
        onBookingCancelled(msg.payload);
      }
      toast(
        `🔔 تحديث فوري: تم إلغاء حجز ${msg.payload?.customerName || 'أحد العملاء'} (رقم الدور #${msg.payload?.queueNumber || ''}) وتم ترحيل الأدوار تلقائياً`,
        {
          duration: 4500,
          style: {
            borderRadius: '16px',
            background: '#ffffff',
            color: '#1e3a2e',
            border: '1px solid #e5e0d3',
            fontSize: '12px',
            fontWeight: 'bold',
          },
        }
      );
    } else if (msg.type === 'CUSTOMER_CALLED') {
      onStateSync();
      playCallChime();
      if (onCustomerCalled && msg.payload) {
        onCustomerCalled(msg.payload);
      }
    } else if (msg.type === 'BOOKING_CREATED') {
      onStateSync();
    } else if (msg.type === 'PAYMENT_PROOF_REVIEWED') {
      onStateSync();
    }
  };

  if (channel) {
    channel.onmessage = (event) => {
      handleMessage(event.data);
    };
  }

  // Listen to storage events for browsers where BroadcastChannel might be isolated
  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'clinicmind_sync_ping' && e.newValue) {
      try {
        const msg = JSON.parse(e.newValue);
        handleMessage(msg);
      } catch (err) {}
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('storage', handleStorage);
  };
};
