import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'src/tests/testSuite.ts');
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  "actorRole: 'driver',",
  "actorRole: 'driver',\n      source: 'REAL_GPS' as const,"
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Added source: REAL_GPS to Test 118');
