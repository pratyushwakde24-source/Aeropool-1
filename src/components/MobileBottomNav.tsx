import React from 'react';
import { Home, Car, ShieldCheck, User } from 'lucide-react';
import { UserProfile } from '../types';

interface MobileBottomNavProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  currentUser: UserProfile | null;
  onOpenAuthModal?: (mode: 'signin' | 'signup') => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentRoute,
  onNavigate,
  currentUser,
  onOpenAuthModal,
}) => {
  const isHomeActive = currentRoute === '/';
  const isRidesActive =
    currentRoute === '/app/bookings' ||
    currentRoute === '/app/book' ||
    currentRoute.startsWith('/app/track');
  const isSafetyActive = currentRoute === '/safety';
  const isProfileActive =
    currentRoute === '/app/dashboard' ||
    currentRoute === '/app/profile' ||
    currentRoute === '/profile' ||
    currentRoute === '/app' ||
    currentRoute === '/app/admin' ||
    currentRoute === '/driver' ||
    currentRoute === '/fleet';

  const handleProfileClick = () => {
    if (currentUser?.role === 'admin') {
      onNavigate('/app/admin');
    } else if (currentUser?.role === 'driver') {
      onNavigate('/driver');
    } else if (currentUser?.role === 'fleet_operator') {
      onNavigate('/fleet');
    } else {
      onNavigate('/app/dashboard');
    }
  };

  const handleRidesClick = () => {
    if (!currentUser) {
      if (onOpenAuthModal) {
        onOpenAuthModal('signin');
      } else {
        onNavigate('/app/book');
      }
      return;
    }
    onNavigate('/app/bookings');
  };

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[#0B1930]/95 backdrop-blur-xl border-t border-[rgba(75,150,220,0.25)] shadow-[0_-4px_24px_rgba(0,0,0,0.4)] select-none touch-manipulation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-4 h-16 max-w-lg mx-auto px-2">
        {/* Tab 1: Home */}
        <button
          onClick={() => onNavigate('/')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors min-h-[48px] focus:outline-none ${
            isHomeActive
              ? 'text-[#00DDF5]'
              : 'text-[#A8B5CA] hover:text-[#F8FAFC]'
          }`}
          aria-label="Home"
        >
          <Home className="w-5 h-5 transition-transform active:scale-95" />
          <span className={`text-[11px] font-medium tracking-tight ${isHomeActive ? 'font-bold' : ''}`}>
            Home
          </span>
        </button>

        {/* Tab 2: My Rides */}
        <button
          onClick={handleRidesClick}
          className={`flex flex-col items-center justify-center gap-1 transition-colors min-h-[48px] focus:outline-none ${
            isRidesActive
              ? 'text-[#00DDF5]'
              : 'text-[#A8B5CA] hover:text-[#F8FAFC]'
          }`}
          aria-label="My Rides"
        >
          <Car className="w-5 h-5 transition-transform active:scale-95" />
          <span className={`text-[11px] font-medium tracking-tight ${isRidesActive ? 'font-bold' : ''}`}>
            My Rides
          </span>
        </button>

        {/* Tab 3: Safety */}
        <button
          onClick={() => onNavigate('/safety')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors min-h-[48px] focus:outline-none ${
            isSafetyActive
              ? 'text-[#00DDF5]'
              : 'text-[#A8B5CA] hover:text-[#F8FAFC]'
          }`}
          aria-label="Safety"
        >
          <ShieldCheck className="w-5 h-5 transition-transform active:scale-95" />
          <span className={`text-[11px] font-medium tracking-tight ${isSafetyActive ? 'font-bold' : ''}`}>
            Safety
          </span>
        </button>

        {/* Tab 4: Profile */}
        <button
          onClick={handleProfileClick}
          className={`flex flex-col items-center justify-center gap-1 transition-colors min-h-[48px] focus:outline-none ${
            isProfileActive
              ? 'text-[#00DDF5]'
              : 'text-[#A8B5CA] hover:text-[#F8FAFC]'
          }`}
          aria-label="Profile"
        >
          <User className="w-5 h-5 transition-transform active:scale-95" />
          <span className={`text-[11px] font-medium tracking-tight ${isProfileActive ? 'font-bold' : ''}`}>
            Profile
          </span>
        </button>
      </div>
    </nav>
  );
};
