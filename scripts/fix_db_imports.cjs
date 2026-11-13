const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf8');
code = code.replace(
  '  RefundLifecycleStatus,',
  '  RefundLifecycleStatus,\r\n  RideType,'
);
code = code.replace(
  "import { calculateCommissionSplit } from './commissionEngine';",
  "import { calculateCommissionSplit } from './commissionEngine';\r\nimport { womenOnlyService } from './womenOnlyService';"
);
fs.writeFileSync('src/services/db.ts', code, 'utf8');
console.log('Imports added successfully');
