import React, { useState, useEffect } from 'react';
import { Lock, CheckCircle2, AlertCircle, RefreshCw, Shield } from 'lucide-react';
import { authService } from '../services/authService';
import { supabase } from '../services/supabaseClient';

interface PasswordResetViewProps {
  onNavigate: (route: string) => void;
}

export const PasswordResetView: React.FC<PasswordResetViewProps> = ({ onNavigate }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRecoverySession, setIsRecoverySession] = useState(false);

  useEffect(() => {
    // Check if we have a valid recovery session
    // The Supabase client with detectSessionInUrl:true processes the token from the URL hash.
    // onAuthStateChange fires PASSWORD_RECOVERY if the token is valid.
    if (!supabase) {
      setErrorMsg('Authentication service unavailable.');
      return;
    }

    // Check for existing session (may already have been set by App.tsx handler)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsRecoverySession(true);
      } else {
        setErrorMsg('This password reset link is invalid or has expired. Please request a new one.');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoverySession(true);
        setErrorMsg(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter your new password.');
      return;
    }

    setIsLoading(true);
    const res = await authService.updatePassword(newPassword);
    setIsLoading(false);

    if (res.success) {
      setIsComplete(true);
    } else {
      setErrorMsg(res.error || 'Failed to update password. Please try again or request a new reset link.');
    }
  };

  if (isComplete) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-sky-400 flex items-center justify-center text-white mx-auto shadow-lg">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white">Password updated</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your AeroPool password has been successfully updated. You can now sign in with your new password.
          </p>
          <button
            onClick={() => onNavigate('/')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
          >
            Sign In to AeroPool
          </button>
        </div>
      </div>
    );
  }

  if (!isRecoverySession && errorMsg) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-red-600 to-orange-400 flex items-center justify-center text-white mx-auto shadow-lg">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-white">Reset link invalid</h1>
          <p className="text-xs text-slate-400 leading-relaxed">{errorMsg}</p>
          <button
            onClick={() => onNavigate('/forgot-password')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
          >
            Request New Reset Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-sky-500/20">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Set new password</h1>
          <p className="text-xs text-slate-400">
            Choose a strong password for your AeroPool account.
          </p>
        </div>

        {/* Security notice */}
        <div className="p-3 bg-sky-950/40 border border-sky-500/30 rounded-xl text-xs text-sky-300 flex items-start gap-2">
          <Shield className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <span>Your session is encrypted. This reset link is single-use and expires after use.</span>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirm New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !isRecoverySession}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /><span>Updating password...</span></>
            ) : (
              <span>Set New Password</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

