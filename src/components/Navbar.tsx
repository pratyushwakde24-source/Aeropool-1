import React, { useState } from 'react';
import { Plane, Users, Car, Shield, LifeBuoy, Bell, Menu, X, Check, ChevronDown, Sparkles } from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { db } from '../services/db';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { Database } from 'lucide-react';

interface NavbarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  currentUser: UserProfile;
  unreadNotifsCount: number;
  onOpenNotifications: () => void;
  onOpenTestSuite: () => void;
  onOpenSupabaseStatus: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  currentUser,
  unreadNotifsCount,
  onOpenNotifications,
  onOpenTestSuite,
  onOpenSupabaseStatus,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const users = db.getState().users;

  const roleLabels: Record<UserRole, { label: string; badgeClass: string; icon: any }> = {
    passenger: { label: 'Passenger', badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20', icon: Users },
    driver: { label: 'Verified Driver', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Car },
    fleet_operator: { label: 'Fleet Partner', badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Car },
    admin: { label: 'Super Admin', badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: Shield },
    support: { label: 'Ops Support', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: LifeBuoy },
  };

  const handleRoleSelect = (userId: string) => {
    db.switchUser(userId);
    setRoleDropdownOpen(false);
    const selected = users.find((u) => u.id === userId);
    if (selected) {
      if (selected.role === 'passenger') onNavigate('/app');
      else if (selected.role === 'driver') onNavigate('/driver');
      else if (selected.role === 'fleet_operator') onNavigate('/fleet');
      else if (selected.role === 'admin') onNavigate('/admin');
      else if (selected.role === 'support') onNavigate('/support');
    }
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
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
                <Plane className="w-5 h-5 -rotate-45" />
              </div>
              <div>
                <span className="text-lg font-extrabold tracking-tight text-white flex items-center gap-1.5">
                  AeroPool
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                    BOM CSMIA
                  </span>
                </span>
                <p className="text-[10px] text-slate-400 tracking-wide hidden sm:block">
                  Smart Airport Ride-Pooling Platform
                </p>
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
              onClick={() => onNavigate('/faq')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                currentRoute === '/faq'
                  ? 'text-sky-400 bg-sky-500/10'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              FAQ
            </button>

            {/* Test Suite Action */}
            <button
              onClick={onOpenTestSuite}
              className="ml-2 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-mono text-emerald-400 flex items-center gap-1.5 transition"
              title="Run Automated QA Test Suite"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verify Test Suite</span>
            </button>

            {/* Supabase PostgreSQL Status */}
            <button
              onClick={onOpenSupabaseStatus}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition ${
                isSupabaseConfigured()
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-300'
              }`}
              title="Inspect Supabase PostgreSQL Database Connection"
            >
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>{isSupabaseConfigured() ? 'Supabase Live' : 'Database Status'}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            </button>
          </nav>

          {/* Right Section: Role Switcher & Profile */}
          <div className="flex items-center gap-2.5">
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

            {/* Role Switcher Dropdown */}
            <div className="relative">
              <button
                onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition text-left"
              >
                <img
                  src={currentUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
                  alt={currentUser.fullName}
                  className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-700"
                />
                <div className="hidden sm:block">
                  <div className="text-xs font-semibold text-white leading-tight">{currentUser.fullName}</div>
                  <div className="text-[10px] text-sky-400 font-medium">
                    {roleLabels[currentUser.role]?.label}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-50">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
                    Switch Evaluator Role
                  </div>
                  {users.map((u) => {
                    const RoleIcon = roleLabels[u.role]?.icon || Users;
                    const isSelected = u.id === currentUser.id;
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleRoleSelect(u.id)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs hover:bg-slate-800 transition ${
                          isSelected ? 'bg-sky-500/10 text-sky-400 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <RoleIcon className="w-4 h-4 text-slate-400" />
                          <div>
                            <div>{u.fullName}</div>
                            <div className="text-[10px] text-slate-500 capitalize">{roleLabels[u.role]?.label}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-sky-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Action Primary CTA */}
            {currentUser.role === 'passenger' && (
              <button
                onClick={() => onNavigate('/app/book')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition"
              >
                <span>Book Ride</span>
              </button>
            )}
            {currentUser.role === 'driver' && (
              <button
                onClick={() => onNavigate('/driver')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold rounded-xl transition"
              >
                <span>Driver Queue</span>
              </button>
            )}
            {currentUser.role === 'admin' && (
              <button
                onClick={() => onNavigate('/admin')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-semibold rounded-xl transition"
              >
                <span>Admin Console</span>
              </button>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
            <button
              onClick={() => {
                onOpenSupabaseStatus();
                setMobileMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-sky-400 hover:bg-slate-900 rounded-lg flex items-center justify-between"
            >
              <span>Supabase / Database Status</span>
              <span className={`w-2 h-2 rounded-full ${isSupabaseConfigured() ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
