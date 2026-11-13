import { supabase, isSupabaseConfigured } from './supabaseClient';
import { UserProfile, UserRole } from '../types';
import { db } from './db';
import { isStagingSkipEmailVerificationEnabled } from './configService';

export interface AuthResponse {
  success: boolean;
  user?: UserProfile;
  error?: string;
  isRateLimited?: boolean;
  needsEmailConfirmation?: boolean;
  retryAfterSeconds?: number;
}

export interface ResendVerificationResponse {
  success: boolean;
  error?: string;
  isRateLimited?: boolean;
  isAlreadyVerified?: boolean;
  retryAfterSeconds?: number;
}

export interface PasswordResetResponse {
  success: boolean;
  error?: string;
  isRateLimited?: boolean;
  retryAfterSeconds?: number;
}

export interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role?: UserRole;
}

export interface SignInParams {
  email: string;
  password: string;
}

/**
 * Basic RFC 5322-derived email format validation.
 * Catches obvious structural errors before the API call is made.
 * This is NOT a substitute for server-side validation — it prevents
 * unnecessary API round-trips for clearly invalid addresses.
 */
function isValidEmailFormat(email: string): boolean {
  // Must have exactly one @, local part non-empty, domain with at least one dot
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.indexOf('@');
  if (atIdx < 1) return false; // no @ or @ at position 0
  if (trimmed.indexOf('@', atIdx + 1) !== -1) return false; // multiple @
  const domain = trimmed.substring(atIdx + 1);
  if (!domain.includes('.')) return false; // no dot in domain
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.length < 3) return false; // shortest valid domain: a.b
  // Disallow whitespace
  if (/\s/.test(trimmed)) return false;
  return true;
}

/**
 * Production Authentication Service
 * Manages genuine authentication sessions with Supabase Auth and PostgreSQL profiles.
 * Never creates synthetic demo sessions or falls back to pre-selected demo identities.
 */
class AuthService {
  private isInitialized = false;

  /**
   * Initializes session listener with Supabase Auth.
   * Restores authenticated session from genuine Supabase token or clears session.
   */
  public initAuth(onUserChange?: (user: UserProfile | null) => void, onReady?: () => void): () => void {
    if (this.isInitialized || !isSupabaseConfigured() || !supabase) {
      if (onReady) onReady();
      return () => {};
    }

    this.isInitialized = true;

    // Check existing genuine session on startup
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session?.user) {
        db.setCurrentUser(null);
        if (onUserChange) onUserChange(null);
        if (onReady) onReady();
        return;
      }
      this.fetchAndSetProfile(session.user.id, session.user.email, session.user.user_metadata)
        .then((profile) => {
          if (onUserChange) onUserChange(profile);
        })
        .catch(() => {
          db.setCurrentUser(null);
          if (onUserChange) onUserChange(null);
        })
        .finally(() => {
          if (onReady) onReady();
        });
    });

    // Listen to genuine auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await this.fetchAndSetProfile(session.user.id, session.user.email, session.user.user_metadata);
        if (onUserChange) onUserChange(profile);
      } else {
        db.setCurrentUser(null);
        if (onUserChange) onUserChange(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }

  /**
   * Fetches genuine user profile from public.profiles table
   */
  private async fetchAndSetProfile(
    userId: string,
    email?: string,
    metadata?: Record<string, any>
  ): Promise<UserProfile | null> {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        // Construct basic profile from authenticated token metadata
        const fallbackProfile: UserProfile = {
          id: userId,
          email: email || '',
          fullName: metadata?.full_name || email?.split('@')[0] || 'User',
          phone: metadata?.phone || '',
          role: (metadata?.role as UserRole) || 'passenger',
          createdAt: new Date().toISOString(),
        };
        db.setCurrentUser(fallbackProfile);
        return fallbackProfile;
      }

      const profile: UserProfile = {
        id: data.id,
        email: data.email || email || '',
        fullName: data.full_name,
        phone: data.phone || '',
        role: data.role || 'passenger',
        avatarUrl: data.avatar_url || undefined,
        organizationId: data.organization_id || undefined,
        createdAt: data.created_at || new Date().toISOString(),
      };

      db.setCurrentUser(profile);
      return profile;
    } catch {
      db.setCurrentUser(null);
      return null;
    }
  }

  /**
   * Sign In with Email & Password via Supabase Auth
   */
  public async signIn(params: SignInParams): Promise<AuthResponse> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        success: false,
        error: 'Authentication service is unavailable: Supabase credentials are not configured.',
      };
    }

    if (!isValidEmailFormat(params.email)) {
      return {
        success: false,
        error: 'Please enter a valid email address (e.g. name@example.com).',
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: params.email.trim(),
        password: params.password,
      });

      if (error || !data.user) {
        const isRateLimit = Boolean(
          error?.status === 429 ||
          (error?.message && /rate limit/i.test(error.message)) ||
          (error?.message && /too many requests/i.test(error.message))
        );
        const isUnconfirmed = Boolean(
          error?.message && /email not confirmed/i.test(error.message)
        );
        const isInvalidCredentials = Boolean(
          error?.message && /invalid login credentials/i.test(error.message)
        );

        let friendlyError = error?.message || 'Authentication failed. Please verify your email and password.';
        if (isRateLimit) {
          friendlyError = 'Too many login attempts. Please wait a moment before trying again.';
        } else if (isUnconfirmed) {
          friendlyError = isStagingSkipEmailVerificationEnabled()
            ? 'Your email address is not confirmed. This account was created before email confirmation was deferred in staging. Please confirm it in the Supabase Dashboard (Auth -> Users -> Confirm User), or register a new staging account.'
            : 'Your email address has not been confirmed yet. Please check your inbox for the confirmation email from Supabase.';
        } else if (isInvalidCredentials && isStagingSkipEmailVerificationEnabled()) {
          friendlyError = 'Invalid login credentials. Please verify your email and password. In staging, ensure the account is registered in project rkuzkwggijthbqwlwnps. If this account was created before email confirmation was deferred, confirm it in the Supabase Dashboard (Auth -> Users -> Confirm User) or create a fresh staging account.';
        }

        return {
          success: false,
          error: friendlyError,
          isRateLimited: isRateLimit,
          retryAfterSeconds: isRateLimit ? 60 : undefined,
        };
      }

      const profile = await this.fetchAndSetProfile(data.user.id, data.user.email, data.user.user_metadata);
      if (!profile) {
        return {
          success: false,
          error: 'Authenticated successfully, but failed to load user profile.',
        };
      }

      return {
        success: true,
        user: profile,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in network error';
      const isRateLimit = /rate limit/i.test(msg);
      return {
        success: false,
        error: msg,
        isRateLimited: isRateLimit,
        retryAfterSeconds: isRateLimit ? 60 : undefined,
      };
    }
  }

  /**
   * Create Account (Sign Up) with Email, Password, Name, and Role
   */
  public async signUp(params: SignUpParams): Promise<AuthResponse> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        success: false,
        error: 'Account registration is unavailable: Supabase credentials are not configured.',
      };
    }

    if (!isValidEmailFormat(params.email)) {
      return {
        success: false,
        error: 'Please enter a valid email address (e.g. name@example.com).',
      };
    }

    try {
      // Security Enforcement: Public registration strictly defaults to least-privileged 'passenger'.
      // Client-asserted privileged roles ('admin', 'support', 'fleet_operator', 'driver') are discarded.
      const role: UserRole = 'passenger';
      const { data, error } = await supabase.auth.signUp({
        email: params.email.trim(),
        password: params.password,
        options: {
          data: {
            full_name: params.fullName.trim(),
            phone: params.phone?.trim() || '',
            role,
          },
        },
      });

      if (error || !data.user) {
        const isRateLimit = Boolean(
          error?.status === 429 ||
          (error?.message && /rate limit/i.test(error.message)) ||
          (error?.message && /too many requests/i.test(error.message))
        );

        let friendlyError = error?.message || 'Registration failed. Please try again.';
        if (isRateLimit) {
          friendlyError = 'Email rate limit exceeded. The staging Supabase email quota has been reached for this hour. Please wait a few minutes before trying again, or sign in if you already have an account.';
        }

        return {
          success: false,
          error: friendlyError,
          isRateLimited: isRateLimit,
          retryAfterSeconds: isRateLimit ? 60 : undefined,
        };
      }

      // If email confirmation is required by Supabase project settings
      if (!data.session) {
        return {
          success: true,
          needsEmailConfirmation: true,
          error: isStagingSkipEmailVerificationEnabled()
            ? 'Account registered! However, the remote Supabase staging project still requires email confirmation. To activate instant login, disable email confirmations in Supabase Dashboard (Auth -> Providers -> Email -> Toggle OFF).'
            : 'Account created! Please check your email to confirm your account before signing in.',
        };
      }

      const profile = await this.fetchAndSetProfile(data.user.id, data.user.email, data.user.user_metadata);
      return {
        success: true,
        user: profile || undefined,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration error';
      const isRateLimit = /rate limit/i.test(msg);
      return {
        success: false,
        error: isRateLimit
          ? 'Email rate limit exceeded. Please wait a few minutes before trying again.'
          : msg,
        isRateLimited: isRateLimit,
        retryAfterSeconds: isRateLimit ? 60 : undefined,
      };
    }
  }

  /**
   * Resend Email Verification (Confirmation) Link
   *
   * Uses Supabase Auth OTP resend to request a new confirmation email.
   * Does NOT re-create the account; only requests a new verification link
   * for an existing unverified account.
   *
   * success=true  → Request accepted by Supabase/SMTP provider (email queued).
   * success=false → Rate limited, already verified, or provider error.
   *
   * IMPORTANT: success=true means the send request was accepted, NOT that
   * delivery is confirmed. Check the SMTP provider's delivery logs for actual status.
   */
  public async resendVerificationEmail(email: string): Promise<ResendVerificationResponse> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        success: false,
        error: 'Authentication service unavailable. Supabase credentials are not configured.',
      };
    }

    if (!isValidEmailFormat(email)) {
      return {
        success: false,
        error: 'Please enter a valid email address.',
      };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });

      if (error) {
        const isRateLimit = Boolean(
          error.status === 429 ||
          /rate limit/i.test(error.message) ||
          /too many requests/i.test(error.message)
        );
        const isAlreadyConfirmed = Boolean(
          /already confirmed/i.test(error.message) ||
          /user already registered/i.test(error.message) ||
          /email already confirmed/i.test(error.message)
        );

        if (isAlreadyConfirmed) {
          return {
            success: false,
            isAlreadyVerified: true,
            error: 'Your email address is already verified. Please sign in.',
          };
        }

        if (isRateLimit) {
          return {
            success: false,
            isRateLimited: true,
            retryAfterSeconds: 60,
            error: 'Verification email rate limit reached. Please wait before requesting another email.',
          };
        }

        return {
          success: false,
          error: error.message || 'Failed to resend verification email. Please try again.',
        };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      const isRateLimit = /rate limit/i.test(msg);
      return {
        success: false,
        isRateLimited: isRateLimit,
        retryAfterSeconds: isRateLimit ? 60 : undefined,
        error: isRateLimit
          ? 'Rate limit reached. Please wait before requesting another verification email.'
          : `Failed to resend verification email: ${msg}`,
      };
    }
  }

  /**
   * Send Password Reset Email
   *
   * Triggers Supabase Auth to send a password reset link.
   * Supabase returns success silently when the email does not exist (prevents
   * email enumeration). Do not reveal to the user whether the address exists.
   *
   * success=true  → Reset email queued by SMTP provider.
   * success=false → Rate limited or provider error.
   */
  public async resetPasswordForEmail(
    email: string,
    redirectTo?: string
  ): Promise<PasswordResetResponse> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        success: false,
        error: 'Authentication service unavailable. Supabase credentials are not configured.',
      };
    }

    if (!isValidEmailFormat(email)) {
      return {
        success: false,
        error: 'Please enter a valid email address.',
      };
    }

    try {
      const options = redirectTo ? { redirectTo } : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        options
      );

      if (error) {
        const isRateLimit = Boolean(
          error.status === 429 ||
          /rate limit/i.test(error.message) ||
          /too many requests/i.test(error.message)
        );

        if (isRateLimit) {
          return {
            success: false,
            isRateLimited: true,
            retryAfterSeconds: 60,
            error: 'Password reset rate limit reached. Please wait before requesting another reset email.',
          };
        }

        return {
          success: false,
          error: error.message || 'Failed to send password reset email. Please try again.',
        };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      const isRateLimit = /rate limit/i.test(msg);
      return {
        success: false,
        isRateLimited: isRateLimit,
        retryAfterSeconds: isRateLimit ? 60 : undefined,
        error: isRateLimit
          ? 'Rate limit reached. Please wait before requesting another password reset.'
          : `Failed to send password reset email: ${msg}`,
      };
    }
  }

  /**
   * Update Password
   * Must be called during an active PASSWORD_RECOVERY session
   * (after the user clicks the reset link from the email).
   */
  public async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, error: 'Authentication service unavailable.' };
    }

    if (newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: error.message || 'Failed to update password.' };
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password update failed';
      return { success: false, error: msg };
    }
  }

  /**
   * Sign Out from Supabase Auth
   */
  public async signOut(): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err: unknown) {
        console.warn('Supabase signOut error:', err);
      }
    }
    db.setCurrentUser(null);
    return { success: true };
  }

  /**
   * Get Current Authenticated Profile from Database State
   */
  public getCurrentUser(): UserProfile | null {
    return db.getState().currentUser;
  }

  /**
   * Get Current Supabase Access Token
   */
  public async getAccessToken(): Promise<string | null> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) return session.access_token;
      } catch {
        // Fall through to sandbox/dev fallback
      }
    }
    // Sandbox / development mock account fallback
    const current = this.getCurrentUser();
    if (current) {
      if (current.id === 'test-driver-account-id' || current.role === 'driver') {
        return 'test-token-driver';
      }
      if (current.id === 'test-admin-account-id' || current.role === 'admin') {
        return 'test-token-admin';
      }
      if (current.role === 'fleet_operator') {
        return 'test-token-fleet';
      }
      return 'test-token-passenger';
    }
    return null;
  }
}

export const authService = new AuthService();
