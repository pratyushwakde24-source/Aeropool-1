import 'dotenv/config';
import { runAllAeroPoolTests } from './testSuite';
import { runWomenOnlyPoolTests } from './womenOnlyPoolTestSuite';

async function main() {
  console.log('\n============================================================');
  console.log('🚀 Running AeroPool Platform Architecture & Security Tests');
  console.log('============================================================\n');

  const start = performance.now();
  const baseResults = await runAllAeroPoolTests();
  const womenResults = await runWomenOnlyPoolTests();
  const results = [...baseResults, ...womenResults];
  const totalDuration = (performance.now() - start).toFixed(1);

  let passedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const prefix = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${(i + 1).toString().padStart(2, ' ')}. [${prefix}] [${r.category.padEnd(12, ' ')}] ${r.name} (${r.durationMs}ms)`);
    console.log(`    ↳ ${r.message}\n`);
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('============================================================');
  console.log(`Execution Summary: ${results.length} total tests | ${passedCount} passed | ${failedCount} failed | ${totalDuration}ms`);
  console.log(`Pass Rate: ${Math.round((passedCount / results.length) * 100)}%`);
  console.log('============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test runner exception:', err);
  process.exit(1);
});
