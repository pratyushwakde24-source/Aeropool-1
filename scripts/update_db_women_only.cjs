const fs = require('fs');
let code = fs.readFileSync('src/services/db.ts', 'utf8');

// 1. Add import for womenOnlyService and RideType
if (!code.includes("import { womenOnlyService }")) {
  code = code.replace(
    "import { PRICING_CONSTANTS } from './pricingEngine';",
    "import { PRICING_CONSTANTS } from './pricingEngine';\r\nimport { womenOnlyService } from './womenOnlyService';\r\nimport { RideType } from '../types';"
  );
}

// 2. Update bookRideAtomic signature
code = code.replace(
  "    razorpayOrderId?: string;\r\n    idempotencyKey?: string;\r\n  }): { success: boolean; booking?: Booking; error?: string } {",
  "    razorpayOrderId?: string;\r\n    idempotencyKey?: string;\r\n    rideType?: RideType;\r\n    isWomenOnlyEligible?: boolean;\r\n  }): { success: boolean; booking?: Booking; error?: string } {"
);

// 3. Insert Women-Only Integrity Check in bookRideAtomic right after pool status check
const poolStatusCheck = "    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED') {\r\n      return { success: false, error: 'This pool is no longer accepting passengers.' };\r\n    }";

const womenOnlyBookCheck = `    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED') {\r\n      return { success: false, error: 'This pool is no longer accepting passengers.' };\r\n    }\r\n\r\n    // Strict Women-Only Pool Integrity Verification\r\n    const isPoolWomenOnly = Boolean(pool.isWomenOnlyPool || pool.poolCategory === 'WOMEN_ONLY_POOL');\r\n    const requestedRideType = params.rideType;\r\n\r\n    if (isPoolWomenOnly) {\r\n      const isEligible = Boolean(\r\n        params.isWomenOnlyEligible ||\r\n        womenOnlyService.isPassengerEligible(params.passengerId)\r\n      );\r\n      if (!isEligible) {\r\n        return {\r\n          success: false,\r\n          error: 'Women-Only Pool restriction: Only verified women passengers can book seats in this pool.',\r\n        };\r\n      }\r\n\r\n      // Double-check all existing passengers to ensure no ineligible co-passenger exists\r\n      const hasIneligible = pool.passengers.some((p) => p.isWomenOnlyEligible === false);\r\n      if (hasIneligible) {\r\n        return {\r\n          success: false,\r\n          error: 'Integrity violation: Ineligible passenger detected in Women-Only Pool. Booking transaction aborted.',\r\n        };\r\n      }\r\n    } else {\r\n      if (requestedRideType === 'WOMEN_ONLY_POOL') {\r\n        return {\r\n          success: false,\r\n          error: 'Downgrade prohibited: Cannot place Women-Only ride booking into a standard mixed-gender pool.',\r\n        };\r\n      }\r\n    }`;

code = code.replace(poolStatusCheck, womenOnlyBookCheck);

// 4. Update passenger push in bookRideAtomic
code = code.replace(
  "      farePaidPaise: params.farePaise,\r\n      pickupOtp,\r\n      status: 'CONFIRMED',\r\n    });",
  "      farePaidPaise: params.farePaise,\r\n      pickupOtp,\r\n      status: 'CONFIRMED',\r\n      isWomenOnlyEligible: isPoolWomenOnly ? true : Boolean(params.isWomenOnlyEligible),\r\n    });"
);

// 5. Update newBooking in bookRideAtomic
code = code.replace(
  "      operatingMode: mode,\r\n      idempotencyKey: params.idempotencyKey || `idem-${bookingId}`,\r\n      createdAt: new Date().toISOString(),\r\n    };",
  "      operatingMode: mode,\r\n      idempotencyKey: params.idempotencyKey || `idem-${bookingId}`,\r\n      rideType: requestedRideType || (isPoolWomenOnly ? 'WOMEN_ONLY_POOL' : 'SHARED_POOL'),\r\n      isWomenOnlyPool: isPoolWomenOnly,\r\n      createdAt: new Date().toISOString(),\r\n    };"
);

// 6. Update bookRideAtomicAsync signature
code = code.replace(
  "    razorpayOrderId?: string;\r\n    idempotencyKey?: string;\r\n  }): Promise<{ success: boolean; booking?: Booking; error?: string }> {",
  "    razorpayOrderId?: string;\r\n    idempotencyKey?: string;\r\n    rideType?: RideType;\r\n    isWomenOnlyEligible?: boolean;\r\n  }): Promise<{ success: boolean; booking?: Booking; error?: string }> {"
);

// 7. Update createPoolAndBookAtomic signature
code = code.replace(
  "    rideType: 'SHARED_POOL' | 'PRIVATE';\r\n    paymentMethod: 'UPI' | 'Card' | 'Netbanking';",
  "    rideType: RideType;\r\n    isWomenOnlyEligible?: boolean;\r\n    paymentMethod: 'UPI' | 'Card' | 'Netbanking';"
);

// 8. Update createPoolAndBookAtomicAsync signature
code = code.replace(
  "    rideType: 'SHARED_POOL' | 'PRIVATE';\r\n    paymentMethod: 'UPI' | 'Card' | 'Netbanking';",
  "    rideType: RideType;\r\n    isWomenOnlyEligible?: boolean;\r\n    paymentMethod: 'UPI' | 'Card' | 'Netbanking';"
);

// 9. Add Women-Only check and pool creation fields in createPoolAndBookAtomic
const createPoolStart = "    const poolId = `pool-${Date.now()}-${Math.floor(Math.random() * 1000)}`;";
const createPoolCheck = `    if (params.rideType === 'WOMEN_ONLY_POOL') {
      const isEligible = Boolean(
        params.isWomenOnlyEligible ||
        womenOnlyService.isPassengerEligible(params.passengerId)
      );
      if (!isEligible) {
        return {
          success: false,
          error: 'Women-Only Pool restriction: Only verified women passengers can initiate a Women-Only pool.',
        };
      }
    }

    const poolId = \`pool-\${Date.now()}-\${Math.floor(Math.random() * 1000)}\`;`;

code = code.replace(createPoolStart, createPoolCheck);

// 10. Update newPool object in createPoolAndBookAtomic
code = code.replace(
  "      vehicleCategory: totalSeats > 4 ? 'XL' : 'Sedan',",
  "      vehicleCategory: totalSeats > 4 ? 'XL' : 'Sedan',\r\n      isWomenOnlyPool: params.rideType === 'WOMEN_ONLY_POOL',\r\n      poolCategory: params.rideType,"
);

// 11. Update initial passenger in createPoolAndBookAtomic
code = code.replace(
  "      farePaidPaise: params.farePaise,\r\n      pickupOtp,\r\n      status: 'CONFIRMED',\r\n    };\r\n\r\n    newPool.passengers.push(initialPassenger);",
  "      farePaidPaise: params.farePaise,\r\n      pickupOtp,\r\n      status: 'CONFIRMED',\r\n      isWomenOnlyEligible: params.rideType === 'WOMEN_ONLY_POOL' ? true : Boolean(params.isWomenOnlyEligible),\r\n    };\r\n\r\n    newPool.passengers.push(initialPassenger);"
);

// 12. Update booking in createPoolAndBookAtomic
code = code.replace(
  "      idempotencyKey: params.idempotencyKey || `idem-${bookingId}`,\r\n      createdAt: new Date().toISOString(),\r\n    };",
  "      idempotencyKey: params.idempotencyKey || `idem-${bookingId}`,\r\n      rideType: params.rideType,\r\n      isWomenOnlyPool: params.rideType === 'WOMEN_ONLY_POOL',\r\n      createdAt: new Date().toISOString(),\r\n    };"
);

fs.writeFileSync('src/services/db.ts', code, 'utf8');
console.log('src/services/db.ts updated successfully with Women-Only atomic protections.');
