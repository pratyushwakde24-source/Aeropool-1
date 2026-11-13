import React from 'react';
import { CheckCircle2, Mail } from 'lucide-react';

interface EmailVerifiedViewProps {
  onNavigate: (route: string) => void;
}

export const EmailVerifiedView: React.FC<EmailVerifiedViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl text-center animate-in fade-in slide-in-from-bottom-4">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-sky-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <Mail className="w-8 h-8" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-slate-900">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Email verified!</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your AeroPool account email has been successfully verified.
            You can now sign in and start booking airport rides.
          </p>
        </div>

        {/* Info note */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400 text-left leading-relaxed">
          <span className="text-sky-400 font-semibold">What's next?</span>
          {' '}Sign in with your email and password to access your passenger dashboard. 
          If you're a driver partner, complete the KYC onboarding after signing in.
        </div>

        {/* CTA */}
        <button
          onClick={() => onNavigate('/')}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition"
        >
          Sign In to AeroPool
        </button>

        <p className="text-[11px] text-slate-600">
          Email verified · AeroPool authentication · Supabase Auth
        </p>
      </div>
    </div>
  );
};

