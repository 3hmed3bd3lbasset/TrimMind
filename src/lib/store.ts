import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  Branch,
  Barber,
  Chair,
  Service,
  Product,
  Booking,
  BookingStatus,
  PaymentStatus,
  QueueEntry,
  AuditLog,
  Profile,
  UserRole,
  PaymentProof,
  BookingModificationLog,
  AppNotification,
} from '../types';
import {
  INITIAL_BRANCHES,
  INITIAL_BARBERS,
  INITIAL_CHAIRS,
  INITIAL_SERVICES,
  INITIAL_PRODUCTS,
  INITIAL_SETTINGS,
  INITIAL_PROFILES,
  INITIAL_BOOKINGS,
  INITIAL_QUEUE,
  INITIAL_AUDIT_LOGS,
} from './seedData';
import { generateToken, generateUUID, playCallChime } from './utils';
import { broadcastEvent } from './sync';
import { api } from './api';

export interface CalledCustomerEvent {
  customerName: string;
  barberName: string;
  chairName: string;
  ticketNumber?: string;
  timestamp: number;
}

interface SalonStore {
  currentUser: Profile;
  selectedBranchId: string;
  branches: Branch[];
  barbers: Barber[];
  chairs: Chair[];
  services: Service[];
  products: Product[];
  bookings: Booking[];
  queue: QueueEntry[];
  profiles: Profile[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  settings: typeof INITIAL_SETTINGS;
  isAiDrawerOpen: boolean;
  lastCalledCustomer: CalledCustomerEvent | null;

  // Notification Actions
  addNotification: (notif: Omit<AppNotification, 'id' | 'created_at' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;

  // Actions
  setCurrentUser: (profile: Profile) => void;
  switchRole: (role: UserRole, branchId?: string, barberId?: string) => void;
  setSelectedBranchId: (id: string) => void;
  setAiDrawerOpen: (open: boolean) => void;
  setLastCalledCustomer: (event: CalledCustomerEvent | null) => void;

  // Manager & Profiles Management
  addManager: (manager: Omit<Profile, 'id' | 'created_at' | 'updated_at'>) => void;
  updateManager: (id: string, updates: Partial<Profile>) => void;
  deleteManager: (id: string) => void;
  addReceptionist: (receptionist: Omit<Profile, 'id' | 'created_at' | 'updated_at'>) => void;
  updateReceptionist: (id: string, updates: Partial<Profile>) => void;
  deleteReceptionist: (id: string) => void;

  // Booking Operations
  createBooking: (payload: {
    customerName: string;
    customerPhone: string;
    branchId: string;
    barberId?: string;
    chairId?: string;
    serviceId: string;
    additionalServiceIds?: string[];
    bookingType: 'normal' | 'vip';
    startsAt: string;
    endsAt: string;
    notes?: string;
    selectedProducts?: { productId: string; quantity: number }[];
    paymentProof?: {
      paymentMethod: 'instapay' | 'vodafone_cash' | 'card' | 'cash';
      senderPhone: string;
      imagePath: string;
      amount: number;
    };
  }) => Booking;

  submitPaymentProof: (
    bookingId: string,
    proof: {
      paymentMethod: 'instapay' | 'vodafone_cash' | 'card' | 'cash';
      senderPhone: string;
      imagePath: string;
      amount: number;
    }
  ) => void;

  reviewPaymentProof: (
    bookingId: string,
    status: PaymentStatus,
    reason?: string
  ) => void;

  transitionBookingStatus: (
    bookingId: string,
    toStatus: BookingStatus,
    note?: string
  ) => void;

  cancelBooking: (bookingId: string, reason?: string) => void;

  callNextInQueue: (entry: QueueEntry) => void;
  callNextClientForBarber: (barberId: string) => void;

  updateBookingDetails: (
    bookingId: string,
    payload: {
      serviceId?: string;
      additionalServiceIds?: string[];
      discount?: number;
      notes?: string;
      addedProducts?: { productId: string; quantity: number }[];
      removedProductIds?: string[];
    },
    actorNote?: string
  ) => void;

  addBookingItem: (
    bookingId: string,
    productId: string,
    quantity?: number
  ) => void;

  rateBooking: (
    bookingId: string,
    starsOrPayload:
      | number
      | {
          overall: number;
          barber: number;
          place: number;
          experience: number;
        },
    comment?: string
  ) => void;

  addWalkInBooking: (payload: {
    customerName: string;
    customerPhone: string;
    branchId: string;
    barberId: string;
    chairId: string;
    serviceId: string;
    notes?: string;
  }) => Booking;

  // Manager CRUD
  addBranch: (branch: Omit<Branch, 'id' | 'created_at'>) => void;
  updateBranch: (id: string, updates: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
  clearAllBranches: () => void;

  addBarber: (barber: Omit<Barber, 'id' | 'created_at' | 'rating' | 'rating_count'>) => void;
  updateBarber: (id: string, updates: Partial<Barber>) => void;
  deleteBarber: (id: string) => void;
  clearAllBarbers: () => void;

  addChair: (chair: Omit<Chair, 'id' | 'created_at'>) => void;
  updateChair: (id: string, updates: Partial<Chair>) => void;
  deleteChair: (id: string) => void;

  addService: (service: Omit<Service, 'id' | 'created_at'>) => void;
  updateService: (id: string, updates: Partial<Service>) => void;
  deleteService: (id: string) => void;

  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  updateSettings: (newSettings: Partial<typeof INITIAL_SETTINGS>) => void;
  resetAllData: () => void;
}

function getInitialCurrentUser(): Profile {
  if (typeof window === 'undefined') return INITIAL_PROFILES[0];
  try {
    const raw = localStorage.getItem('salon_current_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.role) return parsed;
    }
    const storeRaw = localStorage.getItem('barber-platform-storage-v3');
    if (storeRaw) {
      const parsed = JSON.parse(storeRaw);
      if (parsed?.state?.currentUser?.role) {
        return parsed.state.currentUser;
      }
    }
  } catch {
    // ignore
  }
  return INITIAL_PROFILES[0];
}

function getInitialBranchId(): string {
  if (typeof window === 'undefined') return INITIAL_BRANCHES[0]?.id || '';
  try {
    const branchId = localStorage.getItem('salon_selected_branch_id');
    if (branchId) return branchId;
    const storeRaw = localStorage.getItem('barber-platform-storage-v4');
    if (storeRaw) {
      const parsed = JSON.parse(storeRaw);
      if (parsed?.state?.selectedBranchId) return parsed.state.selectedBranchId;
    }
  } catch {
    // ignore
  }
  return INITIAL_BRANCHES[0]?.id || '';
}

export const useSalonStore = create<SalonStore>()(
  persist(
    (set, get) => ({
      currentUser: getInitialCurrentUser(),
      selectedBranchId: getInitialBranchId(),
      branches: INITIAL_BRANCHES,
      barbers: INITIAL_BARBERS,
      chairs: INITIAL_CHAIRS,
      services: INITIAL_SERVICES,
      products: INITIAL_PRODUCTS,
      bookings: INITIAL_BOOKINGS,
      queue: INITIAL_QUEUE,
      profiles: INITIAL_PROFILES,
      auditLogs: INITIAL_AUDIT_LOGS,
      notifications: [],
      settings: INITIAL_SETTINGS,
      isAiDrawerOpen: false,
      lastCalledCustomer: null,

      addNotification: (notif) => {
        const newNotif: AppNotification = {
          ...notif,
          id: generateUUID(),
          read: false,
          created_at: new Date().toISOString(),
        };
        set((state) => ({ notifications: [newNotif, ...state.notifications] }));
        broadcastEvent('NOTIFICATION_CREATED', newNotif);
      },

      markNotificationAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      markAllNotificationsAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearAllNotifications: () => {
        set({ notifications: [] });
      },

      setCurrentUser: (profile) => {
        try {
          localStorage.setItem('salon_current_user', JSON.stringify(profile));
        } catch {}
        set({ currentUser: profile });
      },
      setLastCalledCustomer: (event) => set({ lastCalledCustomer: event }),

      switchRole: (role: UserRole) => {
        if (role === 'customer') {
          const defaultCustomer = INITIAL_PROFILES.find((p) => p.role === 'customer') || INITIAL_PROFILES[0];
          try {
            localStorage.removeItem('salon_auth_token');
            localStorage.setItem('salon_current_user', JSON.stringify(defaultCustomer));
          } catch {}
          set({ currentUser: defaultCustomer });
        }
      },

      setSelectedBranchId: (id) => {
        try {
          localStorage.setItem('salon_selected_branch_id', id);
        } catch {}
        set({ selectedBranchId: id });
      },
      setAiDrawerOpen: (open) => set({ isAiDrawerOpen: open }),

      createBooking: (payload) => {
        const {
          services,
          products,
          settings,
          currentUser,
          bookings,
          auditLogs,
          queue,
        } = get();

        const service = services.find((s) => s.id === payload.serviceId);
        const servicePrice = service ? service.price : 180;
        const bookingFee =
          payload.bookingType === 'vip'
            ? settings.booking_fee_vip
            : settings.booking_fee_normal;

        let itemsTotal = 0;
        const bookingItems = (payload.selectedProducts || []).map((p) => {
          const product = products.find((prod) => prod.id === p.productId);
          const price = product ? product.price : 0;
          itemsTotal += price * p.quantity;
          return {
            id: generateUUID(),
            booking_id: '',
            product_id: p.productId,
            name: product?.name || 'مشروب / منتج',
            price_at_booking: price,
            quantity: p.quantity,
          };
        });

        const bookingId = `BK-${Math.floor(1000 + Math.random() * 9000)}`;
        const secureToken = `${payload.bookingType === 'vip' ? 'VIP' : 'NOR'}-${bookingId.slice(3)}-${generateToken()}`;

        let paymentProofObj: PaymentProof | undefined = undefined;
        let initialStatus: BookingStatus = 'awaiting_payment';

        if (payload.paymentProof) {
          paymentProofObj = {
            id: generateUUID(),
            booking_id: bookingId,
            image_path: payload.paymentProof.imagePath,
            payment_method: payload.paymentProof.paymentMethod,
            sender_phone: payload.paymentProof.senderPhone,
            transferred_amount: payload.paymentProof.amount,
            status: 'pending_review',
            submitted_at: new Date().toISOString(),
          };
          initialStatus = 'pending_review';
        }

        // Smart atomic conflict-prevention: calculate unique non-conflicting queue number for this branch and date
        const bookingDateStr = payload.startsAt.split('T')[0];
        const activeDayBookings = bookings.filter(
          (b) =>
            b.branch_id === payload.branchId &&
            b.starts_at?.split('T')[0] === bookingDateStr &&
            b.status !== 'cancelled'
        );
        const existingNums = new Set(activeDayBookings.map((b) => b.queue_number).filter(Boolean));
        let assignedQueueNumber = 1;
        while (existingNums.has(assignedQueueNumber)) {
          assignedQueueNumber++;
        }

        const newBooking: Booking = {
          id: bookingId,
          customer_id: currentUser.id || generateUUID(),
          customer_name: payload.customerName || currentUser.full_name || 'عميل محترم',
          customer_phone: payload.customerPhone || currentUser.phone || '01000000000',
          branch_id: payload.branchId,
          barber_id: payload.barberId,
          chair_id: payload.chairId,
          service_id: payload.serviceId,
          additional_service_ids: payload.additionalServiceIds,
          booking_type: payload.bookingType,
          status: initialStatus,
          starts_at: payload.startsAt,
          ends_at: payload.endsAt,
          service_price_at_booking: servicePrice,
          booking_fee_at_booking: bookingFee,
          discount_at_booking: 0,
          items_total_at_booking: itemsTotal,
          total_at_booking: servicePrice + itemsTotal,
          secure_token: secureToken,
          queue_number: assignedQueueNumber,
          notes: payload.notes,
          items: bookingItems.map((item) => ({ ...item, booking_id: bookingId })),
          payment_proof: paymentProofObj,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const newAuditLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'CREATE_BOOKING',
          target_table: 'bookings',
          target_id: bookingId,
          metadata: {
            booking_type: payload.bookingType,
            service: service?.name,
            total: newBooking.total_at_booking,
            queue_number: assignedQueueNumber,
          },
          created_at: new Date().toISOString(),
        };

        const newNotification: AppNotification = {
          id: generateUUID(),
          title:
            status === 'pending_review'
              ? 'طلب حجز جديد بانتظار المراجعة'
              : 'طلب حجز جديد معتمد',
          message: `قام العميل ${payload.customerName} بطلب حجز ${service?.name || 'خدمة'} (رقم الحجز: ${bookingId})`,
          type: status === 'pending_review' ? 'pending_review' : 'new_booking',
          target_id: bookingId,
          target_type: 'booking',
          branch_id: payload.branchId,
          read: false,
          created_at: new Date().toISOString(),
        };

        set((state) => ({
          bookings: [newBooking, ...state.bookings],
          auditLogs: [newAuditLog, ...state.auditLogs],
          notifications: [newNotification, ...state.notifications],
        }));

        // Broadcast to other tabs
        broadcastEvent('BOOKING_CREATED', newBooking);
        broadcastEvent('NOTIFICATION_CREATED', newNotification);

        // Authoritative Server Backend Dispatch (Calculates final prices, records DB audit, emits WebSockets)
        api.createBooking({
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          branchId: payload.branchId,
          barberId: payload.barberId,
          serviceId: payload.serviceId,
          additionalServiceIds: payload.additionalServiceIds,
          bookingType: payload.bookingType,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          notes: payload.notes,
          selectedProducts: payload.selectedProducts,
          paymentProof: payload.paymentProof
            ? {
                paymentMethod: payload.paymentProof.paymentMethod,
                senderPhone: payload.paymentProof.senderPhone,
                imagePath: payload.paymentProof.imagePath,
                amount: payload.paymentProof.amount,
              }
            : undefined,
        }).catch((err) => {
          console.warn('Server booking sync note:', err?.message || err);
        });

        return newBooking;
      },

      submitPaymentProof: (bookingId, proof) => {
        const { bookings, currentUser, auditLogs } = get();
        const updatedBookings = bookings.map((b) => {
          if (b.id === bookingId) {
            const proofObj: PaymentProof = {
              id: generateUUID(),
              booking_id: bookingId,
              image_path: proof.imagePath,
              payment_method: proof.paymentMethod,
              sender_phone: proof.senderPhone,
              transferred_amount: proof.amount,
              status: 'pending_review',
              submitted_at: new Date().toISOString(),
            };
            return {
              ...b,
              status: 'pending_review' as BookingStatus,
              payment_proof: proofObj,
              updated_at: new Date().toISOString(),
            };
          }
          return b;
        });

        const newLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'SUBMIT_PAYMENT_PROOF',
          target_table: 'payment_proofs',
          target_id: bookingId,
          metadata: { amount: proof.amount, method: proof.paymentMethod },
          created_at: new Date().toISOString(),
        };

        set({ bookings: updatedBookings, auditLogs: [newLog, ...auditLogs] });
      },

      reviewPaymentProof: (bookingId, status, reason) => {
        const { bookings, currentUser, auditLogs, queue, chairs, barbers, services } = get();

        let updatedQueue = [...queue];
        let targetBooking: Booking | undefined;

        const updatedBookings = bookings.map((b) => {
          if (b.id === bookingId) {
            targetBooking = b;
            const newBookingStatus: BookingStatus =
              status === 'approved' ? 'confirmed' : 'rejected';
            return {
              ...b,
              status: newBookingStatus,
              payment_proof: b.payment_proof
                ? {
                    ...b.payment_proof,
                    status,
                    rejection_reason: reason,
                    reviewed_by: currentUser.id,
                    reviewed_at: new Date().toISOString(),
                  }
                : undefined,
              updated_at: new Date().toISOString(),
            };
          }
          return b;
        });

        if (status === 'approved' && targetBooking) {
          const barber = barbers.find((br) => br.id === targetBooking?.barber_id);
          const service = services.find((sr) => sr.id === targetBooking?.service_id);
          const existingQueue = queue.find((q) => q.booking_id === bookingId);
          if (!existingQueue) {
            const queueEntry: QueueEntry = {
              id: generateUUID(),
              branch_id: targetBooking.branch_id,
              chair_id: targetBooking.chair_id,
              booking_id: targetBooking.id,
              customer_name: targetBooking.customer_name,
              service_name: service?.name || 'قص وتصفيف شعر',
              barber_name: barber?.full_name || 'حلاق الصالون',
              position: queue.filter((q) => q.branch_id === targetBooking?.branch_id).length + 1,
              estimated_wait_minutes: 20,
              created_at: new Date().toISOString(),
            };
            updatedQueue.push(queueEntry);
          }
        }

        const newLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: status === 'approved' ? 'APPROVE_PAYMENT_PROOF' : 'REJECT_PAYMENT_PROOF',
          target_table: 'payment_proofs',
          target_id: bookingId,
          metadata: { status, reason },
          created_at: new Date().toISOString(),
        };

        set({
          bookings: updatedBookings,
          queue: updatedQueue,
          auditLogs: [newLog, ...auditLogs],
        });

        // Dispatch authoritative server review
        api.reviewPaymentProof(bookingId, status, reason).catch((err) => {
          console.warn('Server review sync note:', err?.message || err);
        });
      },

      transitionBookingStatus: (bookingId, toStatus, note) => {
        const { bookings, chairs, currentUser, auditLogs, queue, barbers } = get();

        let chairIdToUpdate: string | undefined;
        let targetBooking: Booking | undefined;

        const updatedBookings = bookings.map((b) => {
          if (b.id === bookingId) {
            targetBooking = b;
            chairIdToUpdate = b.chair_id;
            return {
              ...b,
              status: toStatus,
              completed_at: toStatus === 'completed' ? new Date().toISOString() : b.completed_at,
              updated_at: new Date().toISOString(),
            };
          }
          return b;
        });

        // Trigger chime & TV announcement event if transitioned to in_service
        if (toStatus === 'in_service' && targetBooking) {
          playCallChime();
          const barber = barbers.find((b) => b.id === targetBooking?.barber_id);
          const chair = chairs.find((c) => c.id === targetBooking?.chair_id);
          set({
            lastCalledCustomer: {
              customerName: targetBooking.customer_name,
              barberName: barber?.full_name || 'حلاق الصالون',
              chairName: chair?.name || 'الكرسي المخصص',
              ticketNumber: targetBooking.id,
              timestamp: Date.now(),
            },
          });
        }

        let updatedChairs = [...chairs];
        if (chairIdToUpdate) {
          updatedChairs = chairs.map((c) => {
            if (c.id === chairIdToUpdate) {
              if (toStatus === 'in_service') {
                return {
                  ...c,
                  status: 'in_service' as const,
                  current_booking_id: bookingId,
                  service_ends_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                };
              } else if (toStatus === 'completed' || toStatus === 'cancelled' || toStatus === 'rejected') {
                return {
                  ...c,
                  status: 'available' as const,
                  current_booking_id: undefined,
                  service_ends_at: undefined,
                };
              }
            }
            return c;
          });
        }

        let updatedQueue = queue;
        if (toStatus === 'completed' || toStatus === 'cancelled') {
          updatedQueue = queue.filter((q) => q.booking_id !== bookingId);
        }

        const newLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: `STATUS_${toStatus.toUpperCase()}`,
          target_table: 'bookings',
          target_id: bookingId,
          metadata: { to_status: toStatus, note },
          created_at: new Date().toISOString(),
        };

        set({
          bookings: updatedBookings,
          chairs: updatedChairs,
          queue: updatedQueue,
          auditLogs: [newLog, ...auditLogs],
        });

        // Broadcast status transition
        broadcastEvent('SYNC_STATE');

        // Dispatch authoritative status update to backend
        api.updateBookingStatus(bookingId, toStatus, note).catch((err) => {
          console.warn('Server status sync note:', err?.message || err);
        });
      },

      cancelBooking: (bookingId, reason) => {
        const { bookings, chairs, currentUser, auditLogs, queue } = get();

        let targetBooking: Booking | undefined;
        let chairIdToFree: string | undefined;

        const updatedBookings = bookings.map((b) => {
          if (b.id === bookingId) {
            targetBooking = b;
            chairIdToFree = b.chair_id;
            return {
              ...b,
              status: 'cancelled' as BookingStatus,
              cancelled_at: new Date().toISOString(),
              cancellation_reason: reason || 'إلغاء الحجز من قبل العميل',
              updated_at: new Date().toISOString(),
            };
          }
          return b;
        });

        // Free chair if this booking was currently occupying it
        let updatedChairs = chairs;
        if (chairIdToFree) {
          updatedChairs = chairs.map((c) => {
            if (c.id === chairIdToFree && c.current_booking_id === bookingId) {
              return {
                ...c,
                status: 'available' as const,
                current_booking_id: undefined,
                service_ends_at: undefined,
              };
            }
            return c;
          });
        }

        // Remove from queue so subsequent turns shift forward immediately
        const updatedQueue = queue.filter((q) => q.booking_id !== bookingId);

        const newLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'STATUS_CANCELLED',
          target_table: 'bookings',
          target_id: bookingId,
          metadata: {
            note: `تم إلغاء الحجز (${targetBooking?.customer_name || 'عميل'} - دور #${targetBooking?.queue_number || ''})`,
            reason: reason || 'إلغاء من قبل العميل',
          },
          created_at: new Date().toISOString(),
        };

        set({
          bookings: updatedBookings,
          chairs: updatedChairs,
          queue: updatedQueue,
          auditLogs: [newLog, ...auditLogs],
        });

        // Broadcast real-time event to all screens/tabs
        broadcastEvent('BOOKING_CANCELLED', {
          bookingId,
          customerName: targetBooking?.customer_name,
          queueNumber: targetBooking?.queue_number,
        });

        // Dispatch authoritative cancel to backend
        api.cancelBooking(bookingId, reason).catch((err) => {
          console.warn('Server cancel sync note:', err?.message || err);
        });
      },

      callNextInQueue: (entry) => {
        const { bookings, transitionBookingStatus } = get();
        const booking = bookings.find((b) => b.id === entry.booking_id);
        if (booking && booking.status !== 'cancelled') {
          transitionBookingStatus(booking.id, 'in_service', 'تم استدعاء العميل إلى الكرسي من شاشة الطابور');
        }
      },

      callNextClientForBarber: (barberId) => {
        const { bookings, chairs, transitionBookingStatus, barbers, selectedBranchId } = get();
        const currentBarber = barbers.find((b) => b.id === barberId);
        const branchId = currentBarber?.branch_id || selectedBranchId;

        // Find active upcoming bookings (excluding cancelled & completed) sorted by queue number
        const activeBookings = bookings
          .filter(
            (b) =>
              (b.status === 'confirmed' || b.status === 'customer_arrived') &&
              (b.barber_id === barberId || (b.branch_id === branchId && !b.barber_id))
          )
          .sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));

        const nextBooking = activeBookings[0];

        if (nextBooking) {
          // Assign available chair
          const barberChair = chairs.find((c) => c.barber_id === barberId && c.status === 'available');
          if (barberChair) {
            nextBooking.chair_id = barberChair.id;
          }
          transitionBookingStatus(
            nextBooking.id,
            'in_service',
            `استدعاء العميل إلى الكرسي (دور #${nextBooking.queue_number || ''}) بواسطة كابتن ${currentBarber?.full_name || 'الحلاق'}`
          );
        }
      },

      // Update Booking Details & Invoices in real-time (Used by Barber, Receptionist, or Manager)
      updateBookingDetails: (bookingId, payload, actorNote) => {
        const { bookings, services, products, currentUser, auditLogs } = get();

        const target = bookings.find((b) => b.id === bookingId);
        if (!target) return;

        const oldTotal = target.total_at_booking;

        // 1. Calculate Primary Service Price
        let newServicePrice = target.service_price_at_booking;
        if (payload.serviceId) {
          const srv = services.find((s) => s.id === payload.serviceId);
          if (srv) newServicePrice = srv.price;
        }

        // 2. Calculate Additional Services
        let additionalServicesTotal = 0;
        const addIds = payload.additionalServiceIds !== undefined ? payload.additionalServiceIds : (target.additional_service_ids || []);
        addIds.forEach((addId) => {
          const addSrv = services.find((s) => s.id === addId);
          if (addSrv) additionalServicesTotal += addSrv.price;
        });

        // 3. Calculate Items / Products
        let currentItems = [...(target.items || [])];
        if (payload.removedProductIds && payload.removedProductIds.length > 0) {
          currentItems = currentItems.filter((item) => !payload.removedProductIds?.includes(item.product_id || ''));
        }

        if (payload.addedProducts && payload.addedProducts.length > 0) {
          payload.addedProducts.forEach((p) => {
            const prod = products.find((pr) => pr.id === p.productId);
            if (prod) {
              const existingItemIndex = currentItems.findIndex((it) => it.product_id === p.productId);
              if (existingItemIndex >= 0) {
                currentItems[existingItemIndex].quantity += p.quantity;
              } else {
                currentItems.push({
                  id: generateUUID(),
                  booking_id: bookingId,
                  product_id: p.productId,
                  name: prod.name,
                  price_at_booking: prod.price,
                  quantity: p.quantity,
                });
              }
            }
          });
        }

        const itemsTotal = currentItems.reduce((sum, it) => sum + it.price_at_booking * it.quantity, 0);
        const discount = payload.discount !== undefined ? payload.discount : (target.discount_at_booking || 0);
        const newTotal = newServicePrice + additionalServicesTotal + itemsTotal - discount;

        const modificationLog: BookingModificationLog = {
          role: currentUser.role,
          actor_name: currentUser.full_name,
          action: 'MODIFIED_BOOKING_AND_INVOICE',
          timestamp: new Date().toISOString(),
          old_total: oldTotal,
          new_total: newTotal,
          note: actorNote || `تم تعديل الفاتورة والخدمات بواسطة ${currentUser.full_name}`,
        };

        const updatedBookings = bookings.map((b) => {
          if (b.id === bookingId) {
            return {
              ...b,
              service_id: payload.serviceId || b.service_id,
              additional_service_ids: addIds,
              service_price_at_booking: newServicePrice + additionalServicesTotal,
              discount_at_booking: discount,
              items: currentItems,
              items_total_at_booking: itemsTotal,
              total_at_booking: newTotal,
              notes: payload.notes !== undefined ? payload.notes : b.notes,
              last_modified_by: modificationLog,
              updated_at: new Date().toISOString(),
            };
          }
          return b;
        });

        const newLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'UPDATE_BOOKING_INVOICE',
          target_table: 'bookings',
          target_id: bookingId,
          metadata: {
            old_total: oldTotal,
            new_total: newTotal,
            modified_by: currentUser.full_name,
            role: currentUser.role,
            note: actorNote,
          },
          created_at: new Date().toISOString(),
        };

        set({ bookings: updatedBookings, auditLogs: [newLog, ...auditLogs] });
      },

      addBookingItem: (bookingId, productId, quantity = 1) => {
        const { bookings, products, currentUser, auditLogs } = get();
        const product = products.find((p) => p.id === productId);
        if (!product) return;

        const updatedBookings = bookings.map((b) => {
          if (b.id === bookingId) {
            const newItem = {
              id: generateUUID(),
              booking_id: bookingId,
              product_id: productId,
              name: product.name,
              price_at_booking: product.price,
              quantity,
            };
            const currentItems = b.items || [];
            const newItems = [...currentItems, newItem];
            const addedTotal = product.price * quantity;
            return {
              ...b,
              items: newItems,
              items_total_at_booking: (b.items_total_at_booking || 0) + addedTotal,
              total_at_booking: b.total_at_booking + addedTotal,
              last_modified_by: {
                role: currentUser.role,
                actor_name: currentUser.full_name,
                action: 'ADDED_PRODUCT_ITEM',
                timestamp: new Date().toISOString(),
                old_total: b.total_at_booking,
                new_total: b.total_at_booking + addedTotal,
                note: `إضافة منتج: ${product.name}`,
              },
              updated_at: new Date().toISOString(),
            };
          }
          return b;
        });

        const newLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'ADD_BOOKING_ITEM',
          target_table: 'booking_items',
          target_id: bookingId,
          metadata: { product_name: product.name, price: product.price, quantity },
          created_at: new Date().toISOString(),
        };

        set({ bookings: updatedBookings, auditLogs: [newLog, ...auditLogs] });
      },

      rateBooking: (bookingId, starsOrPayload, comment) => {
        const { bookings, barbers, currentUser } = get();
        let targetBarberId: string | undefined;

        const isComplex = typeof starsOrPayload === 'object';
        const overallStars = isComplex ? starsOrPayload.overall : starsOrPayload;
        const barberScore = isComplex ? starsOrPayload.barber : starsOrPayload;
        const placeScore = isComplex ? starsOrPayload.place : starsOrPayload;
        const expScore = isComplex ? starsOrPayload.experience : starsOrPayload;

        const updatedBookings = bookings.map((b) => {
          if (b.id === bookingId) {
            targetBarberId = b.barber_id;
            return {
              ...b,
              rating: {
                id: generateUUID(),
                booking_id: bookingId,
                customer_id: currentUser.id,
                customer_name: b.customer_name,
                barber_id: b.barber_id || '',
                branch_id: b.branch_id,
                stars: overallStars,
                barber_score: barberScore,
                place_score: placeScore,
                experience_score: expScore,
                comment,
                created_at: new Date().toISOString(),
              },
            };
          }
          return b;
        });

        let updatedBarbers = barbers;
        if (targetBarberId) {
          updatedBarbers = barbers.map((barber) => {
            if (barber.id === targetBarberId) {
              const currentRating = barber.rating || 4.8;
              const count = (barber.rating_count || 50) + 1;
              const newAvg = Number(((currentRating * (count - 1) + barberScore) / count).toFixed(2));
              return { ...barber, rating: newAvg, rating_count: count };
            }
            return barber;
          });
        }

        set({ bookings: updatedBookings, barbers: updatedBarbers });
      },

      addWalkInBooking: (payload) => {
        const { services, bookings, chairs, currentUser, auditLogs, barbers } = get();
        const service = services.find((s) => s.id === payload.serviceId);
        const servicePrice = service?.price || 180;
        const bookingId = `WLK-${Math.floor(1000 + Math.random() * 9000)}`;

        const newBooking: Booking = {
          id: bookingId,
          customer_id: generateUUID(),
          customer_name: payload.customerName,
          customer_phone: payload.customerPhone,
          branch_id: payload.branchId,
          barber_id: payload.barberId,
          chair_id: payload.chairId,
          service_id: payload.serviceId,
          booking_type: 'normal',
          status: 'in_service',
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          service_price_at_booking: servicePrice,
          booking_fee_at_booking: 0,
          discount_at_booking: 0,
          items_total_at_booking: 0,
          total_at_booking: servicePrice,
          secure_token: `WLK-${bookingId.slice(4)}-TOKEN`,
          notes: payload.notes || 'حجز فوري مباشر من الصالون (Walk-in)',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        playCallChime();
        const barber = barbers.find((b) => b.id === payload.barberId);
        const chair = chairs.find((c) => c.id === payload.chairId);
        set({
          lastCalledCustomer: {
            customerName: payload.customerName,
            barberName: barber?.full_name || 'حلاق الصالون',
            chairName: chair?.name || 'الكرسي المخصص',
            ticketNumber: bookingId,
            timestamp: Date.now(),
          },
        });

        const updatedChairs = chairs.map((c) => {
          if (c.id === payload.chairId) {
            return {
              ...c,
              status: 'in_service' as const,
              current_booking_id: bookingId,
              service_ends_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            };
          }
          return c;
        });

        const newLog: AuditLog = {
          id: generateUUID(),
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          action: 'CREATE_WALK_IN',
          target_table: 'bookings',
          target_id: bookingId,
          metadata: { client: payload.customerName, service: service?.name },
          created_at: new Date().toISOString(),
        };

        set({
          bookings: [newBooking, ...bookings],
          chairs: updatedChairs,
          auditLogs: [newLog, ...auditLogs],
        });

        return newBooking;
      },

      // Manager CRUD
      addBranch: (branch) => {
        const newBranch: Branch = {
          ...branch,
          id: generateUUID(),
          created_at: new Date().toISOString(),
        };
        set((state) => ({ branches: [...state.branches, newBranch] }));
      },
      updateBranch: (id, updates) => {
        set((state) => ({
          branches: state.branches.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        }));
      },
      deleteBranch: (id) => {
        set((state) => ({
          branches: state.branches.filter((b) => b.id !== id),
          barbers: state.barbers.filter((bar) => bar.branch_id !== id),
          chairs: state.chairs.filter((c) => c.branch_id !== id),
        }));
      },
      clearAllBranches: () => {
        set({ branches: [], barbers: [], chairs: [] });
      },

      addBarber: (barber) => {
        const barberId = generateUUID();
        const newBarber: Barber = {
          ...barber,
          id: barberId,
          rating: 5.0,
          rating_count: 1,
          created_at: new Date().toISOString(),
        };
        const barberProfile: Profile = {
          id: `usr-barber-${barberId}`,
          full_name: barber.full_name,
          phone: barber.phone,
          email: barber.email,
          password: barber.password,
          role: 'barber',
          barber_id: barberId,
          branch_id: barber.branch_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((state) => ({
          barbers: [...state.barbers, newBarber],
          profiles: [...state.profiles.filter((p) => p.barber_id !== barberId), barberProfile],
        }));
        broadcastEvent('SYNC_STATE');
      },
      updateBarber: (id, updates) => {
        set((state) => ({
          barbers: state.barbers.map((b) =>
            b.id === id ? { ...b, ...updates, updated_at: new Date().toISOString() } : b
          ),
          profiles: state.profiles.map((p) => {
            if (p.barber_id === id) {
              return {
                ...p,
                full_name: updates.full_name !== undefined ? updates.full_name : p.full_name,
                phone: updates.phone !== undefined ? updates.phone : p.phone,
                email: updates.email !== undefined ? updates.email : p.email,
                password: updates.password !== undefined ? updates.password : p.password,
                branch_id: updates.branch_id !== undefined ? updates.branch_id : p.branch_id,
                updated_at: new Date().toISOString(),
              };
            }
            return p;
          }),
        }));
        broadcastEvent('SYNC_STATE');
      },
      deleteBarber: (id) => {
        set((state) => ({
          barbers: state.barbers.filter((b) => b.id !== id),
          profiles: state.profiles.filter((p) => p.barber_id !== id),
          chairs: state.chairs.map((c) => (c.barber_id === id ? { ...c, barber_id: undefined } : c)),
        }));
        broadcastEvent('SYNC_STATE');
      },
      clearAllBarbers: () => {
        set((state) => ({
          barbers: [],
          profiles: state.profiles.filter((p) => p.role !== 'barber'),
        }));
        broadcastEvent('SYNC_STATE');
      },

      addChair: (chair) => {
        const newChair: Chair = {
          ...chair,
          id: generateUUID(),
          status: 'available',
          created_at: new Date().toISOString(),
        };
        set((state) => ({ chairs: [...state.chairs, newChair] }));
      },
      updateChair: (id, updates) => {
        set((state) => ({
          chairs: state.chairs.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },
      deleteChair: (id) => {
        set((state) => ({
          chairs: state.chairs.filter((c) => c.id !== id),
        }));
      },

      addService: (service) => {
        const newService: Service = {
          ...service,
          id: generateUUID(),
          created_at: new Date().toISOString(),
        };
        set((state) => ({ services: [...state.services, newService] }));
      },
      updateService: (id, updates) => {
        set((state) => ({
          services: state.services.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        }));
      },
      deleteService: (id) => {
        set((state) => ({
          services: state.services.filter((s) => s.id !== id),
        }));
      },

      addProduct: (product) => {
        const newProduct: Product = {
          ...product,
          id: generateUUID(),
        };
        set((state) => ({ products: [...state.products, newProduct] }));
      },
      updateProduct: (id, updates) => {
        set((state) => ({
          products: state.products.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },
      deleteProduct: (id) => {
        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        }));
      },

      addManager: (manager) => {
        const newProfile: Profile = {
          ...manager,
          id: generateUUID(),
          role: 'manager',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((state) => ({ profiles: [...state.profiles, newProfile] }));
      },

      updateManager: (id, updates) => {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
          ),
          currentUser:
            state.currentUser.id === id
              ? { ...state.currentUser, ...updates, updated_at: new Date().toISOString() }
              : state.currentUser,
        }));
      },

      deleteManager: (id) => {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
        }));
      },

      addReceptionist: (receptionist) => {
        const newProfile: Profile = {
          ...receptionist,
          id: generateUUID(),
          role: 'receptionist',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((state) => ({ profiles: [...state.profiles, newProfile] }));
        broadcastEvent('SYNC_STATE');
      },

      updateReceptionist: (id, updates) => {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
          ),
          currentUser:
            state.currentUser.id === id
              ? { ...state.currentUser, ...updates, updated_at: new Date().toISOString() }
              : state.currentUser,
        }));
        broadcastEvent('SYNC_STATE');
      },

      deleteReceptionist: (id) => {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
        }));
        broadcastEvent('SYNC_STATE');
      },

      updateSettings: (newSettings) => {
        set((state) => ({ settings: { ...state.settings, ...newSettings } }));
      },

      resetAllData: () => {
        set({
          currentUser: INITIAL_PROFILES[0],
          selectedBranchId: INITIAL_BRANCHES[0]?.id || '',
          branches: INITIAL_BRANCHES,
          barbers: INITIAL_BARBERS,
          chairs: INITIAL_CHAIRS,
          services: INITIAL_SERVICES,
          products: INITIAL_PRODUCTS,
          bookings: INITIAL_BOOKINGS,
          queue: INITIAL_QUEUE,
          auditLogs: INITIAL_AUDIT_LOGS,
          notifications: [],
          settings: INITIAL_SETTINGS,
          lastCalledCustomer: null,
        });
      },
    }),
    {
      name: 'barber-platform-storage-v4',
      storage: createJSONStorage(() => ({
        getItem: async (name: string): Promise<string | null> => {
          try {
            const value = await idbGet(name);
            if (value) return value;
          } catch (e) {
            console.warn('IndexedDB read warning:', e);
          }
          return localStorage.getItem(name);
        },
        setItem: async (name: string, value: string): Promise<void> => {
          try {
            await idbSet(name, value);
          } catch (e) {
            console.error('IndexedDB write error:', e);
          }
          try {
            localStorage.setItem(name, value);
          } catch {
            // Ignore localStorage quota exceeded because IndexedDB handles unlimited sizes!
          }
        },
        removeItem: async (name: string): Promise<void> => {
          try {
            await idbDel(name);
          } catch (e) {
            console.error('IndexedDB delete error:', e);
          }
          localStorage.removeItem(name);
        },
      })),
    }
  )
);
