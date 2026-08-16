import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Navbar } from './components/common/Navbar';
import { Footer } from './components/common/Footer';
import { RoleSwitcher } from './components/common/RoleSwitcher';
import { AIChatDrawer } from './components/common/AIChatDrawer';
import { GlobalModalDialog } from './components/common/GlobalModalDialog';
import { useSalonStore } from './lib/store';
import { initRealtimeSync } from './lib/sync';
import { UserRole } from './types';
import Landing from './pages/Landing';
import BookingPage from './pages/BookingPage';
import TrackBookingPage from './pages/TrackBookingPage';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import BarberDashboard from './pages/BarberDashboard';
import QueueDisplayPage from './pages/QueueDisplayPage';
import AuthPage from './pages/AuthPage';

// Secure Route Guard for Strict RBAC (Preserves User Session Across Page Refreshes)
function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const { currentUser } = useSalonStore();
  const [hasHydrated, setHasHydrated] = React.useState(
    typeof useSalonStore.persist?.hasHydrated === 'function'
      ? useSalonStore.persist.hasHydrated()
      : true
  );

  React.useEffect(() => {
    const unsub = useSalonStore.persist?.onFinishHydration?.(() => {
      setHasHydrated(true);
    });
    return () => unsub?.();
  }, []);

  let effectiveRole = currentUser.role;
  try {
    const raw = localStorage.getItem('salon_current_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.role) effectiveRole = parsed.role;
    }
  } catch {}

  if (!allowedRoles.includes(effectiveRole) && !allowedRoles.includes(currentUser.role)) {
    if (!hasHydrated) {
      return null;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const isDisplayScreen =
    location.pathname === '/display' || location.pathname === '/queue-display';

  // Cross-tab real-time live synchronization
  useEffect(() => {
    const unsubscribe = initRealtimeSync(() => {
      // Instantly rehydrate state from storage on any change in other tabs/screens
      useSalonStore.persist?.rehydrate();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink font-sans relative selection:bg-forest selection:text-paper">
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

      {!isDisplayScreen && <Navbar />}

      <main className="flex-1 relative z-10">
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
      {import.meta.env.DEV && <RoleSwitcher />}
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
