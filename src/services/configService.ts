/**
 * AeroPool Configuration & Operating Mode Service
 * 
 * Enforces explicit operating modes:
 * - 'development': Explicitly labelled sample data, offline local testing, simulated telemetry allowed.
 * - 'sandbox': Payment gateway test keys (rzp_test_*), sandbox ledger records, test transactions.
 * - 'production': Verified persistent database required, real external APIs, simulated data blocked from live feeds.
 */

export type OperatingMode = 'development' | 'sandbox' | 'production';

export interface AppConfig {
  mode: OperatingMode;
  appUrl: string;
  supabase: {
    url: string;
    hasAnonKey: boolean;
    isConfigured: boolean;
  };
  razorpay: {
    keyId: string;
    isConfigured: boolean;
    isTestMode: boolean;
    isLiveMode: boolean;
  };
  flightProvider: {
    providerName: string;
    isLiveConfigured: boolean;
  };
  maps: {
    tileUrl: string;
    isConfigured: boolean;
  };
  /**
   * Temporary Staging-Only Feature: Defer mandatory email verification.
   * STRICT SECURITY BOUNDARY: Always evaluates to false in production mode.
   */
  stagingSkipEmailVerification: boolean;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const getEnv = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return String(import.meta.env[key]);
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return String(process.env[key]);
  }
  return '';
};

/**
 * Resolves the active operating mode from environment variables.
 * Defaults to 'development' if unspecified or running in local dev.
 */
export function getOperatingMode(): OperatingMode {
  const envMode = (getEnv('VITE_OPERATING_MODE') || getEnv('VITE_APP_MODE') || getEnv('NODE_ENV') || 'development').toLowerCase();
  if (envMode === 'production' || envMode === 'prod') return 'production';
  if (envMode === 'sandbox' || envMode === 'staging') return 'sandbox';
  return 'development';
}

/**
 * Temporary Staging-Only Authentication Mode Check
 *
 * Evaluates whether deferred email verification is active for staging testing.
 *
 * CRITICAL ARCHITECTURAL CONSTRAINTS:
 * 1. Fail Closed in Production: Unconditionally returns `false` if getOperatingMode() is 'production'.
 * 2. Not a Bypass Mechanism: This flag controls client-side onboarding UX and feedback.
 *    It CANNOT bypass Supabase GoTrue server-side verification: if the remote Supabase project
 *    has "Confirm email" toggled ON, GoTrue withholds the JWT session at signup and blocks sign-in.
 * 3. Reversibility: Setting VITE_STAGING_SKIP_EMAIL_VERIFICATION="false" instantly restores
 *    the standard email confirmation UX.
 */
export function isStagingSkipEmailVerificationEnabled(): boolean {
  const mode = getOperatingMode();
  if (mode === 'production') {
    return false; // Mandatory fail-closed security boundary for production
  }
  const flag = (
    getEnv('VITE_STAGING_SKIP_EMAIL_VERIFICATION') ||
    getEnv('STAGING_SKIP_EMAIL_VERIFICATION')
  ).toLowerCase();
  return flag === 'true' || flag === '1';
}

/**
 * Returns complete sanitized client configuration.
 * Note: Server-only secrets are never read or returned here.
 */
export function getAppConfig(): AppConfig {
  const mode = getOperatingMode();
  const supabaseUrl = getEnv('VITE_SUPABASE_URL');
  const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');
  const razorpayKeyId = getEnv('VITE_RAZORPAY_KEY_ID');
  const flightKey = getEnv('FLIGHT_API_KEY');
  const mapTilesUrl = getEnv('VITE_MAP_TILES_URL') || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const appUrl = getEnv('VITE_APP_URL') || getEnv('APP_URL') || 'http://localhost:3000';

  const isSupabaseValid = Boolean(
    supabaseUrl &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-project') &&
    supabaseAnonKey &&
    supabaseAnonKey.length > 20 &&
    !supabaseAnonKey.includes('your-anon-key')
  );

  const isRazorpayTest = Boolean(razorpayKeyId && razorpayKeyId.startsWith('rzp_test_'));
  const isRazorpayLive = Boolean(razorpayKeyId && razorpayKeyId.startsWith('rzp_live_'));

  return {
    mode,
    appUrl,
    supabase: {
      url: isSupabaseValid ? supabaseUrl : '',
      hasAnonKey: Boolean(supabaseAnonKey && !supabaseAnonKey.includes('your-anon-key')),
      isConfigured: isSupabaseValid,
    },
    razorpay: {
      keyId: razorpayKeyId || '',
      isConfigured: Boolean(razorpayKeyId && (isRazorpayTest || isRazorpayLive)),
      isTestMode: isRazorpayTest || (!razorpayKeyId && mode !== 'production'),
      isLiveMode: isRazorpayLive,
    },
    flightProvider: {
      providerName: getEnv('VITE_FLIGHT_API_PROVIDER') || (flightKey ? 'CSMIA Live Feed' : 'CSMIA Schedule Adapter'),
      isLiveConfigured: Boolean(flightKey && flightKey.length > 8),
    },
    maps: {
      tileUrl: mapTilesUrl,
      isConfigured: Boolean(mapTilesUrl),
    },
    stagingSkipEmailVerification: isStagingSkipEmailVerificationEnabled(),
  };
}

/**
 * Validates configuration against current operating mode requirements.
 * In production mode, missing database or live keys triggers validation failure.
 */
export function validateEnvironmentConfig(modeOverride?: OperatingMode): ConfigValidationResult {
  const mode = modeOverride || getOperatingMode();
  const config = getAppConfig();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (mode === 'production') {
    if (!config.supabase.isConfigured) {
      errors.push('CRITICAL: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured in production mode.');
    }
    if (!config.razorpay.isConfigured || !config.razorpay.isLiveMode) {
      errors.push('CRITICAL: Production mode requires a verified live Razorpay Merchant Key ID (rzp_live_*).');
    }
    if (!config.flightProvider.isLiveConfigured) {
      warnings.push('NOTICE: Live flight API key (FLIGHT_API_KEY) is not configured. Falling back to published CSMIA airport timetable.');
    }
    const rawFlag = (getEnv('VITE_STAGING_SKIP_EMAIL_VERIFICATION') || getEnv('STAGING_SKIP_EMAIL_VERIFICATION')).toLowerCase();
    if (rawFlag === 'true' || rawFlag === '1') {
      warnings.push('NOTICE: STAGING_SKIP_EMAIL_VERIFICATION is ignored in production mode. Mandatory email verification remains strictly enforced.');
    }
  } else if (mode === 'sandbox') {
    if (!config.razorpay.isTestMode && !config.razorpay.isConfigured) {
      warnings.push('Sandbox mode active: Using synthetic test payment flow without live credentials.');
    }
  } else {
    // Development mode
    if (!config.supabase.isConfigured) {
      warnings.push('Development Mode: Using local offline transactional store with sample data.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
