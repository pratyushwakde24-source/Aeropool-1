import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Safe environment variable retrieval across Vite and Node test runners
const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || '';
  }
  return '';
};

const rawSupabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

/**
 * Checks if real Supabase credentials have been configured in .env
 */
export function isSupabaseConfigured(): boolean {
  return (
    typeof supabaseUrl === 'string' &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-project') &&
    typeof supabaseAnonKey === 'string' &&
    supabaseAnonKey.length > 20 &&
    !supabaseAnonKey.includes('your-anon-key')
  );
}

/**
 * Singleton Supabase Client instance (null if unconfigured)
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  url: string;
  hasAnonKey: boolean;
  statusMessage: string;
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const configured = isSupabaseConfigured();
  return {
    isConfigured: configured,
    url: configured ? supabaseUrl : 'Not Configured (Using Offline ACID Store)',
    hasAnonKey: Boolean(supabaseAnonKey && !supabaseAnonKey.includes('your-anon-key')),
    statusMessage: configured
      ? 'Connected to live Supabase PostgreSQL backend'
      : 'Supabase credentials absent or placeholder. Using resilient local transactional store with full ACID capacity locking.',
  };
}
