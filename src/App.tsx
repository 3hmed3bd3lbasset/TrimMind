import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { AIChatDrawer } from './components/common/AIChatDrawer';
import { GlobalModalDialog } from './components/common/GlobalModalDialog';
import { GlobalScrollReveal } from './components/common/GlobalScrollReveal';
import { useSalonStore } from './lib/store';
import { initRealtimeSync } from './lib/sync';
import { api } from './lib/api';
import { UserRole } from './types';
import Landing from './pages/Landing';
import BookingPage from './pages/BookingPage';
import TrackBookingPage from './pages/TrackBookingPage';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import BarberDashboard from './pages/BarberDashboard';
import QueueDisplayPage from './pages/QueueDisplayPage';
import AuthPage from './pages/AuthPage';

// Secure Route Guard for Strict RBAC (Pure In-Memory Session Verification via HttpOnly Cookie)
function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const currentUser = useSalonStore((state) => state.currentUser);
  const setCurrentUser = useSalonStore((state) => state.setCurrentUser);
  const [authState, setAuthState] = React.useState<'checking' | 'authorized' | 'unauthorized'>(() => {
    return allowedRoles.includes(currentUser.role) ? 'authorized' : 'checking';
  });

  React.useEffect(() => {
    let isMounted = true;

    // If store already has a verified role matching requirements, keep authorized
    if (allowedRoles.includes(currentUser.role)) {
      setAuthState('authorized');
      return;
    }

    // Verify session with server backend
    api.getMe()
      .then((res: any) => {
        if (!isMounted) return;
        if (res && res.success && res.data) {
          const user = res.data;
          setCurrentUser(user);
          if (allowedRoles.includes(user.role)) {
            setAuthState('authorized');
          } else {
            setAuthState('unauthorized');
          }
        } else {
          setAuthState('unauthorized');
        }
      })
      .catch(() => {
        if (isMounted) setAuthState('unauthorized');
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser.role, allowedRoles]);

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center text-ink-soft text-sm font-bold">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-forest border-t-transparent rounded-full animate-spin"></div>
          <span>جاري التحقق من الصلاحيات وأمان الجلسة...</span>
        </div>
      </div>
    );
  }

  if (authState === 'unauthorized') {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const currentUser = useSalonStore((state) => state.currentUser);
  const isDisplayScreen =
    location.pathname === '/display' || location.pathname === '/queue-display';

  // Cross-tab real-time live synchronization + Database Live DB Hydration
  useEffect(() => {
    // 1. Hydrate state from MySQL DB
    const hydrateFromBackend = async () => {
      try {
        const isStaff = currentUser && currentUser.role && currentUser.role !== 'customer';

        const publicRequests: Promise<any>[] = [
          api.getBranches(),
          api.getBarbers(),
          api.getChairs(),
          api.getServices(),
          api.getProducts(),
          api.getSettings(),
        ];

        if (isStaff) {
          publicRequests.push(api.getBookings());
          publicRequests.push(api.getProfiles());
        }

        const results = await Promise.allSettled(publicRequests);
        const [branchesRes, barbersRes, chairsRes, servicesRes, productsRes, settingsRes, bookingsRes, profilesRes] = results;

        const stateUpdates: any = {};

        if (branchesRes?.status === 'fulfilled' && (branchesRes.value as any)?.success && Array.isArray((branchesRes.value as any)?.data)) {
          stateUpdates.branches = (branchesRes.value as any).data;
        }
        if (barbersRes?.status === 'fulfilled' && (barbersRes.value as any)?.success && Array.isArray((barbersRes.value as any)?.data)) {
          stateUpdates.barbers = (barbersRes.value as any).data;
        }
        if (chairsRes?.status === 'fulfilled' && (chairsRes.value as any)?.success && Array.isArray((chairsRes.value as any)?.data)) {
          stateUpdates.chairs = (chairsRes.value as any).data;
        }
        if (servicesRes?.status === 'fulfilled' && (servicesRes.value as any)?.success && Array.isArray((servicesRes.value as any)?.data)) {
          stateUpdates.services = (servicesRes.value as any).data;
        }
        if (productsRes?.status === 'fulfilled' && (productsRes.value as any)?.success && Array.isArray((productsRes.value as any)?.data)) {
          stateUpdates.products = (productsRes.value as any).data;
        }
        if (settingsRes?.status === 'fulfilled' && (settingsRes.value as any)?.success && (settingsRes.value as any)?.data) {
          stateUpdates.settings = { ...useSalonStore.getState().settings, ...(settingsRes.value as any).data };
        }
        if (isStaff && bookingsRes?.status === 'fulfilled' && (bookingsRes.value as any)?.success && Array.isArray((bookingsRes.value as any)?.data)) {
          stateUpdates.bookings = (bookingsRes.value as any).data;
        }
        if (isStaff && profilesRes?.status === 'fulfilled' && (profilesRes.value as any)?.success && Array.isArray((profilesRes.value as any)?.data)) {
          stateUpdates.profiles = (profilesRes.value as any).data;
        }

        if (Object.keys(stateUpdates).length > 0) {
          useSalonStore.setState(stateUpdates);
        }
      } catch (err) {
        // Silently catch initial public hydration notes
      }
    };

    hydrateFromBackend();
  }, [currentUser.id, currentUser.role]);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink font-sans relative selection:bg-forest selection:text-paper w-full max-w-full overflow-x-hidden">
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#ffffff',
            color: '#181613',
            border: '1.5px solid #d6ccb7',
            borderRadius: '18px',
            boxShadow: '0 10px 30px -5px rgba(24, 22, 19, 0.12)',
            fontFamily: 'Tajawal, sans-serif',
            fontSize: '13px',
            fontWeight: '600',
            padding: '12px 18px',
          },
          success: {
            iconTheme: {
              primary: '#1e3a2e',
              secondary: '#ffffff',
            },
            style: {
              border: '1.5px solid #a3b899',
            },
          },
          error: {
            iconTheme: {
              primary: '#c2613d',
              secondary: '#ffffff',
            },
            style: {
              border: '1.5px solid #fecdd3',
              background: '#fffbfb',
            },
          },
        }}
      />

      {/* Global Luxury Confirmation / Alert Dialog */}
      <GlobalModalDialog />

      {/* Global Scroll-Reveal Effect (Left-to-Right Flow on Scroll for non-admin pages) */}
      <GlobalScrollReveal />

      {!isDisplayScreen && <Navbar />}

      <main className="flex-1 relative z-10 w-full max-w-full overflow-x-hidden">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/book" element={<BookingPage />} />
          <Route path="/track" element={<TrackBookingPage />} />
          
          {/* Barber Workspace: Protected for Barbers and Manager only */}
          <Route
            path="/barber"
            element={
              <RoleGuard allowedRoles={['barber', 'manager']}>
                <BarberDashboard />
              </RoleGuard>
            }
          />

          {/* Reception Hub: Protected for Receptionists and Manager only */}
          <Route
            path="/receptionist"
            element={
              <RoleGuard allowedRoles={['receptionist', 'manager']}>
                <ReceptionistDashboard />
              </RoleGuard>
            }
          />

          {/* Manager Studio: Protected strictly for General Manager */}
          <Route
            path="/manager"
            element={
              <RoleGuard allowedRoles={['manager']}>
                <ManagerDashboard />
              </RoleGuard>
            }
          />

          {/* TV Display Board: Public in salon */}
          <Route path="/display" element={<QueueDisplayPage />} />
          <Route path="/queue-display" element={<QueueDisplayPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!isDisplayScreen && <Footer />}
      {!isDisplayScreen && <AIChatDrawer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
