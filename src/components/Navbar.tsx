import React, { useState } from 'react';
import { Plane, Users, Car, Shield, LifeBuoy, Bell, Menu, X, ChevronDown, Sparkles, LogOut, User, ArrowRight } from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { getOperatingMode } from '../services/configService';

interface NavbarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  currentUser: UserProfile | null;
  unreadNotifsCount: number;
  onOpenNotifications: () => void;
  onOpenTestSuite: () => void;
  onOpenAuthModal: (mode: 'signin' | 'signup') => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  currentUser,
  unreadNotifsCount,
  onOpenNotifications,
  onOpenTestSuite,
  onOpenAuthModal,
  onSignOut,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const roleLabels: Record<UserRole, { label: string; badgeClass: string; icon: any }> = {
    passenger: { label: 'Passenger', badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: Users },
    driver: { label: 'Verified Driver', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Car },
    fleet_operator: { label: 'Fleet Partner', badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Car },
    admin: { label: 'Super Admin', badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', icon: Shield },
    support: { label: 'Ops Support', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: LifeBuoy },
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('/')}
              className="flex items-center gap-2.5 text-left group transition focus:outline-none"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#087BFF] to-[#00DDF5] flex items-center justify-center text-white shadow-lg shadow-sky-500/25 group-hover:scale-105 transition-transform">
                <Plane className="w-5 h-5 -rotate-45" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">
                  AeroPool
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                  BOM CSMIA
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => onNavigate('/how-it-works')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                currentRoute === '/how-it-works'
                  ? 'text-sky-400 bg-sky-500/10'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              How It Works
            </button>
            <button
              onClick={() => onNavigate('/safety')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                currentRoute === '/safety'
                  ? 'text-sky-400 bg-sky-500/10'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              Safety & Verification
            </button>
            <button
              onClick={() => onNavigate('/fleet-partners')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                currentRoute === '/fleet-partners'
                  ? 'text-sky-400 bg-sky-500/10'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              Fleet Partners
            </button>
            <button
              onClick={() => {
                if (currentUser?.role === 'driver') {
                  onNavigate('/driver');
                } else {
                  onNavigate('/driver/onboarding');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                currentRoute === '/driver' || currentRoute === '/driver/kyc' || currentRoute === '/driver/onboarding'
                  ? 'text-cyan-300 bg-cyan-500/15 border border-cyan-500/30'
                  : 'text-cyan-400 hover:text-white hover:bg-cyan-500/10'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>{currentUser?.role === 'driver' ? 'Driver Cockpit' : 'Drive with AeroPool'}</span>
            </button>
            <button
              onClick={() => onNavigate('/faq')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                currentRoute === '/faq'
                  ? 'text-sky-400 bg-sky-500/10'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              FAQ
            </button>

            {/* Super Admin Quick Access (Visible Only for Authenticated Admins) */}
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => onNavigate('/app/admin')}
                className={`ml-1 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                  currentRoute === '/admin' || currentRoute === '/app/admin'
                    ? 'bg-sky-600/30 text-sky-300 border border-sky-500/50 shadow-sm'
                    : 'text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/30'
                }`}
                title="Super Admin Operations Console"
              >
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                <span>Super Admin</span>
              </button>
            )}

            {/* Test Suite Action */}
            <button
              onClick={onOpenTestSuite}
              className="ml-2 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-mono text-emerald-400 flex items-center gap-1.5 transition"
              title="Run Automated QA Test Suite"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verify Test Suite</span>
            </button>

            {/* Operating Mode Indicator */}
            <div
              className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                getOperatingMode() === 'production'
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  : getOperatingMode() === 'sandbox'
                  ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                  : 'bg-sky-950/80 border-sky-500/50 text-sky-300'
              }`}
              title={`AeroPool Operating Mode: ${getOperatingMode().toUpperCase()}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${getOperatingMode() === 'production' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{getOperatingMode() === 'production' ? 'PROD' : getOperatingMode() === 'sandbox' ? 'SANDBOX' : 'DEV'}</span>
            </div>
          </nav>

          {/* Right Section: Mobile & Desktop Auth / Actions */}
          <div className="relative flex items-center gap-2 sm:gap-2.5">
            {/* Mobile Header Actions (Matches Screenshot Exactly) */}
            <div className="flex items-center gap-2 lg:hidden">
              {/* Notification Bell */}
              <button
                onClick={onOpenNotifications}
                className="relative w-10 h-10 rounded-full bg-[#13243D] hover:bg-[#1a3356] border border-[rgba(75,150,220,0.25)] flex items-center justify-center text-slate-200 transition focus:outline-none"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-slate-200" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#13243D]" />
              </button>

              {/* User Avatar Circle */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (currentUser) {
                      setUserDropdownOpen(!userDropdownOpen);
                      setMobileMenuOpen(false);
                    } else {
                      onOpenAuthModal('signin');
                    }
                  }}
                  className="w-10 h-10 rounded-full bg-[#1b3459] hover:bg-[#234270] border border-[rgba(75,150,220,0.35)] flex items-center justify-center text-xs font-bold text-sky-200 tracking-wider shadow-inner transition focus:outline-none"
                  title={currentUser ? currentUser.fullName : 'Sign in / Profile'}
                  aria-label="User profile"
                >
                  {currentUser?.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser.fullName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span>{currentUser ? getInitials(currentUser.fullName) : 'PW'}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-2.5">
              {!currentUser ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onOpenAuthModal('signin')}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 border border-slate-800 transition"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => onOpenAuthModal('signup')}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition"
                  >
                    Create Account
                  </button>
                </div>
              ) : (
                <>
                  {/* Notifications Button */}
                  <button
                    onClick={onOpenNotifications}
                    className="relative p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition"
                    title="Notifications"
                  >
                    <Bell className="w-4 h-4" />
                    {unreadNotifsCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-sky-500 text-[10px] font-bold text-white flex items-center justify-center">
                        {unreadNotifsCount}
                      </span>
                    )}
                  </button>

                  {/* Authenticated User Menu */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setUserDropdownOpen(!userDropdownOpen);
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition text-left"
                    >
                      {currentUser.avatarUrl ? (
                        <img
                          src={currentUser.avatarUrl}
                          alt={currentUser.fullName}
                          className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-700"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-sky-600/30 border border-sky-500/40 text-sky-300 flex items-center justify-center font-bold text-xs">
                          {getInitials(currentUser.fullName)}
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-semibold text-white leading-tight">{currentUser.fullName}</div>
                        <div className="text-[10px] text-sky-400 font-medium">
                          {roleLabels[currentUser.role]?.label || currentUser.role}
                        </div>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* User Dropdown Outside Click Backdrop */}
            {userDropdownOpen && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserDropdownOpen(false)}
                aria-hidden="true"
              />
            )}

            {/* Desktop & Mobile Dropdown Overlay */}
            {userDropdownOpen && currentUser && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in">
                      <div className="px-3.5 py-2 border-b border-slate-800">
                        <div className="text-xs font-bold text-white">{currentUser.fullName}</div>
                        <div className="text-[11px] text-slate-400 truncate">{currentUser.email}</div>
                        <div className="mt-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${roleLabels[currentUser.role]?.badgeClass || 'text-slate-400'}`}>
                            {roleLabels[currentUser.role]?.label || currentUser.role}
                          </span>
                        </div>
                      </div>

                      <div className="py-1">
                        {currentUser.role === 'passenger' && (
                          <>
                            <button
                              onClick={() => {
                                onNavigate('/app');
                                setUserDropdownOpen(false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                            >
                              <Users className="w-4 h-4 text-sky-400" />
                              <span>Passenger Dashboard</span>
                            </button>
                            <button
                              onClick={() => {
                                onNavigate('/app/bookings');
                                setUserDropdownOpen(false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                            >
                              <Plane className="w-4 h-4 text-sky-400" />
                              <span>My Bookings</span>
                            </button>
                            <button
                              onClick={() => {
                                onNavigate('/app/book');
                                setUserDropdownOpen(false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                            >
                              <ArrowRight className="w-4 h-4 text-emerald-400" />
                              <span>Book Airport Ride</span>
                            </button>
                          </>
                        )}
                        {currentUser.role === 'driver' && (
                          <button
                            onClick={() => {
                              onNavigate('/driver');
                              setUserDropdownOpen(false);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                          >
                            <Car className="w-4 h-4 text-emerald-400" />
                            <span>Driver Queue & Dispatches</span>
                          </button>
                        )}
                        {currentUser.role === 'fleet_operator' && (
                          <button
                            onClick={() => {
                              onNavigate('/fleet');
                              setUserDropdownOpen(false);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                          >
                            <Car className="w-4 h-4 text-indigo-400" />
                            <span>Fleet Management</span>
                          </button>
                        )}
                        {currentUser.role === 'admin' && (
                          <>
                            <button
                              onClick={() => {
                                onNavigate('/app/admin');
                                setUserDropdownOpen(false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-sky-300 hover:bg-sky-950/40 hover:text-white flex items-center gap-2 font-medium"
                            >
                              <Shield className="w-4 h-4 text-sky-400" />
                              <span>Super Admin Console</span>
                            </button>
                            <button
                              onClick={() => {
                                onNavigate('/app/book');
                                setUserDropdownOpen(false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                            >
                              <ArrowRight className="w-4 h-4 text-emerald-400" />
                              <span>Book Airport Ride</span>
                            </button>
                            <button
                              onClick={() => {
                                onNavigate('/app/bookings');
                                setUserDropdownOpen(false);
                              }}
                              className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                            >
                              <Plane className="w-4 h-4 text-sky-400" />
                              <span>My Bookings</span>
                            </button>
                          </>
                        )}
                        {currentUser.role === 'support' && (
                          <button
                            onClick={() => {
                              onNavigate('/support');
                              setUserDropdownOpen(false);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                          >
                            <LifeBuoy className="w-4 h-4 text-amber-400" />
                            <span>Ops Support Portal</span>
                          </button>
                        )}
                      </div>

                      <div className="border-t border-slate-800 pt-1">
                        <button
                          onClick={() => {
                            setUserDropdownOpen(false);
                            onSignOut();
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 font-medium"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Quick Action CTA */}
                  {(currentUser?.role === 'passenger' || currentUser?.role === 'admin') && (
                    <button
                      onClick={() => onNavigate('/app/book')}
                      className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition"
                    >
                      <span>Book Ride</span>
                    </button>
                  )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => {
                setMobileMenuOpen(!mobileMenuOpen);
                setUserDropdownOpen(false);
              }}
              className="lg:hidden p-2 rounded-xl bg-slate-900 text-slate-300 border border-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-800 space-y-1">
            <button
              onClick={() => {
                onNavigate('/how-it-works');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900 rounded-lg"
            >
              How It Works
            </button>
            <button
              onClick={() => {
                onNavigate('/safety');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900 rounded-lg"
            >
              Safety & Verification
            </button>
            <button
              onClick={() => {
                onNavigate('/fleet-partners');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900 rounded-lg"
            >
              Fleet Partners
            </button>
            <button
              onClick={() => {
                if (currentUser?.role === 'driver') {
                  onNavigate('/driver');
                } else {
                  onNavigate('/driver/onboarding');
                }
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-semibold text-cyan-400 hover:bg-cyan-950/30 rounded-lg flex items-center gap-2"
            >
              <Car className="w-3.5 h-3.5" />
              <span>{currentUser?.role === 'driver' ? 'Driver Cockpit' : 'Drive with AeroPool'}</span>
            </button>
            <button
              onClick={() => {
                onNavigate('/faq');
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-900 rounded-lg"
            >
              FAQ
            </button>
            <button
              onClick={() => {
                onOpenTestSuite();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-emerald-400 hover:bg-slate-900 rounded-lg"
            >
              Verify QA Test Suite
            </button>
            {currentUser?.role === 'admin' && (
              <>
                <button
                  onClick={() => {
                    onNavigate('/app/admin');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-bold text-sky-300 bg-sky-900/30 hover:bg-sky-900/50 border border-sky-500/30 rounded-lg flex items-center gap-2"
                >
                  <Shield className="w-4 h-4 text-sky-400" />
                  <span>Super Admin Console</span>
                </button>
                <button
                  onClick={() => {
                    onNavigate('/app/book');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-emerald-300 bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center gap-2"
                >
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                  <span>Book Airport Ride</span>
                </button>
              </>
            )}
            {!currentUser && (
              <div className="pt-2 border-t border-slate-800 flex gap-2 px-3">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuthModal('signin');
                  }}
                  className="flex-1 py-2 text-center text-xs font-semibold bg-slate-900 text-white rounded-lg border border-slate-800"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuthModal('signup');
                  }}
                  className="flex-1 py-2 text-center text-xs font-semibold bg-blue-600 text-white rounded-lg"
                >
                  Create Account
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
