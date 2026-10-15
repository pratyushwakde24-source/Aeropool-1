import React, { useState, useEffect } from 'react';
import { db } from './services/db';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { TestSuiteModal } from './components/TestSuiteModal';
import { NotificationCenter } from './components/NotificationCenter';
import { SupabaseStatusModal } from './components/SupabaseStatusModal';
import { AccessDeniedCard } from './components/AccessDeniedCard';

// Views
import { LandingView } from './views/LandingView';
import { HowItWorksView } from './views/HowItWorksView';
import { SafetyView } from './views/SafetyView';
import { FleetPartnersPublicView } from './views/FleetPartnersPublicView';
import { FaqView } from './views/FaqView';
import { LegalTermsView } from './views/LegalTermsView';
import { PassengerBookView } from './views/PassengerBookView';
import { PassengerTrackView } from './views/PassengerTrackView';
import { PassengerBookingsView } from './views/PassengerBookingsView';
import { DriverDashboardView } from './views/DriverDashboardView';
import { DriverKYCView } from './views/DriverKYCView';
import { FleetDashboardView } from './views/FleetDashboardView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { SupportPortalView } from './views/SupportPortalView';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [selectedBookingId, setSelectedBookingId] = useState<string | undefined>(undefined);
  const [showTestSuite, setShowTestSuite] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);

  // Subscribe to DB updates
  const [dbState, setDbState] = useState(db.getState());
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setDbState({ ...db.getState() });
    });
    return unsubscribe;
  }, []);

  // Listen to hash / route changes if any
  const handleNavigate = (route: string) => {
    setCurrentRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentUser = dbState.currentUser;
  const unreadNotifs = dbState.notifications.filter((n) => !n.read && (n.userId === currentUser.id || currentUser.role === 'admin'));

  // Route View Resolver
  const renderCurrentView = () => {
    if (currentRoute === '/') {
      return <LandingView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/how-it-works') {
      return <HowItWorksView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/safety') {
      return <SafetyView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/fleet-partners') {
      return <FleetPartnersPublicView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/faq') {
      return <FaqView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/terms') {
      return <LegalTermsView onNavigate={handleNavigate} section="terms" />;
    }
    if (currentRoute === '/privacy') {
      return <LegalTermsView onNavigate={handleNavigate} section="privacy" />;
    }

    // Passenger Routes
    if (currentRoute === '/app/book') {
      return (
        <PassengerBookView
          onNavigate={handleNavigate}
          onBookingCreated={(bId) => {
            setSelectedBookingId(bId);
            handleNavigate(`/app/track/${bId}`);
          }}
        />
      );
    }
    if (currentRoute.startsWith('/app/track')) {
      const parts = currentRoute.split('/');
      const bId = parts.length > 3 ? parts[3] : selectedBookingId;
      return <PassengerTrackView bookingId={bId} onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/app' || currentRoute === '/app/bookings') {
      return (
        <PassengerBookingsView
          onNavigate={handleNavigate}
          onSelectBooking={(bId) => setSelectedBookingId(bId)}
        />
      );
    }

    // Driver Routes
    if (currentRoute === '/driver' || currentRoute === '/driver/trips') {
      if (currentUser.role !== 'driver' && currentUser.role !== 'admin') {
        return <AccessDeniedCard requiredRole="driver" currentUser={currentUser} onNavigate={handleNavigate} />;
      }
      return <DriverDashboardView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/driver/kyc') {
      if (currentUser.role !== 'driver' && currentUser.role !== 'admin') {
        return <AccessDeniedCard requiredRole="driver" currentUser={currentUser} onNavigate={handleNavigate} />;
      }
      return <DriverKYCView onNavigate={handleNavigate} />;
    }

    // Fleet Routes
    if (currentRoute === '/fleet') {
      if (currentUser.role !== 'fleet_operator' && currentUser.role !== 'admin') {
        return <AccessDeniedCard requiredRole="fleet_operator" currentUser={currentUser} onNavigate={handleNavigate} />;
      }
      return <FleetDashboardView onNavigate={handleNavigate} />;
    }

    // Admin Routes
    if (currentRoute === '/admin') {
      if (currentUser.role !== 'admin') {
        return <AccessDeniedCard requiredRole="admin" currentUser={currentUser} onNavigate={handleNavigate} />;
      }
      return <AdminDashboardView onNavigate={handleNavigate} onOpenTestSuite={() => setShowTestSuite(true)} />;
    }

    // Support Routes
    if (currentRoute === '/support') {
      if (currentUser.role !== 'support' && currentUser.role !== 'admin') {
        return <AccessDeniedCard requiredRole="support" currentUser={currentUser} onNavigate={handleNavigate} />;
      }
      return <SupportPortalView onNavigate={handleNavigate} />;
    }

    // Fallback to Landing
    return <LandingView onNavigate={handleNavigate} />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Global Navbar */}
      <Navbar
        currentRoute={currentRoute}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        unreadNotifsCount={unreadNotifs.length}
        onOpenNotifications={() => setShowNotifications(true)}
        onOpenTestSuite={() => setShowTestSuite(true)}
        onOpenSupabaseStatus={() => setShowSupabaseModal(true)}
      />

      {/* Main View Container */}
      <main className="flex-1">{renderCurrentView()}</main>

      {/* Global Footer */}
      <Footer onNavigate={handleNavigate} />

      {/* Global QA Test Suite Modal */}
      <TestSuiteModal isOpen={showTestSuite} onClose={() => setShowTestSuite(false)} />

      {/* Supabase PostgreSQL Status Modal */}
      <SupabaseStatusModal isOpen={showSupabaseModal} onClose={() => setShowSupabaseModal(false)} />

      {/* Global Notification Center Drawer */}
      <NotificationCenter
        isOpen={showNotifications}
        notifications={unreadNotifs}
        onClose={() => setShowNotifications(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
