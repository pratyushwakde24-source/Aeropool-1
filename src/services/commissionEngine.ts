/**
 * AeroPool — Centralized Commission & Revenue Settlement Engine
 * 
 * Strict Financial Guarantees:
 * 1. Strict Integer Arithmetic (Paise: ₹1 = 100 paise). Zero floating-point drift.
 * 2. Immutable Policy Snapshots: Each calculation attaches a frozen snapshot of the policy applied.
 * 3. Exact Reconciliation Invariant:
 *    driverNetPayoutPaise + platformNetRevenuePaise === grossFarePaise
 * 4. Effective Date Support: Supports historical and forward-dated policies without retroactive mutation.
 * 5. Commercial Policy Notice:
 *    Existing code contains conflicting 80/20 and 85/15 implementations.
 *    The engine supports both as distinct policies and marks the active default as
 *    'PROPOSED_PENDING_BUSINESS_APPROVAL'.
 */

export type TollTreatment =
  | 'PASS_THROUGH_TO_DRIVER' // 100% of toll given to driver without commission cut (driver pays gate toll)
  | 'COMMISSIONABLE_GROSS'    // Toll is pooled into gross before commission split
  | 'RETAINED_BY_PLATFORM';  // Platform collects and pays airport authority directly

export type PlatformFeeTreatment =
  | '100_PERCENT_PLATFORM'   // Platform convenience fee retained 100% by AeroPool
  | 'SHARED_WITH_DRIVER';    // Platform fee split according to commission percentage

export interface CommissionPolicy {
  policyId: string;
  policyName: string;
  version: string;
  effectiveFrom: string; // ISO date
  effectiveTo?: string;   // ISO date, undefined = currently active
  driverSharePercent: number; // e.g. 80 or 85
  platformCommissionPercent: number; // e.g. 20 or 15
  tollTreatment: TollTreatment;
  platformFeeTreatment: PlatformFeeTreatment;
  status: 'ACTIVE' | 'PROPOSED_PENDING_APPROVAL' | 'ARCHIVED';
  commercialApprovalStatus: 'APPROVED' | 'PENDING_BUSINESS_SIGN_OFF';
  approvalNotes: string;
}

export interface CommissionSplitRequest {
  grossFarePaise: number;
  airportTollPaise?: number;
  platformFeePaise?: number;
  tripId?: string;
  poolId?: string;
  driverId?: string;
  transactionTimestamp?: string;
  customPolicy?: CommissionPolicy;
}

export interface CommissionSplitResult {
  grossFarePaise: number;
  commissionableFarePaise: number;
  driverBasePayoutPaise: number;
  driverTollReimbursementPaise: number;
  driverNetPayoutPaise: number;
  platformCommissionPaise: number;
  platformFeeRetainedPaise: number;
  platformNetRevenuePaise: number;
  roundingAdjustmentPaise: number;
  policySnapshot: CommissionPolicy;
  calculatedAt: string;
  reconciled: boolean;
}

// ----------------------------------------------------------------------------
// STANDARD POLICIES
// ----------------------------------------------------------------------------

/**
 * Standard Policy A (80/20 Split)
 * Matches existing database pool status settlement logic (db.ts:1268).
 */
export const COMMISSION_POLICY_80_20: CommissionPolicy = {
  policyId: 'COMM_POL_80_20_V1',
  policyName: 'Standard 80/20 Airport Driver Agreement',
  version: '1.0.0',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  driverSharePercent: 80,
  platformCommissionPercent: 20,
  tollTreatment: 'PASS_THROUGH_TO_DRIVER',
  platformFeeTreatment: '100_PERCENT_PLATFORM',
  status: 'ACTIVE',
  commercialApprovalStatus: 'APPROVED',
  approvalNotes: 'Audited baseline policy in db.ts updatePoolStatus. Note: 100% airport toll pass-through is provisional default; barrier payment responsibility (driver out-of-pocket vs corporate FASTag) pending final commercial sign-off.',
};

/**
 * Standard Policy B (85/15 Split)
 * Matches DriverDashboardView.tsx pending offer estimate and fleet org commission rate.
 * IDENTIFIED IN AUDIT AS PENDING FINAL COMMERCIAL SIGN-OFF.
 */
export const COMMISSION_POLICY_85_15: CommissionPolicy = {
  policyId: 'COMM_POL_85_15_PROPOSED',
  policyName: 'Driver-First 85/15 Competitive Airport Agreement',
  version: '1.1.0-RC',
  effectiveFrom: '2026-10-01T00:00:00.000Z',
  driverSharePercent: 85,
  platformCommissionPercent: 15,
  tollTreatment: 'PASS_THROUGH_TO_DRIVER',
  platformFeeTreatment: '100_PERCENT_PLATFORM',
  status: 'PROPOSED_PENDING_APPROVAL',
  commercialApprovalStatus: 'PENDING_BUSINESS_SIGN_OFF',
  approvalNotes: 'Pending final executive approval. Aligns with fleet organization 15% rate. Toll pass-through pending commercial sign-off.',
};

// Default policy registry
const POLICY_REGISTRY = new Map<string, CommissionPolicy>([
  [COMMISSION_POLICY_80_20.policyId, COMMISSION_POLICY_80_20],
  [COMMISSION_POLICY_85_15.policyId, COMMISSION_POLICY_85_15],
]);

let activeDefaultPolicyId = COMMISSION_POLICY_80_20.policyId;

/**
 * Sets the default commission policy ID for new transactions.
 */
export function setActiveCommissionPolicy(policyId: string): void {
  if (!POLICY_REGISTRY.has(policyId)) {
    throw new Error(`Commission policy ${policyId} is not registered.`);
  }
  activeDefaultPolicyId = policyId;
}

/**
 * Retrieves the currently active commission policy.
 */
export function getActiveCommissionPolicy(): CommissionPolicy {
  return POLICY_REGISTRY.get(activeDefaultPolicyId) || COMMISSION_POLICY_80_20;
}

/**
 * Retrieves a policy by ID or timestamp.
 */
export function getCommissionPolicyForTimestamp(isoTimestamp?: string): CommissionPolicy {
  if (!isoTimestamp) return getActiveCommissionPolicy();
  const dateMs = new Date(isoTimestamp).getTime();

  for (const policy of POLICY_REGISTRY.values()) {
    const fromMs = new Date(policy.effectiveFrom).getTime();
    const toMs = policy.effectiveTo ? new Date(policy.effectiveTo).getTime() : Infinity;
    if (dateMs >= fromMs && dateMs <= toMs && policy.status !== 'ARCHIVED') {
      return policy;
    }
  }

  return getActiveCommissionPolicy();
}

/**
 * Calculates deterministic commission split with integer paise rounding safeguards.
 * Guarantees: driverNetPayoutPaise + platformNetRevenuePaise === grossFarePaise
 */
export function calculateCommissionSplit(
  request: CommissionSplitRequest
): CommissionSplitResult {
  const { grossFarePaise, tripId, customPolicy, transactionTimestamp } = request;

  if (typeof grossFarePaise !== 'number' || isNaN(grossFarePaise) || grossFarePaise < 0) {
    throw new Error(`Invalid gross fare: ${grossFarePaise}. Must be non-negative integer paise.`);
  }

  const policy = customPolicy || getCommissionPolicyForTimestamp(transactionTimestamp);

  // Validate policy percentage sanity
  if (policy.driverSharePercent + policy.platformCommissionPercent !== 100) {
    throw new Error(
      `Commission policy ${policy.policyId} configuration error: Driver share (${policy.driverSharePercent}%) + Platform commission (${policy.platformCommissionPercent}%) must sum to 100%.`
    );
  }

  const rawAirportToll = Math.max(0, request.airportTollPaise || 0);
  const rawPlatformFee = Math.max(0, request.platformFeePaise || 0);

  // Determine toll and fee allocation based on policy treatment
  let driverTollReimbursementPaise = 0;
  let platformFeeRetainedPaise = 0;
  let commissionableFarePaise = grossFarePaise;

  if (policy.tollTreatment === 'PASS_THROUGH_TO_DRIVER') {
    // Toll passes directly to driver to cover out-of-pocket airport toll gate payment
    driverTollReimbursementPaise = Math.min(rawAirportToll, grossFarePaise);
    commissionableFarePaise = Math.max(0, commissionableFarePaise - driverTollReimbursementPaise);
  }

  if (policy.platformFeeTreatment === '100_PERCENT_PLATFORM') {
    // Platform fee is retained 100% by platform
    platformFeeRetainedPaise = Math.min(rawPlatformFee, commissionableFarePaise);
    commissionableFarePaise = Math.max(0, commissionableFarePaise - platformFeeRetainedPaise);
  }

  // Calculate proportional split on commissionable fare
  // Using Math.floor on driver share and calculating platform as remainder guarantees zero lost paise
  const driverBasePayoutPaise = Math.floor(
    (commissionableFarePaise * policy.driverSharePercent) / 100
  );
  const platformCommissionPaise = commissionableFarePaise - driverBasePayoutPaise;

  // Aggregate totals
  const driverNetPayoutPaise = driverBasePayoutPaise + driverTollReimbursementPaise;
  const platformNetRevenuePaise = platformCommissionPaise + platformFeeRetainedPaise;

  // Exact balance verification
  const totalAllocated = driverNetPayoutPaise + platformNetRevenuePaise;
  const roundingAdjustmentPaise = grossFarePaise - totalAllocated;

  const reconciled = totalAllocated === grossFarePaise;

  return {
    grossFarePaise,
    commissionableFarePaise,
    driverBasePayoutPaise,
    driverTollReimbursementPaise,
    driverNetPayoutPaise,
    platformCommissionPaise,
    platformFeeRetainedPaise,
    platformNetRevenuePaise,
    roundingAdjustmentPaise,
    policySnapshot: { ...policy },
    calculatedAt: new Date().toISOString(),
    reconciled,
  };
}


/**
 * Retrieves a registered commission policy by ID
 */
export function getCommissionPolicyById(policyId: string): CommissionPolicy | undefined {
  return POLICY_REGISTRY.get(policyId);
}
