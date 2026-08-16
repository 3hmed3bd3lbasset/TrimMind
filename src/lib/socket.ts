import { io, Socket } from 'socket.io-client';
import { playCallChime } from './utils';
import toast from 'react-hot-toast';

const SOCKET_SERVER_URL =
  (import.meta.env.VITE_SOCKET_URL as string) ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('⚡ Connected to Live Realtime WebSockets Server');
    });

    socket.on('connect_error', (err: any) => {
      console.warn('⚠️ WebSockets connection notice (will retry):', err?.message || err);
    });
  }

  return socket;
}

export function subscribeToRealtimeEvents(callbacks: {
  onSyncState?: (data?: any) => void;
  onBookingCancelled?: (data: { bookingId: string; customerName?: string; queueNumber?: number }) => void;
  onCustomerCalled?: (data: { customerName: string; barberName: string; chairName: string; ticketNumber?: string }) => void;
  onBookingCreated?: (data: any) => void;
  onPaymentReviewed?: (data: any) => void;
}) {
  const s = getSocket();

  if (callbacks.onSyncState) {
    s.on('SYNC_STATE', (data: any) => callbacks.onSyncState?.(data));
  }

  if (callbacks.onBookingCancelled) {
    s.on('BOOKING_CANCELLED', (data: any) => {
      if (callbacks.onSyncState) callbacks.onSyncState(data);
      if (callbacks.onBookingCancelled) callbacks.onBookingCancelled(data);
      toast(
        `🔔 تحديث فوري: تم إلغاء حجز ${data?.customerName || 'أحد العملاء'} (دور #${data?.queueNumber || ''}) وتم ترحيل الأدوار تلقائياً`,
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
    });
  }

  if (callbacks.onCustomerCalled) {
    s.on('CUSTOMER_CALLED', (data: any) => {
      if (callbacks.onSyncState) callbacks.onSyncState(data);
      playCallChime();
      if (callbacks.onCustomerCalled) callbacks.onCustomerCalled(data);
    });
  }

  if (callbacks.onBookingCreated) {
    s.on('BOOKING_CREATED', (data: any) => {
      if (callbacks.onSyncState) callbacks.onSyncState(data);
      if (callbacks.onBookingCreated) callbacks.onBookingCreated(data);
    });
  }

  if (callbacks.onPaymentReviewed) {
    s.on('PAYMENT_PROOF_REVIEWED', (data: any) => {
      if (callbacks.onSyncState) callbacks.onSyncState(data);
      if (callbacks.onPaymentReviewed) callbacks.onPaymentReviewed(data);
    });
  }

  return () => {
    s.off('SYNC_STATE');
    s.off('BOOKING_CANCELLED');
    s.off('CUSTOMER_CALLED');
    s.off('BOOKING_CREATED');
    s.off('PAYMENT_PROOF_REVIEWED');
  };
}

export function joinBranchRoom(branchId: string) {
  if (branchId) {
    const s = getSocket();
    s.emit('join_branch', branchId);
  }
}
