import React from 'react';
import { ShieldAlert, ArrowLeft, Lock, LogIn } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

interface AccessDeniedCardProps {
  requiredRole: UserRole | string;
  currentUser: UserProfile | null;
  onNavigate: (route: string) => void;
  onOpenAuthModal?: () => void;
}

export const AccessDeniedCard: React.FC<AccessDeniedCardProps> = ({
  requiredRole,
  currentUser,
  onNavigate,
  onOpenAuthModal,
}) => {
  if (!currentUser) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-white tracking-tight">Authentication Required</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {requiredRole.toLowerCase() === 'passenger' ? (
                <>You must be signed in to an authorized <strong>PASSENGER</strong> or <strong>ADMIN</strong> account to access airport ride bookings.</>
              ) : (
                <>You must be signed in to an authorized <strong>{requiredRole.toUpperCase()}</strong> account to access this area.</>
              )}
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            {onOpenAuthModal && (
              <button
                onClick={onOpenAuthModal}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In to Continue</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('/')}
              className="text-xs text-slate-400 hover:text-white inline-flex items-center justify-center gap-1.5 transition py-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Public Landing Page</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-3xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-white">Access Restricted by RBAC Policy</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {requiredRole.toLowerCase() === 'passenger' ? (
              <>This module requires <strong>PASSENGER</strong> or <strong>ADMIN</strong> privileges. Your active identity{' '}<strong className="text-white">({currentUser.fullName})</strong> holds role{' '}<strong className="text-sky-400 uppercase">{currentUser.role}</strong>.</>
            ) : (
              <>This module requires <strong>{requiredRole.toUpperCase()}</strong> privileges. Your active identity{' '}<strong className="text-white">({currentUser.fullName})</strong> holds role{' '}<strong className="text-sky-400 uppercase">{currentUser.role}</strong>.</>
            )}
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          {onOpenAuthModal && (
            <button
              onClick={onOpenAuthModal}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition"
            >
              Sign In with Authorized Account
            </button>
          )}
          <button
            onClick={() => onNavigate('/')}
            className="text-xs text-slate-400 hover:text-white inline-flex items-center justify-center gap-1.5 transition py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Landing Page</span>
          </button>
        </div>
      </div>
    </div>
  );
};
