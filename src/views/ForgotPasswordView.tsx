import React, { useState, useEffect } from 'react';
import { ArrowLeft, Mail, CheckCircle2, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { authService } from '../services/authService';

interface ForgotPasswordViewProps {
  onNavigate: (route: string) => void;
}

export const ForgotPasswordView: React.FC<ForgotPasswordViewProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || cooldownSeconds > 0) return;

    setErrorMsg(null);
    setIsLoading(true);

    // Build the redirect URL so Supabase sends the user back to the reset page
    const redirectTo = `${window.location.origin}/auth/reset-password`;

    const res = await authService.resetPasswordForEmail(email.trim(), redirectTo);
    setIsLoading(false);

    if (res.success) {
      // Always show success — Supabase returns 200 even if the email doesn't exist
      // (prevents email enumeration). Do not tell the user whether the address exists.
      setSubmitted(true);
    } else if (res.isRateLimited) {
      setErrorMsg(res.error || 'Rate limit reached. Please wait before retrying.');
      setCooldownSeconds(res.retryAfterSeconds || 60);
    } else {
      setErrorMsg(res.error || 'Failed to send reset email. Please try again.');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Back link */}
        <button
          onClick={() => onNavigate('/')}
          className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-semibold transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to AeroPool</span>
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-sky-500/20">
              <Mail className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-white">Reset your password</h1>
            <p className="text-xs text-slate-400">
              Enter your account email address. If an account exists, we'll send a password reset link.
            </p>
          </div>

          {/* Success state */}
          {submitted ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs">
                  <p className="font-semibold text-white">Reset email sent</p>
                  <p className="text-emerald-300/90 leading-relaxed">
                    If an AeroPool account exists for <span className="font-mono text-sky-300">{email}</span>, a password reset link has been sent.
                    Check your inbox and spam folder. The link expires in 1 hour.
                  </p>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Note: the reset email request was accepted — delivery depends on your email provider and whether SMTP is configured correctly.
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('/')}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
              >
                Return to AeroPool
              </button>
            </div>
          ) : (
            <>
              {/* Error message */}
              {errorMsg && (
                <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || cooldownSeconds > 0}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /><span>Sending reset email...</span></>
                  ) : cooldownSeconds > 0 ? (
                    <><Clock className="w-4 h-4 text-amber-300 animate-pulse" /><span>Wait {cooldownSeconds}s before retrying</span></>
                  ) : (
                    <span>Send Password Reset Email</span>
                  )}
                </button>
              </form>

              <p className="text-center text-[11px] text-slate-500">
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('/')}
                  className="text-sky-400 hover:text-sky-300 underline"
                >
                  Return and sign in
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

