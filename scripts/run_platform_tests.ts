import 'dotenv/config';
import { runAllAeroPoolTests } from '../src/tests/testSuite';

async function main() {
  console.log('--- STARTING PLATFORM REGRESSION TESTS ---');
  const start = performance.now();
  const results = await runAllAeroPoolTests();
  const dur = (performance.now() - start).toFixed(0);
  let passed = 0;
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.passed) passed++;
    else {
      failed++;
      console.log(`FAIL [${i+1}]: ${r.name} -> ${r.message}`);
    }
  }
  console.log(`--- PLATFORM REGRESSION SUMMARY: ${passed}/${results.length} PASSED, ${failed} FAILED (${dur}ms) ---`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal platform test error:', err);
  process.exit(1);
});
