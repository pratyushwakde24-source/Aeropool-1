/**
 * AeroPool — API Client Configuration
 * Handles API URL resolution for both local development (via Vite proxy)
 * and staged/production environments (via VITE_API_URL or same-origin rewrites).
 */

export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  // Default to empty string for relative paths (/api/...)
  // In development, this is proxied by Vite to http://localhost:3001
  // In production/staging with reverse proxy or same-origin, this resolves to the same domain
  return '';
};

export const apiFetch = (endpoint: string, init?: RequestInit): Promise<Response> => {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return fetch(`${base}${cleanEndpoint}`, init);
};
