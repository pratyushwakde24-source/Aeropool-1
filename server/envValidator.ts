/**
 * AeroPool — Strict Environment & Secrets Configuration Validator
 * 
 * Enforces production readiness boundaries:
 * 1. Mode segregation: development | sandbox (staging) | production.
 * 2. Cross-mode contamination prevention:
 *    - Rejects live merchant keys (rzp_live_*) in sandbox mode.
 *    - Rejects sandbox keys (rzp_test_*) or placeholders in production mode.
 * 3. Client bundle security:
 *    - Strictly ensures server secrets (service_role, database_url, webhook_secret)
 *      are NEVER prefixed with VITE_.
 * 4. Safe failure:
 *    - Halts startup in production when mandatory variables are missing.
 *    - Never outputs unmasked credentials in logs or error messages.
 */

export type OperatingMode = 'development' | 'sandbox' | 'production';

export interface EnvValidationResult {
  isValid: boolean;
  mode: OperatingMode;
  errors: string[];
  warnings: string[];
  sanitizedConfig: Record<string, string>;
}

/**
 * Mask sensitive values (retaining only leading/trailing characters for debugging)
 */
export function maskSecret(val?: string): string {
  if (!val) return '[UNCONFIGURED]';
  const str = String(val).trim();
  if (str.length <= 8) return '********';
  return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`;
}

/**
 * Validates environment configuration according to active operating mode.
 */
export function validateEnvironment(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawMode = (env.VITE_OPERATING_MODE || env.VITE_APP_MODE || env.NODE_ENV || 'development').toLowerCase();
  const mode: OperatingMode =
    rawMode === 'production' || rawMode === 'prod'
      ? 'production'
      : rawMode === 'sandbox' || rawMode === 'staging'
      ? 'sandbox'
      : 'development';

  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const databaseUrl = env.DATABASE_URL || '';
  const razorpayKeyId = env.VITE_RAZORPAY_KEY_ID || '';
  const razorpaySecret = env.RAZORPAY_KEY_SECRET || '';
  const razorpayWebhookSecret = env.RAZORPAY_WEBHOOK_SECRET || '';
  const allowedOrigins = env.ALLOWED_ORIGINS || '';
  const kycStorageProvider = (env.AEROPOOL_KYC_STORAGE_PROVIDER || 'local').toLowerCase().trim();
  const kycBucket = env.SUPABASE_KYC_BUCKET || 'kyc-vault';
  const kycTokenSecret = env.KYC_TOKEN_SECRET || env.JWT_SECRET || '';

  // Validate KYC storage provider value
  if (kycStorageProvider !== 'local' && kycStorageProvider !== 'supabase') {
    errors.push(`Invalid AEROPOOL_KYC_STORAGE_PROVIDER "${kycStorageProvider}". Must be "local" or "supabase".`);
  }

  // 1. Client bundle boundary inspection:
  // Ensure server-only secrets are NOT accidentally exposed via VITE_ prefix
  const dangerousVitePrefixes = [
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
    'VITE_DATABASE_URL',
    'VITE_RAZORPAY_KEY_SECRET',
    'VITE_RAZORPAY_WEBHOOK_SECRET',
    'VITE_AEROPOOL_KYC_STORAGE_PROVIDER',
    'VITE_KYC_TOKEN_SECRET',
  ];

  for (const dangerousKey of dangerousVitePrefixes) {
    if (env[dangerousKey]) {
      errors.push(
        `Critical Security Breach: Server-only secret "${dangerousKey}" has 'VITE_' prefix. This exposes secrets to the browser client bundle.`
      );
    }
  }

  // 2. Mode-specific cross-contamination and requirements:
  if (mode === 'production') {
    if (!supabaseUrl || !supabaseUrl.startsWith('https://')) {
      errors.push('Production mode requires a secure HTTPS VITE_SUPABASE_URL.');
    }
    if (!supabaseAnonKey) {
      errors.push('Production mode requires VITE_SUPABASE_ANON_KEY.');
    }
    if (!serviceRoleKey) {
      errors.push('Production mode requires SUPABASE_SERVICE_ROLE_KEY for server operations.');
    }
    if (!databaseUrl) {
      errors.push('Production mode requires DATABASE_URL.');
    }

    // Payment safety: Must use verified live Razorpay keys
    if (!razorpayKeyId) {
      errors.push('Production mode requires VITE_RAZORPAY_KEY_ID.');
    } else if (!razorpayKeyId.startsWith('rzp_live_')) {
      errors.push(
        `Production mode cannot use test/placeholder key "${maskSecret(razorpayKeyId)}". Must begin with "rzp_live_".`
      );
    }

    if (!razorpaySecret) {
      errors.push('Production mode requires RAZORPAY_KEY_SECRET.');
    }
    if (!razorpayWebhookSecret) {
      errors.push('Production mode requires RAZORPAY_WEBHOOK_SECRET.');
    }

    // CORS safety in production
    if (!allowedOrigins || allowedOrigins.includes('*')) {
      errors.push('Production mode cannot allow wildcard (*) CORS origins. ALLOWED_ORIGINS must be explicitly configured.');
    }

    // Email verification safety in production
    if (env.VITE_STAGING_SKIP_EMAIL_VERIFICATION === 'true' || env.STAGING_SKIP_EMAIL_VERIFICATION === 'true') {
      errors.push('VITE_STAGING_SKIP_EMAIL_VERIFICATION cannot be true in production. Mandatory email verification is required.');
    }

    // KYC Capability Preview Token Secret in production
    if (!kycTokenSecret || kycTokenSecret.trim().length < 32) {
      errors.push('Production mode requires KYC_TOKEN_SECRET (or JWT_SECRET) with minimum 32 characters.');
    }
  } else if (mode === 'sandbox') {
    // Sandbox Safety: Prevent accidental live keys
    if (razorpayKeyId.startsWith('rzp_live_')) {
      errors.push(
        'Critical Payment Guard: Live Razorpay key (rzp_live_*) detected while operating mode is "sandbox". Terminating to prevent real money movement in test mode.'
      );
    }

    if (!supabaseUrl) {
      warnings.push('VITE_SUPABASE_URL is unconfigured. Sandbox will operate with local storage fallbacks.');
    }
    if (!razorpayKeyId) {
      warnings.push('VITE_RAZORPAY_KEY_ID is unconfigured. Payment orders will use mock orders.');
    }
  } else {
    // Development mode
    if (razorpayKeyId.startsWith('rzp_live_')) {
      errors.push('Critical Payment Guard: Live Razorpay key detected in development mode. Halted.');
    }
  }

  const sanitizedConfig = {
    OPERATING_MODE: mode,
    VITE_SUPABASE_URL: supabaseUrl || '[UNCONFIGURED]',
    VITE_SUPABASE_ANON_KEY: maskSecret(supabaseAnonKey),
    SUPABASE_SERVICE_ROLE_KEY: maskSecret(serviceRoleKey),
    DATABASE_URL: maskSecret(databaseUrl),
    VITE_RAZORPAY_KEY_ID: maskSecret(razorpayKeyId),
    RAZORPAY_KEY_SECRET: maskSecret(razorpaySecret),
    RAZORPAY_WEBHOOK_SECRET: maskSecret(razorpayWebhookSecret),
    ALLOWED_ORIGINS: allowedOrigins || 'Default (localhost/lan)',
    AEROPOOL_KYC_STORAGE_PROVIDER: kycStorageProvider,
    SUPABASE_KYC_BUCKET: kycBucket,
    KYC_TOKEN_SECRET: maskSecret(kycTokenSecret || '[SESSION_GENERATED]'),
  };

  return {
    isValid: errors.length === 0,
    mode,
    errors,
    warnings,
    sanitizedConfig,
  };
}

/**
 * Asserts environment health on server boot.
 * Halts startup in production if invalid.
 */
export function assertServerEnvironment(): EnvValidationResult {
  const result = validateEnvironment();

  console.log(`[AeroPool EnvValidator] Operating Mode: ${result.mode.toUpperCase()}`);

  if (result.warnings.length > 0) {
    result.warnings.forEach((w) => console.warn(`[AeroPool EnvValidator WARNING] ${w}`));
  }

  if (!result.isValid) {
    result.errors.forEach((e) => console.error(`[AeroPool EnvValidator ERROR] ${e}`));
    if (result.mode === 'production') {
      throw new Error(`[AeroPool Startup Halted] Production environment validation failed:\n- ${result.errors.join('\n- ')}`);
    }
  } else {
    console.log('[AeroPool EnvValidator] Environment configuration validated successfully.');
  }

  return result;
}

