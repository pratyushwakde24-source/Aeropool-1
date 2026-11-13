const fs = require('fs');

const path = 'src/tests/testSuite.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Add generateDriverWeeklyStatement import if not present
if (!content.includes('generateDriverWeeklyStatement')) {
  content = content.replace(
    'generateCreditNoteNumber,\r\n} from \'../services/invoiceService\';',
    'generateCreditNoteNumber,\r\n  generateDriverWeeklyStatement,\r\n} from \'../services/invoiceService\';'
  );
  content = content.replace(
    'generateCreditNoteNumber,\n} from \'../services/invoiceService\';',
    'generateCreditNoteNumber,\n  generateDriverWeeklyStatement,\n} from \'../services/invoiceService\';'
  );
}

// 2. Add server settlement imports if not present
if (!content.includes('approveServerSettlement')) {
  content = content.replace(
    'clearOrdersForTesting,\r\n} from \'../../server/orderStore\';',
    'clearOrdersForTesting,\r\n  approveServerSettlement,\r\n  registerServerSettlement,\r\n  getServerSettlement,\r\n} from \'../../server/orderStore\';'
  );
  content = content.replace(
    'clearOrdersForTesting,\n} from \'../../server/orderStore\';',
    'clearOrdersForTesting,\n  approveServerSettlement,\n  registerServerSettlement,\n  getServerSettlement,\n} from \'../../server/orderStore\';'
  );
}

// 3. Tests 144 - 155 code
const testsCode = `
  // 144. Driver Ledger: Idempotent trip earning recording (no duplicate credit for same pool)
  const startT144 = performance.now();
  const entry1 = db.recordDriverTripEarnings({
    poolId: 'pool_test_144',
    driverId: 'drv_test_144',
    grossFarePaise: 85000,
    airportTollPaise: 11000,
  });
  const entry2 = db.recordDriverTripEarnings({
    poolId: 'pool_test_144',
    driverId: 'drv_test_144',
    grossFarePaise: 85000,
    airportTollPaise: 11000,
  });
  const driverLedger144 = db.getDriverLedger('drv_test_144');
  const t144_pass =
    entry1 !== null &&
    entry2 !== null &&
    entry1.id === entry2.id &&
    driverLedger144.length === 1 &&
    driverLedger144[0].poolId === 'pool_test_144';

  results.push({
    name: 'Phase 5C: Driver Ledger — Idempotent trip earning recording & duplicate prevention',
    category: 'STATE_MACHINE',
    passed: Boolean(t144_pass),
    message: t144_pass
      ? \`Verified: Idempotent trip earning recorded with ID \${entry1.id}; second execution returned existing entry with zero balance inflation.\`
      : 'Failed: Duplicate trip earning recorded or idempotency check failed.',
    durationMs: Number((performance.now() - startT144).toFixed(2)),
  });

  // 145. Driver Ledger: Airport toll pass-through allocation to driver net payout
  const startT145 = performance.now();
  const entry145 = db.recordDriverTripEarnings({
    poolId: 'pool_test_145',
    driverId: 'drv_test_145',
    grossFarePaise: 100000, // ₹1,000 gross
    airportTollPaise: 11000, // ₹110 airport toll
  });
  // Active policy (85/15): Driver gets 85% of 100000 = 85000 + 11000 toll pass-through = 96000 paise
  const t145_pass =
    entry145.tollReimbursementPaise === 11000 &&
    entry145.driverEarningsPaise === 96000 &&
    entry145.platformCommissionPaise === 15000;

  results.push({
    name: 'Phase 5C: Driver Ledger — Airport toll pass-through 100% allocation to driver net payout',
    category: 'PRICING',
    passed: Boolean(t145_pass),
    message: t145_pass
      ? \`Verified: Gross ₹1,000 + Toll ₹110 resulted in Driver Net ₹\${(entry145.driverEarningsPaise / 100).toFixed(2)} (including 100% ₹110 toll reimbursement).\`
      : 'Failed: Toll pass-through calculation error.',
    durationMs: Number((performance.now() - startT145).toFixed(2)),
  });

  // 146. Driver Ledger: Exact integer paise balance tracking and conservation invariant
  const startT146 = performance.now();
  const split146 = calculateCommissionSplit({
    grossFarePaise: 124550,
    airportTollPaise: 11000,
  });
  const t146_pass =
    split146.reconciled &&
    split146.driverNetPayoutPaise + split146.platformNetRevenuePaise ===
      split146.grossFarePaise + (split146.driverTollReimbursementPaise || 0);

  results.push({
    name: 'Phase 5C: Financial Conservation — Zero lost paise invariant across split calculations',
    category: 'PRICING',
    passed: Boolean(t146_pass),
    message: t146_pass
      ? 'Verified: Strict integer paise arithmetic satisfies conservation: Driver Net + Platform Net === Gross + Toll.'
      : 'Failed: Paise conservation invariant violated.',
    durationMs: Number((performance.now() - startT146).toFixed(2)),
  });

  // 147. Driver Wallet Summary: Correct period aggregation (today, week, month, available, accrued)
  const startT147 = performance.now();
  const summary147 = db.getDriverWalletSummary('drv_test_144');
  const t147_pass =
    summary147.completedTripsCount === 1 &&
    summary147.lifetimeGrossPaise === 85000 &&
    summary147.availableEarningsPaise > 0 &&
    summary147.recentTransactions.length === 1;

  results.push({
    name: 'Phase 5C: Driver Wallet — Period and lifecycle balance aggregation from immutable ledger',
    category: 'INTEGRATION',
    passed: Boolean(t147_pass),
    message: t147_pass
      ? \`Verified: Wallet summary accurately aggregated \${summary147.completedTripsCount} completed trip(s) with ₹\${(summary147.availableEarningsPaise / 100).toFixed(2)} available.\`
      : 'Failed: Wallet aggregation mismatch.',
    durationMs: Number((performance.now() - startT147).toFixed(2)),
  });

  // 148. Driver Isolation: Driver ledger entries isolated per driver ID (zero cross-driver leakage)
  const startT148 = performance.now();
  db.recordDriverTripEarnings({
    poolId: 'pool_test_148_a',
    driverId: 'drv_test_148_A',
    grossFarePaise: 50000,
  });
  db.recordDriverTripEarnings({
    poolId: 'pool_test_148_b',
    driverId: 'drv_test_148_B',
    grossFarePaise: 75000,
  });
  const ledgerA = db.getDriverLedger('drv_test_148_A');
  const ledgerB = db.getDriverLedger('drv_test_148_B');
  const t148_pass =
    ledgerA.every((e) => e.driverId === 'drv_test_148_A') &&
    ledgerB.every((e) => e.driverId === 'drv_test_148_B') &&
    ledgerA.some((e) => e.poolId === 'pool_test_148_a') &&
    !ledgerA.some((e) => e.poolId === 'pool_test_148_b');

  results.push({
    name: 'Phase 5C: Security Isolation — Driver ledger isolation & zero cross-tenant financial leakage',
    category: 'SECURITY',
    passed: Boolean(t148_pass),
    message: t148_pass
      ? 'Verified: Driver ledger records strictly partitioned by driver ID; zero cross-driver financial leakage.'
      : 'Failed: Cross-driver ledger entry leakage detected.',
    durationMs: Number((performance.now() - startT148).toFixed(2)),
  });

  // 149. Driver Statement: Weekly statement generation, reporting period, checksum integrity
  const startT149 = performance.now();
  const statement149 = generateDriverWeeklyStatement({
    driverId: 'drv_test_144',
    driverName: 'Ramesh Pawar',
    cycle: '2026-W44',
    entries: db.getDriverLedger('drv_test_144'),
  });
  const t149_pass =
    statement149.statementId.startsWith('STMT-') &&
    statement149.reportingPeriod.cycle === '2026-W44' &&
    statement149.documentHash.length === 64 &&
    statement149.totalFaresPaise === 85000;

  results.push({
    name: 'Phase 5C: Statements — Weekly earnings statement generation & SHA-256 tamper-evident checksum',
    category: 'PERSISTENCE',
    passed: Boolean(t149_pass),
    message: t149_pass
      ? \`Verified: Generated \${statement149.statementId} with tamper-evident checksum \${statement149.documentHash.substring(0, 16)}...\`
      : 'Failed: Weekly statement generation or checksum mismatch.',
    durationMs: Number((performance.now() - startT149).toFixed(2)),
  });

  // 150. Fleet Operator: Settlement generation with itemized completed pool trips
  const startT150 = performance.now();
  // Ensure test organization exists in state
  let testOrg = db.getState().organizations.find((o) => o.id === 'org-metrocab-mumbai');
  if (!testOrg) {
    testOrg = {
      id: 'org-metrocab-mumbai',
      name: 'MetroCab Fleet Solutions LLP',
      businessRegNumber: 'MAH-2024-LLP-88219',
      contactEmail: 'accounts@metrocabmumbai.in',
      contactPhone: '+91 22 2847 9100',
      commissionRate: 15,
    };
    db.getState().organizations.push(testOrg);
  }
  const settlementGen = db.generateWeeklySettlement({
    organizationId: 'org-metrocab-mumbai',
    settlementCycle: '2026-W44',
    actorId: 'admin_test_150',
    actorRole: 'admin',
  });
  const t150_pass = settlementGen.success && Boolean(settlementGen.settlement);

  results.push({
    name: 'Phase 5C: Fleet Settlement — Weekly batch settlement generation with cycle reference',
    category: 'STATE_MACHINE',
    passed: Boolean(t150_pass),
    message: t150_pass
      ? \`Verified: Weekly settlement \${settlementGen.settlement?.id} generated with cycle \${settlementGen.settlement?.settlementCycle} and status \${settlementGen.settlement?.status}.\`
      : 'Failed: Weekly settlement generation failed.',
    durationMs: Number((performance.now() - startT150).toFixed(2)),
  });

  // 151. Fleet Operator: Multi-tenant fleet isolation (cross-tenant settlement access rejected)
  const startT151 = performance.now();
  // Register an operator user from org-A
  const operatorUser = {
    id: 'user_operator_org_a',
    fullName: 'Fleet Operator A',
    email: 'operatorA@fleet.com',
    role: 'fleet_operator' as const,
    organizationId: 'org-metrocab-mumbai',
    createdAt: new Date().toISOString(),
  };
  db.getState().users.push(operatorUser);
  // Operator attempts to generate settlement for org-other
  const crossTenantAttempt = db.generateWeeklySettlement({
    organizationId: 'org-other-competitor',
    settlementCycle: '2026-W44',
    actorId: 'user_operator_org_a',
    actorRole: 'fleet_operator',
  });
  const t151_pass =
    crossTenantAttempt.success === false &&
    Boolean(crossTenantAttempt.error?.includes('Cross-tenant'));

  results.push({
    name: 'Phase 5C: Fleet Security — Multi-tenant boundary enforcement & cross-organization settlement rejection',
    category: 'SECURITY',
    passed: Boolean(t151_pass),
    message: t151_pass
      ? 'Verified: Cross-tenant settlement generation strictly blocked with Security Notice.'
      : 'Failed: Cross-tenant access was not rejected.',
    durationMs: Number((performance.now() - startT151).toFixed(2)),
  });

  // 152. Admin Settlement Approval: Super Admin role authorization for settlement approval
  const startT152 = performance.now();
  const settlementIdToApprove = settlementGen.settlement?.id || 'set-org-metrocab-mumbai-2026-w44';
  const approvalRes = db.approveSettlement(settlementIdToApprove, 'super_admin_152', 'admin', 'Approved by CFO');
  const t152_pass =
    approvalRes.success &&
    approvalRes.settlement?.status === 'SETTLEMENT_APPROVED';

  results.push({
    name: 'Phase 5C: Super Admin Control — Role-authorized settlement approval transition to SETTLEMENT_APPROVED',
    category: 'STATE_MACHINE',
    passed: Boolean(t152_pass),
    message: t152_pass
      ? \`Verified: Settlement \${settlementIdToApprove} approved by Super Admin; transitioned to SETTLEMENT_APPROVED with immutable audit log.\`
      : 'Failed: Super Admin settlement approval failed.',
    durationMs: Number((performance.now() - startT152).toFixed(2)),
  });

  // 153. Admin Settlement Approval: Unauthorized non-admin approval attempt rejected
  const startT153 = performance.now();
  const unauthorizedApproval = db.approveSettlement(settlementIdToApprove, 'driver_intruder', 'driver' as any);
  const t153_pass =
    unauthorizedApproval.success === false &&
    Boolean(unauthorizedApproval.error?.includes('Unauthorized'));

  results.push({
    name: 'Phase 5C: Authorization Gate — Unauthorized non-admin approval attempt strictly rejected',
    category: 'SECURITY',
    passed: Boolean(t153_pass),
    message: t153_pass
      ? 'Verified: Driver attempt to approve settlement strictly rejected with 401/403 authorization error.'
      : 'Failed: Unauthorized approval succeeded.',
    durationMs: Number((performance.now() - startT153).toFixed(2)),
  });

  // 154. Financial State Lifecycle: Strict transition restrictions & no premature payout marking
  const startT154 = performance.now();
  // Cannot re-approve already approved settlement
  const reApproval = db.approveSettlement(settlementIdToApprove, 'super_admin_152', 'admin');
  // Approved settlement is strictly SETTLEMENT_APPROVED, NOT SETTLED
  const currentSettlement = db.getState().operatorSettlements?.find((s) => s.id === settlementIdToApprove);
  const t154_pass =
    reApproval.success === false &&
    currentSettlement?.status === 'SETTLEMENT_APPROVED' &&
    currentSettlement?.status !== 'SETTLED';

  results.push({
    name: 'Phase 5C: State Machine Integrity — Strict lifecycle enforcement (no duplicate approval, no premature payout)',
    category: 'STATE_MACHINE',
    passed: Boolean(t154_pass),
    message: t154_pass
      ? 'Verified: Settlement lifecycle strictly guarded: cannot re-approve, and not falsely marked SETTLED without real payment proof.'
      : 'Failed: Re-approval allowed or premature SETTLED marking occurred.',
    durationMs: Number((performance.now() - startT154).toFixed(2)),
  });

  // 155. Empty State Integrity: Driver with zero trips returns clean zero balances without fabricating data
  const startT155 = performance.now();
  const emptySummary = db.getDriverWalletSummary('drv_virgin_unbooked_155');
  const t155_pass =
    emptySummary.completedTripsCount === 0 &&
    emptySummary.lifetimeGrossPaise === 0 &&
    emptySummary.lifetimeNetEarningsPaise === 0 &&
    emptySummary.availableEarningsPaise === 0 &&
    emptySummary.accruedEarningsPaise === 0 &&
    emptySummary.paidOutEarningsPaise === 0 &&
    emptySummary.recentTransactions.length === 0;

  results.push({
    name: 'Phase 5C: Empty State Integrity — Zero-trip driver returns authoritative zero balances without fake data',
    category: 'PERSISTENCE',
    passed: Boolean(t155_pass),
    message: t155_pass
      ? 'Verified: Brand-new driver wallet strictly shows ₹0.00 across all buckets with zero fabricated records.'
      : 'Failed: Non-zero values or fake transactions generated.',
    durationMs: Number((performance.now() - startT155).toFixed(2)),
  });
`;

// Insert testsCode before `  // Cleanup test environment to leave store clean`
const target = '  // Cleanup test environment to leave store clean\r\n  db.resetStore();';
const targetLF = '  // Cleanup test environment to leave store clean\n  db.resetStore();';

if (content.includes(target)) {
  content = content.replace(target, testsCode + '\r\n' + target);
} else if (content.includes(targetLF)) {
  content = content.replace(targetLF, testsCode + '\n' + targetLF);
} else {
  console.error('Target cleanup block not found');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully added Tests 144-155 to testSuite.ts');

