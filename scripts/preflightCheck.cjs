const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

console.log('================================================================');
console.log('AEROPOOL PHASE 6G: MANDATORY PRE-FLIGHT SAFETY GATE VERIFICATION');
console.log('================================================================');

// 1. Linked project verification
const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
console.log('Target Project Reference:', ref);
if (ref !== 'rkuzkwggijthbqwlwnps') {
  console.error('CRITICAL ABORT: Target project ref does not match rkuzkwggijthbqwlwnps');
  process.exit(1);
}
if (ref === 'krxkxhieyqcytknixqdm') {
  console.error('CRITICAL ABORT: Protected baseline referenced!');
  process.exit(1);
}
console.log('Target Ref Status: EXACT MATCH rkuzkwggijthbqwlwnps (aeropool-staging)');

// 2. Migration hash verification against Phase 6F baseline
const expectedHashes = {
  '20261103000000_refunds_and_financial_ledger.sql': '715AEE752D12F068EAB8E1B7E5DA7A3F93B3A708D289CAC0DC325CC7209B3972',
  '20261103000001_driver_wallet_and_ledger.sql': 'BEE924EB5543B113A58706E7A63848E7733F1401BDB25AB502932344414178D2',
  '20261103000002_financial_webhooks_notifications_reconciliation.sql': 'B0AD3A9A7E3B65C5935ADA7FF06064D29CEDB3A87D78B2A17A4B432508ED5C99',
  '20261103000003_production_performance_and_indexes.sql': '4F0FE8F05A544B39A5355D9BDF581F8B29E61576DDF91D0B06C70AEF1600CDA7'
};

for (const [file, expectedHash] of Object.entries(expectedHashes)) {
  const filePath = path.join('supabase/migrations', file);
  const content = fs.readFileSync(filePath);
  const actualHash = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
  if (actualHash !== expectedHash) {
    console.error(`ABORT: Hash mismatch for ${file}! Expected ${expectedHash}, got ${actualHash}`);
    process.exit(1);
  }
  console.log(`Hash OK: ${file} -> ${actualHash}`);
}

// 3. Environment & Operating Mode Verification
const env = dotenv.parse(fs.readFileSync('.env', 'utf8'));
if (env.VITE_OPERATING_MODE !== 'sandbox') {
  console.error('ABORT: VITE_OPERATING_MODE is not sandbox');
  process.exit(1);
}
console.log('Operating Mode: sandbox (VERIFIED)');

if (!env.VITE_RAZORPAY_KEY_ID || !env.VITE_RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
  console.error('ABORT: Razorpay key is not in test mode');
  process.exit(1);
}
console.log('Razorpay Key Mode: TEST MODE (rzp_test_*) (VERIFIED)');

// 4. Commission Policy Verification
const commEngine = fs.readFileSync('src/services/commissionEngine.ts', 'utf8');
if (!commEngine.includes('COMM_POL_80_20_V1') || !commEngine.includes("status: 'ACTIVE'")) {
  console.error('ABORT: Active commission policy is not 80/20');
  process.exit(1);
}
console.log('Active Commission Policy: COMM_POL_80_20_V1 (80/20) ACTIVE (VERIFIED)');

if (!commEngine.includes('COMM_POL_85_15_PROPOSED') || !commEngine.includes("status: 'PROPOSED_PENDING_APPROVAL'")) {
  console.error('ABORT: Proposed 85/15 policy is not inactive');
  process.exit(1);
}
console.log('Proposed Commission Policy: COMM_POL_85_15_PROPOSED INACTIVE / PENDING APPROVAL (VERIFIED)');

console.log('================================================================');
console.log('ALL PRE-FLIGHT SAFETY GATES PASSED — PROCEEDING TO MIGRATION 1');
console.log('================================================================');

