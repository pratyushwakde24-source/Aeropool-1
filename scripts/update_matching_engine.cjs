const fs = require('fs');
let code = fs.readFileSync('src/services/matchingEngine.ts', 'utf8');

// 1. Update imports
if (!code.includes("import { womenOnlyService }")) {
  code = code.replace(
    "import { calculateRideFare } from './pricingEngine';",
    "import { calculateRideFare } from './pricingEngine';\r\nimport { womenOnlyService } from './womenOnlyService';\r\nimport { RideType } from '../types';"
  );
}

// 2. Update evaluatePoolMatches signature
code = code.replace(
  "    maxWaitMinutes: number;\r\n    readyTimeIso: string;\r\n  },",
  "    maxWaitMinutes: number;\r\n    readyTimeIso: string;\r\n    rideType?: RideType;\r\n    isWomenOnlyEligible?: boolean;\r\n    passengerId?: string;\r\n  },"
);

// 3. Insert Category Isolation Check right after hard capacity/status check (line ~75)
const statusCheck = "    // 3. Pool must not be completed or cancelled\r\n    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED' || pool.status === 'IN_PROGRESS') {\r\n      continue;\r\n    }";

const categoryCheck = `    // 3. Pool must not be completed or cancelled\r\n    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED' || pool.status === 'IN_PROGRESS') {\r\n      continue;\r\n    }\r\n\r\n    // 4. Strict Ride Category Isolation (Women-Only Pool vs Shared Pool)\r\n    const requestedType = request.rideType || 'SHARED_POOL';\r\n    const isPoolWomenOnly = Boolean(pool.isWomenOnlyPool || pool.poolCategory === 'WOMEN_ONLY_POOL');\r\n\r\n    if (requestedType === 'WOMEN_ONLY_POOL') {\r\n      // Pool MUST be a dedicated Women-Only pool\r\n      if (!isPoolWomenOnly) {\r\n        continue;\r\n      }\r\n      // Passenger MUST be eligible\r\n      const isEligible = Boolean(\r\n        request.isWomenOnlyEligible ||\r\n        (request.passengerId && womenOnlyService.isPassengerEligible(request.passengerId))\r\n      );\r\n      if (!isEligible) {\r\n        continue;\r\n      }\r\n      // Every existing passenger in the pool MUST be verified eligible\r\n      const hasIneligible = pool.passengers.some((p) => p.isWomenOnlyEligible === false);\r\n      if (hasIneligible) {\r\n        continue;\r\n      }\r\n    } else {\r\n      // Standard pools MUST NOT match into Women-Only pools\r\n      if (isPoolWomenOnly) {\r\n        continue;\r\n      }\r\n    }`;

code = code.replace(statusCheck, categoryCheck);

// 4. Update fareQuote calculation
code = code.replace(
  "    // Dynamic Fare Quote for this specific pool match\r\n    const fareQuote = calculateRideFare(\r\n      request.destination,\r\n      request.seatsNeeded,\r\n      'SHARED_POOL',\r\n      pool.passengers.length + 1\r\n    );",
  "    // Dynamic Fare Quote for this specific pool match\r\n    const fareQuote = calculateRideFare(\r\n      request.destination,\r\n      request.seatsNeeded,\r\n      requestedType,\r\n      pool.passengers.length + 1\r\n    );"
);

fs.writeFileSync('src/services/matchingEngine.ts', code, 'utf8');
console.log('matchingEngine.ts updated successfully');
