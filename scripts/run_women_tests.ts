import { runWomenOnlyPoolTests } from '../src/tests/womenOnlyPoolTestSuite';

async function main() {
  console.log('--- STARTING WOMEN-ONLY POOL TESTS ---');
  const results = await runWomenOnlyPoolTests();
  let passed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`Test ${i + 1}: [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`);
    console.log(`  Message: ${r.message} (${r.durationMs}ms)`);
    if (r.passed) passed++;
  }
  console.log(`--- SUMMARY: ${passed}/${results.length} PASSED ---`);
  if (passed < results.length) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error in tests:', e);
  process.exit(1);
});
