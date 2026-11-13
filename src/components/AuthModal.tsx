import React, { useState, useEffect } from 'react';
import {
  X, Lock, Mail, User, Phone, AlertCircle, CheckCircle2,
  Shield, Clock, RefreshCw, Send, Car,
} from 'lucide-react';
import { authService } from '../services/authService';
import { UserRole, UserProfile } from '../types';
import { isStagingSkipEmailVerificationEnabled } from '../services/configService';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup';
  initialEmail?: string;
  initialIntent?: 'passenger' | 'driver';
  onClose: () => void;
  onSuccess: (user: UserProfile, intent?: 'passenger' | 'driver') => void;
  /** Optional: allows the modal to navigate to /forgot-password */
  onNavigate?: (route: string) => void;
}

type ModalMode = 'signin' | 'signup' | 'email_confirmation';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  initialEmail = '',
  initialIntent = 'passenger',
  onClose,
  onSuccess,
  onNavigate,
}) => {
  const [mode, setMode] = useState<ModalMode>(initialMode);
  const [accountIntent, setAccountIntent] = useState<'passenger' | 'driver'>(initialIntent);
  const [pendingEmail, setPendingEmail] = useState('');
  const [email, setEmail] = useState(initialEmail);

  useEffect(() => {
    if (initialIntent) {
      setAccountIntent(initialIntent);
    }
  }, [initialIntent, isOpen]);

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail, isOpen]);
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('passenger');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Resend verification state (independent of main submit cooldown)
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Main submit cooldown timer
  useEffect(() => {
    if (!isOpen || cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, cooldownSeconds]);

  // Resend cooldown timer
  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, resendCooldown]);

  // Sync mode when initialMode prop changes (e.g. "Create Account" button)
  useEffect(() => {
    if (isOpen && mode !== 'email_confirmation') {
      setMode(initialMode);
    }
  }, [initialMode, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleSwitchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setErrorMsg(null);
    setIsRateLimited(false);
    setSuccessNotice(null);
    // Preserve form fields across tabs to avoid user frustration
  };

  const handleResendVerification = async () => {
    if (resendLoading || resendCooldown > 0) return;
    const targetEmail = pendingEmail || email;
    if (!targetEmail) {
      setResendStatus({ type: 'error', msg: 'No email address recorded. Please restart the signup process.' });
      return;
    }

    setResendLoading(true);
    setResendStatus(null);

    const res = await authService.resendVerificationEmail(targetEmail);
    setResendLoading(false);

    if (res.success) {
      setResendStatus({
        type: 'success',
        // Accurate status: request accepted by Supabase, not confirmed delivered
        msg: `Verification email re-queued for ${targetEmail}. Note: this confirms the request was accepted — delivery depends on the email provider. Check your inbox and spam folder.`,
      });
      setResendCooldown(60);
    } else if (res.isAlreadyVerified) {
      setResendStatus({ type: 'success', msg: 'Your email is already verified. You can sign in now.' });
      setMode('signin');
    } else if (res.isRateLimited) {
      setResendStatus({ type: 'error', msg: res.error || 'Rate limit reached. Please wait before retrying.' });
      setResendCooldown(res.retryAfterSeconds || 60);
    } else {
      setResendStatus({ type: 'error', msg: res.error || 'Failed to resend. Please try again.' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || cooldownSeconds > 0) return;

    setErrorMsg(null);
    setIsRateLimited(false);
    setSuccessNotice(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup' && !fullName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'signin') {
        const res = await authService.signIn({ email, password });
        if (res.success && res.user) {
          onSuccess(res.user, accountIntent);
          onClose();
        } else {
          setErrorMsg(res.error || 'Failed to sign in. Please verify your credentials.');
          if (res.isRateLimited) {
            setIsRateLimited(true);
            setCooldownSeconds(res.retryAfterSeconds || 60);
          }
        }
      } else {
        const res = await authService.signUp({
          email,
          password,
          fullName,
          phone,
          role,
        });

        if (res.success) {
          if (res.user) {
            onSuccess(res.user, accountIntent);
            onClose();
          } else {
            // Email confirmation required — transition to dedicated confirmation UI
            setPendingEmail(email);
            setMode('email_confirmation');
            setResendStatus(null);
          }
        } else {
          setErrorMsg(res.error || 'Registration failed. Please try again.');
          if (res.isRateLimited) {
            setIsRateLimited(true);
            setCooldownSeconds(res.retryAfterSeconds || 60);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication service error';
      setErrorMsg(msg);
      if (/rate limit/i.test(msg)) {
        setIsRateLimited(true);
        setCooldownSeconds(60);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── EMAIL CONFIRMATION VIEW ───────────────────────────────────────────────
  if (mode === 'email_confirmation') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-sky-500/20">
              <Mail className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white">Check your inbox</h2>
            <p className="text-xs text-slate-400">
              We've sent a verification email to:
            </p>
            <p className="text-sm font-mono font-semibold text-sky-300 break-all">{pendingEmail}</p>
          </div>

          {/* Steps */}
          <div className="space-y-3 text-xs text-slate-300">
            {[
              { n: 1, text: 'Open the email from AeroPool in your inbox.' },
              { n: 2, text: 'Click the "Verify Email Address" button.' },
              { n: 3, text: 'Return here and sign in with your credentials.' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="w-5 h-5 shrink-0 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[11px] font-bold flex items-center justify-center mt-0.5">{n}</span>
                <span className="leading-relaxed">{text}</span>
              </div>
            ))}
          </div>

          {/* Spam notice */}
          <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-xl text-xs text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>If you don't see the email within 2 minutes, check your spam or junk folder.</span>
          </div>

          {/* Resend status */}
          {resendStatus && (
            <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 animate-in fade-in ${
              resendStatus.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/40 border-red-500/40 text-red-300'
            }`}>
              {resendStatus.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
              <span className="leading-relaxed">{resendStatus.msg}</span>
            </div>
          )}

          {/* Resend + Sign In actions */}
          <div className="flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendLoading || resendCooldown > 0}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendLoading ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /><span>Sending...</span></>
              ) : resendCooldown > 0 ? (
                <><Clock className="w-4 h-4 text-amber-400" /><span>Resend available in {resendCooldown}s</span></>
              ) : (
                <><Send className="w-4 h-4 text-sky-400" /><span>Resend Verification Email</span></>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('signin')}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
            >
              I've Verified — Sign In
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-500 pt-1">
            Verification request accepted ≠ email delivered. Check your provider's spam folder if not received.
          </p>
        </div>
      </div>
    );
  }

  // ─── SIGN IN / SIGN UP VIEW ────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1.5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-white mx-auto shadow-lg shadow-sky-500/20">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {mode === 'signin' ? 'Sign in to AeroPool' : 'Create your AeroPool Account'}
          </h2>
          <p className="text-xs text-slate-400">
            {mode === 'signin'
              ? 'Access your airport ride bookings and verified identity'
              : "Join Mumbai CSMIA's smart airport ride-pooling network"}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleSwitchMode('signin')}
            className={`flex-1 py-2 rounded-lg transition ${
              mode === 'signin' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('signup')}
            className={`flex-1 py-2 rounded-lg transition ${
              mode === 'signup' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Staging Deferred Verification Notice */}
        {isStagingSkipEmailVerificationEnabled() && (
          <div className="p-3 bg-sky-950/40 border border-sky-500/30 rounded-xl text-xs text-sky-200 flex items-start gap-2.5 animate-in fade-in">
            <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0 animate-pulse" />
            <div className="space-y-0.5">
              <p className="font-semibold text-white">Staging Mode: Instant Account Activation</p>
              <p className="text-[11px] text-sky-300/80 leading-relaxed">
                Email verification is temporarily deferred in this staging sandbox for rapid testing. Accounts activate immediately upon registration.
              </p>
            </div>
          </div>
        )}

        {/* Feedback Messages */}
        {isRateLimited && (
          <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl text-xs text-amber-200 space-y-2.5 animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <Clock className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-white">Email Rate Limit Exceeded</p>
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-amber-400 font-mono font-medium">
                {cooldownSeconds > 0
                  ? `Cooldown active: ${cooldownSeconds}s remaining`
                  : 'Cooldown complete. You may retry now.'}
              </span>
              <button
                type="button"
                onClick={() => handleSwitchMode('signin')}
                className="text-sky-400 hover:text-sky-300 underline font-semibold transition"
              >
                Already have an account? Sign In
              </button>
            </div>
          </div>
        )}

        {errorMsg && !isRateLimited && (
          <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <div className="flex-1 space-y-1">
              <span>{errorMsg}</span>
              {mode === 'signin' && errorMsg.includes('confirmation email') && (
                <p className="text-[11px] text-red-400/80">
                  Tip: Check your spam or junk folder. You can also{' '}
                  <button
                    type="button"
                    className="underline text-sky-400 hover:text-sky-300"
                    onClick={() => {
                      setPendingEmail(email);
                      setMode('email_confirmation');
                    }}
                  >
                    resend the verification email
                  </button>.
                </p>
              )}
            </div>
          </div>
        )}

        {successNotice && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <>
              {/* Account Intent Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">I am registering as:</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setAccountIntent('passenger')}
                    className={`py-2 px-3 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                      accountIntent === 'passenger'
                        ? 'bg-blue-600/30 text-sky-300 border border-sky-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Passenger</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountIntent('driver')}
                    className={`py-2 px-3 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                      accountIntent === 'driver'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Car className="w-3.5 h-3.5" />
                    <span>Driver Partner</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={accountIntent === 'driver' ? 'Full name as printed on driving licence' : 'Enter your legal name'}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Phone Number {accountIntent === 'driver' ? '(Required for Driver)' : '(Optional)'}</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required={accountIntent === 'driver'}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98200 00000"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                  />
                </div>
              </div>

              {accountIntent === 'driver' ? (
                <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl text-xs text-cyan-200 flex items-start gap-2.5">
                  <Car className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-white">Commercial Driver Partner Onboarding</p>
                    <p className="text-[11px] text-slate-400">
                      You will create your account first, then be guided directly to submit your commercial driving licence and vehicle details for administrative verification.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-sky-950/40 border border-sky-500/30 rounded-xl text-xs text-sky-300 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-white">Verified Passenger Account</p>
                    <p className="text-[11px] text-slate-400">
                      Instant access to CSMIA airport pooling corridors and transparent minor unit (paise) pricing.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Email Address</label>
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">Password</label>
              {mode === 'signin' && (
                <button
                  type="button"
                  className="text-[11px] text-sky-400 hover:text-sky-300 transition"
                  onClick={() => {
                    onClose();
                    if (onNavigate) onNavigate('/forgot-password');
                  }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || cooldownSeconds > 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{mode === 'signin' ? 'Authenticating...' : 'Creating Account...'}</span>
              </>
            ) : cooldownSeconds > 0 ? (
              <>
                <Clock className="w-4 h-4 text-amber-300 animate-pulse" />
                <span>Please wait {cooldownSeconds}s before retrying</span>
              </>
            ) : (
              <span>{mode === 'signin' ? 'Sign In' : 'Complete Registration'}</span>
            )}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800">
          <p className="text-[11px] text-slate-500">
            AeroPool uses end-to-end cryptographic authentication via Supabase Auth &amp; PostgreSQL Row-Level Security.
          </p>
        </div>
      </div>
    </div>
  );
};
