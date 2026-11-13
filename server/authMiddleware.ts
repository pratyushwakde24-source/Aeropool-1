import type { Request, Response, NextFunction } from 'express';

export type UserRole = 'passenger' | 'driver' | 'fleet_operator' | 'admin' | 'support';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: UserRole;
  tenantId?: string;
  isVerified: boolean;
  authProvider: 'supabase_jwt' | 'local_sandbox_dev';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// Development / Test sandbox mock accounts with verified server-side identities
const SANDBOX_TEST_ACCOUNTS: Record<string, AuthenticatedUser> = {
  'test-token-admin': {
    id: 'test-admin-account-id',
    email: 'admin@aeropool.test',
    role: 'admin',
    isVerified: true,
    authProvider: 'local_sandbox_dev',
  },
  'test-token-driver': {
    id: 'test-driver-account-id',
    email: 'driver@aeropool.test',
    role: 'driver',
    isVerified: true,
    authProvider: 'local_sandbox_dev',
  },
  'test-token-driver-b': {
    id: 'test-driver-b-account-id',
    email: 'driver-b@aeropool.test',
    role: 'driver',
    isVerified: true,
    authProvider: 'local_sandbox_dev',
  },
  'test-token-fleet': {
    id: 'test-fleet-account-id',
    email: 'ops@metrocab.test',
    role: 'fleet_operator',
    tenantId: 'org-metrocab-mumbai',
    isVerified: true,
    authProvider: 'local_sandbox_dev',
  },
  'test-token-passenger': {
    id: 'test-passenger-account-id',
    email: 'passenger@example.test',
    role: 'passenger',
    isVerified: true,
    authProvider: 'local_sandbox_dev',
  },
};

/**
 * Validates Supabase JWT from Authorization: Bearer <token>
 * Never accepts client-asserted role or userId without cryptographic token verification.
 */
export function authenticateJwt(options: { optional?: boolean } = {}) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const operatingMode = process.env.VITE_OPERATING_MODE || 'development';
    const isProduction = operatingMode === 'production';

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (options.optional) {
        return next();
      }
      return res.status(401).json({
        error: 'Unauthorized: Authorization Bearer token is required.',
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Empty Bearer token provided.' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

    // In production, official Supabase JWT validation is strictly mandatory
    if (isProduction) {
      if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(503).json({
          error: 'Authentication Configuration Error: Supabase Auth credentials are unconfigured in production mode.',
        });
      }

      try {
        const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          return res.status(401).json({
            error: 'Unauthorized: Invalid or expired Supabase JWT token.',
          });
        }

        const supabaseUser = await response.json();
        // Strict Security: Roles are derived exclusively from protected app_metadata (managed by server/triggers).
        // Never trust client-controlled user_metadata for role or tenant privileges!
        const role: UserRole = supabaseUser.app_metadata?.role || 'passenger';

        req.user = {
          id: supabaseUser.id,
          email: supabaseUser.email,
          role,
          tenantId: supabaseUser.app_metadata?.tenant_id,
          isVerified: Boolean(supabaseUser.email_confirmed_at),
          authProvider: 'supabase_jwt',
        };

        return next();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Auth verification error';
        return res.status(502).json({ error: `Supabase Auth unreachable: ${msg}` });
      }
    }

    // In development / sandbox mode: check test tokens or attempt live Supabase probe
    if (SANDBOX_TEST_ACCOUNTS[token]) {
      req.user = { ...SANDBOX_TEST_ACCOUNTS[token] };
      return next();
    }

    // If a JWT is supplied in dev mode and Supabase is configured
    if (supabaseUrl && supabaseAnonKey && token.includes('.')) {
      try {
        const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const supabaseUser = await response.json();
          req.user = {
            id: supabaseUser.id,
            email: supabaseUser.email,
            role: supabaseUser.app_metadata?.role || 'passenger',
            tenantId: supabaseUser.app_metadata?.tenant_id,
            isVerified: true,
            authProvider: 'supabase_jwt',
          };
          return next();
        }
      } catch {
        // Fall through to invalid token check
      }
    }

    return res.status(401).json({
      error: 'Unauthorized: Invalid authentication token.',
    });
  };
}

/**
 * Enforces role-based access control.
 * Derives role exclusively from verified req.user, ignoring any body/query parameters.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: User role '${req.user.role}' lacks permission for this action. Allowed roles: [${allowedRoles.join(', ')}].`,
      });
    }

    return next();
  };
}

/**
 * Enforces tenant isolation for fleet operators.
 * Prevents cross-tenant viewing or manipulation of vehicles and settlements.
 */
export function requireTenant(tenantIdField = 'tenantId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }

    // Super-admin has cross-tenant oversight
    if (req.user.role === 'admin') {
      return next();
    }

    const requestedTenantId =
      req.params?.[tenantIdField] ||
      req.body?.[tenantIdField] ||
      (req.query?.[tenantIdField] as string);

    if (!requestedTenantId) {
      return res.status(400).json({ error: `Missing required parameter '${tenantIdField}'` });
    }

    if (req.user.role === 'fleet_operator') {
      if (!req.user.tenantId || req.user.tenantId !== requestedTenantId) {
        return res.status(403).json({
          error: `Cross-Tenant Access Denied: User tenant '${req.user.tenantId}' cannot access tenant '${requestedTenantId}'.`,
        });
      }
    }

    return next();
  };
}
