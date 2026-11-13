import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'src/tests/testSuite.ts');
let content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split(/\r?\n/);
console.log('Total lines:', lines.length);

// Fix duplicate at line ~3311
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("source: 'REAL_GPS' as const")) {
    console.log('Found duplicate at line', i + 1, ':', lines[i]);
    lines.splice(i, 1);
    break;
  }
}

// Fix Test 118
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('// 118. Zero GPS Disruption')) {
    console.log('Found Test 118 at line', i + 1);
    for (let j = i; j < i + 25; j++) {
      if (lines[j].includes("actorRole: 'driver',") && !lines[j + 1]?.includes('source:')) {
        lines.splice(j + 1, 0, "      source: 'REAL_GPS',");
        console.log('Added source at line', j + 2);
        break;
      }
    }
    break;
  }
}

fs.writeFileSync(filePath, lines.join('\r\n'), 'utf-8');
console.log('Fixed successfully!');

