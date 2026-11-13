const fs = require('fs');
let code = fs.readFileSync('src/services/pricingEngine.ts', 'utf8');
code = code.replace(
  "import { FareQuote, DestinationPoint } from '../types';",
  "import { FareQuote, DestinationPoint, RideType } from '../types';"
);
code = code.replace(
  "rideType: 'SHARED_POOL' | 'PRIVATE' = 'SHARED_POOL',",
  "rideType: RideType = 'SHARED_POOL',"
);
fs.writeFileSync('src/services/pricingEngine.ts', code, 'utf8');
console.log('pricingEngine.ts updated successfully');
