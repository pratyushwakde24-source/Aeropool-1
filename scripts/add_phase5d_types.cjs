const fs = require('fs');

const path = 'src/types/index.ts';
let content = fs.readFileSync(path, 'utf8');

const typesToAdd = `
export type RefundLifecycleStatus = 'REQUESTED' | 'SUBMITTED' | 'PROCESSED' | 'FAILED';

export type ReconciliationDiscrepancyType =
  | 'ORPHAN_PROVIDER_CAPTURE'
  | 'INTERNAL_CAPTURE_WITHOUT_PROVIDER'
  | 'DUPLICATE_PAYMENT_REFERENCE'
  | 'REFUND_OVERRUN'
  | 'MISSING_DRIVER_LEDGER_ENTRY'
  | 'DUPLICATE_DRIVER_LEDGER_ENTRY'
  | 'UNVERIFIED_SETTLEMENT_PAYOUT';

export interface ReconciliationDiscrepancy {
  id: string;
  type: ReconciliationDiscrepancyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  entityId: string;
  description: string;
  expectedValue: string;
  actualValue: string;
  discrepancyPaise?: number;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export type FinancialExportType = 'TRANSACTIONS' | 'REFUNDS' | 'DRIVER_LEDGER' | 'SETTLEMENTS' | 'RECONCILIATION';
`;

if (!content.includes('ReconciliationDiscrepancy')) {
  content += '\r\n' + typesToAdd.trim() + '\r\n';
  fs.writeFileSync(path, content, 'utf8');
  console.log('Successfully added Phase 5D types to src/types/index.ts');
} else {
  console.log('Types already exist');
}

