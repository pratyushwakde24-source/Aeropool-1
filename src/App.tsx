import React, { useState, useEffect } from 'react';
import { db } from './services/db';
import { authService } from './services/authService';
import { supabase } from './services/supabaseClient';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
const TestSuiteModal = React.lazy(() =>
  import('./components/TestSuiteModal').then((m) => ({ default: m.TestSuiteModal }))
);
import { NotificationCenter } from './components/NotificationCenter';
import { AccessDeniedCard } from './components/AccessDeniedCard';
import { AuthModal } from './components/AuthModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { Car } from 'lucide-react';

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
import { PassengerDashboardView } from './views/PassengerDashboardView';
import { DriverDashboardView } from './views/DriverDashboardView';
import { DriverKYCView } from './views/DriverKYCView';
import { FleetDashboardView } from './views/FleetDashboardView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { SupportPortalView } from './views/SupportPortalView';
import { ForgotPasswordView } from './views/ForgotPasswordView';
import { PasswordResetView } from './views/PasswordResetView';
import { EmailVerifiedView } from './views/EmailVerifiedView';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.pathname) {
      return window.location.pathname;
    }
    return '/';
  });
  const [selectedBookingId, setSelectedBookingId] = useState<string | undefined>(undefined);
  const [showTestSuite, setShowTestSuite] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [authModalIntent, setAuthModalIntent] = useState<'passenger' | 'driver'>('passenger');
  // Whether the app is in PASSWORD_RECOVERY mode (user clicked reset link)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // Initial auth resolution guard to prevent flashing AccessDeniedCard on page refresh
  const [isAuthRestoring, setIsAuthRestoring] = useState(true);

  // Safety fallback: Never block public views for more than 1.5s if auth resolution is slow
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAuthRestoring(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Subscribe to DB updates
  const [dbState, setDbState] = useState(db.getState());
  useEffect(() => {
    // Listen for browser back/forward navigation
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        setCurrentRoute(window.location.pathname || '/');
      }
    };
    window.addEventListener('popstate', handlePopState);

    const unsubscribeDb = db.subscribe(() => {
      setDbState({ ...db.getState() });
    });

    // Initialize Supabase Auth session listener
    // Also detect PASSWORD_RECOVERY event from verification / reset links
    const unsubscribeAuth = authService.initAuth(
      (user) => {
        setDbState({ ...db.getState() });
        setIsAuthRestoring(false);
      },
      () => {
        setIsAuthRestoring(false);
      }
    );

    // Listen for PASSWORD_RECOVERY auth event from email reset links
    // detectSessionInUrl: true in supabaseClient.ts processes the token automatically.
    // We just need to route the user to the correct password-update view.
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
          handleNavigate('/auth/reset-password');
        }
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          setIsPasswordRecovery(false);
          // If we landed here via an email confirmation link, show verification success
          const hash = window.location.hash;
          if (hash.includes('type=signup') || hash.includes('type=email_change')) {
            handleNavigate('/auth/email-verified');
          }
        }
      });
      return () => {
        window.removeEventListener('popstate', handlePopState);
        unsubscribeDb();
        if (unsubscribeAuth) unsubscribeAuth();
        subscription.unsubscribe();
      };
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      unsubscribeDb();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, []);

  const handleNavigate = (route: string) => {
    setCurrentRoute(route);
    if (typeof window !== 'undefined' && window.location.pathname !== route) {
      window.history.pushState(null, '', route);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenAuth = (mode: 'signin' | 'signup' = 'signin', intent: 'passenger' | 'driver' = 'passenger') => {
    setAuthModalMode(mode);
    setAuthModalIntent(intent);
    setAuthModalOpen(true);
  };

  const handleSignOut = async () => {
    await authService.signOut();
    handleNavigate('/');
  };

  const currentUser = dbState.currentUser;
  const unreadNotifs = currentUser
    ? dbState.notifications.filter(
        (n) => !n.read && (n.userId === currentUser.id || currentUser.role === 'admin')
      )
    : [];

  // Route View Resolver
  const renderCurrentView = () => {
    // -------------------------------------------------------------------------
    // Auth callback routes — email verification and password reset
    // -------------------------------------------------------------------------
    if (currentRoute === '/auth/email-verified') {
      return <EmailVerifiedView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/auth/reset-password') {
      return <PasswordResetView onNavigate={handleNavigate} />;
    }
    if (currentRoute === '/forgot-password') {
      return <ForgotPasswordView onNavigate={handleNavigate} />;
    }

    // Public routes (Always accessible without authentication)
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

    // While initial authentication session is being restored from Supabase, avoid flashing AccessDeniedCard
    if (isAuthRestoring && currentRoute.startsWith('/app')) {
      return (
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 space-y-3">
          <div className="w-9 h-9 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-mono tracking-wide">Restoring session...</p>
        </div>
      );
    }

    // Passenger Booking Route (Accessible by Passengers, Guests, and Admins)
    if (currentRoute === '/app/book') {
      if (currentUser && currentUser.role !== 'passenger' && currentUser.role !== 'admin') {
        return (
          <AccessDeniedCard
            requiredRole="passenger"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenAuthModal={() => handleOpenAuth('signin')}
          />
        );
      }
      return (
        <PassengerBookView
          onNavigate={handleNavigate}
          onOpenAuthModal={() => handleOpenAuth('signin')}
          onBookingCreated={(bId) => {
            setSelectedBookingId(bId);
            handleNavigate(`/app/track/${bId}`);
          }}
        />
      );
    }
    if (currentRoute.startsWith('/app/track')) {
      if (!currentUser || (currentUser.role !== 'passenger' && currentUser.role !== 'admin')) {
        return (
          <AccessDeniedCard
            requiredRole="passenger"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenAuthModal={() => handleOpenAuth('signin')}
          />
        );
      }
      const parts = currentRoute.split('/');
      const bId = parts.length > 3 ? parts[3] : selectedBookingId;
      return <PassengerTrackView bookingId={bId} onNavigate={handleNavigate} />;
    }
    if (
      currentRoute === '/app' ||
      currentRoute === '/app/dashboard' ||
      currentRoute === '/profile' ||
      currentRoute === '/app/profile'
    ) {
      return (
        <PassengerDashboardView
          onNavigate={handleNavigate}
          currentUser={currentUser}
          onOpenAuthModal={handleOpenAuth}
          onSignOut={handleSignOut}
        />
      );
    }
    if (currentRoute === '/app/bookings') {
      if (!currentUser || (currentUser.role !== 'passenger' && currentUser.role !== 'admin')) {
        return (
          <AccessDeniedCard
            requiredRole="passenger"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenAuthModal={() => handleOpenAuth('signin')}
          />
        );
      }
      return (
        <PassengerBookingsView
          onNavigate={handleNavigate}
          onSelectBooking={(bId) => setSelectedBookingId(bId)}
        />
      );
    }

    // Driver Routes
    if (currentRoute === '/driver' || currentRoute === '/driver/trips') {
      if (!currentUser) {
        return (
          <AccessDeniedCard
            requiredRole="driver"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenAuthModal={() => handleOpenAuth('signin', 'driver')}
          />
        );
      }

      const existingDriver = dbState.driverProfiles.find((d) => d.userId === currentUser.id);

      // If approved, proceed directly to cockpit
      if (currentUser.role === 'driver' || currentUser.role === 'admin') {
        if (!existingDriver || existingDriver.verificationStatus === 'approved') {
          return <DriverDashboardView onNavigate={handleNavigate} />;
        }
      }

      // If registered or applicant (draft, under_review, rejected, suspended), show status & KYC view
      return <DriverKYCView onNavigate={handleNavigate} />;
    }

    if (currentRoute === '/driver/kyc' || currentRoute === '/driver/onboarding') {
      if (!currentUser) {
        return (
          <div className="min-h-[75vh] flex items-center justify-center p-4">
            <div className="max-w-md w-full glass-panel border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-[#00DDF5] flex items-center justify-center mx-auto">
                <Car className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-extrabold text-white">Drive with AeroPool</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Join Mumbai CSMIA Airport's verified smart ride-pooling network. Earn 80% guaranteed payout with zero surge deductions and instant bank settlements.
              </p>
              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  onClick={() => handleOpenAuth('signup', 'driver')}
                  className="w-full h-11 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg transition active:scale-[0.98]"
                >
                  Create Driver Account to Onboard
                </button>
                <button
                  onClick={() => handleOpenAuth('signin', 'driver')}
                  className="w-full h-11 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition"
                >
                  Already have an account? Sign In
                </button>
              </div>
            </div>
          </div>
        );
      }
      return <DriverKYCView onNavigate={handleNavigate} />;
    }

    // Fleet Operator Routes
    if (currentRoute === '/fleet') {
      if (!currentUser || (currentUser.role !== 'fleet_operator' && currentUser.role !== 'admin')) {
        return (
          <AccessDeniedCard
            requiredRole="fleet_operator"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenAuthModal={() => handleOpenAuth('signin')}
          />
        );
      }
      return <FleetDashboardView onNavigate={handleNavigate} />;
    }

    // Admin Routes
    if (currentRoute === '/admin' || currentRoute === '/app/admin') {
      if (!currentUser || currentUser.role !== 'admin') {
        return (
          <AccessDeniedCard
            requiredRole="admin"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenAuthModal={() => handleOpenAuth('signin')}
          />
        );
      }
      return <AdminDashboardView onNavigate={handleNavigate} onOpenTestSuite={() => setShowTestSuite(true)} />;
    }

    // Support Routes
    if (currentRoute === '/support') {
      if (!currentUser || (currentUser.role !== 'support' && currentUser.role !== 'admin')) {
        return (
          <AccessDeniedCard
            requiredRole="support"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenAuthModal={() => handleOpenAuth('signin')}
          />
        );
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
        onOpenAuthModal={handleOpenAuth}
        onSignOut={handleSignOut}
      />

      {/* Main View Container with safe clearance for mobile fixed bottom nav */}
      <main className="flex-1 pb-24 sm:pb-28 lg:pb-0">{renderCurrentView()}</main>

      {/* Mobile Fixed Bottom Navigation Bar (Screenshots 4-tab bar) */}
      <MobileBottomNav
        currentRoute={currentRoute}
        onNavigate={handleNavigate}
        currentUser={currentUser}
        onOpenAuthModal={handleOpenAuth}
      />

      {/* Footer is strictly excluded on the passenger homepage and in-app passenger flows */}
      {currentRoute !== '/' && !currentRoute.startsWith('/app') && currentRoute !== '/profile' && (
        <Footer onNavigate={handleNavigate} />
      )}

      {/* Global QA Test Suite Modal */}
      {showTestSuite && (
        <React.Suspense fallback={null}>
          <TestSuiteModal isOpen={showTestSuite} onClose={() => setShowTestSuite(false)} />
        </React.Suspense>
      )}

      {/* Global Notification Center Drawer */}
      <NotificationCenter
        isOpen={showNotifications}
        notifications={unreadNotifs}
        onClose={() => setShowNotifications(false)}
        onNavigate={handleNavigate}
      />

      {/* Global Supabase Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        initialIntent={authModalIntent}
        initialEmail={authModalMode === 'signin' ? 'pratyushwakde24@gmail.com' : undefined}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(user, intent) => {
          // Correctly set user and refresh DB state after successful authentication
          db.setCurrentUser(user);
          setDbState({ ...db.getState() });
          setAuthModalOpen(false);

          if (intent === 'driver' || currentRoute.startsWith('/driver')) {
            if (user.role === 'driver') {
              handleNavigate('/driver');
            } else {
              handleNavigate('/driver/onboarding');
            }
          } else if (currentRoute === '/' || currentRoute === '/auth/signin') {
            if (user.role === 'admin') {
              handleNavigate('/app/admin');
            } else if (user.role === 'driver') {
              handleNavigate('/driver');
            } else if (user.role === 'fleet_operator') {
              handleNavigate('/fleet');
            } else {
              handleNavigate('/app/book');
            }
          }
        }}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
