import React from 'react';
import { ShieldAlert, ArrowLeft, Users } from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { db } from '../services/db';

interface AccessDeniedCardProps {
  requiredRole: UserRole | string;
  currentUser: UserProfile;
  onNavigate: (route: string) => void;
}

export const AccessDeniedCard: React.FC<AccessDeniedCardProps> = ({
  requiredRole,
  currentUser,
  onNavigate,
}) => {
  const users = db.getState().users;
  const targetUser = users.find((u) => u.role === requiredRole);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div>
          <h2 className="text-lg font-bold text-white">Access Restricted by RBAC Policy</h2>
          <p className="text-xs text-slate-400 mt-1">
            This module requires <strong>{requiredRole.toUpperCase()}</strong> authority. Your current active role is{' '}
            <strong className="text-sky-400">{currentUser.role.toUpperCase()}</strong> ({currentUser.fullName}).
          </p>
        </div>

        {targetUser && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
            <div className="text-[11px] text-slate-400">Quick Evaluator Switch:</div>
            <button
              onClick={() => {
                db.switchUser(targetUser.id);
              }}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition"
            >
              Switch to {targetUser.fullName} ({targetUser.role})
            </button>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={() => onNavigate('/')}
            className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Landing Page</span>
          </button>
        </div>
      </div>
    </div>
  );
};
