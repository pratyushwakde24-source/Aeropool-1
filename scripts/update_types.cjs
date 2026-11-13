const fs = require('fs');
let code = fs.readFileSync('src/types/index.ts', 'utf8');

// 1. Add RideType
if (!code.includes('export type RideType =')) {
  code = code.replace(
    'export type PaymentStatus =',
    "export type RideType = 'SHARED_POOL' | 'PRIVATE' | 'WOMEN_ONLY_POOL';\r\n\r\nexport type PaymentStatus ="
  );
}

// 2. UserProfile additions
if (!code.includes('isWomenOnlyEligible?: boolean;')) {
  code = code.replace(
    '  createdAt: string;\r\n}',
    "  createdAt: string;\r\n  genderSelfIdentified?: 'female' | 'male' | 'non_binary' | 'prefer_not_to_say';\r\n  isWomenOnlyEligible?: boolean;\r\n  womenOnlyVerificationStatus?: 'none' | 'pending' | 'verified' | 'rejected';\r\n  womenOnlyVerifiedAt?: string;\r\n}"
  );
}

// 3. RideRequest
code = code.replace(
  "  rideType: 'SHARED_POOL' | 'PRIVATE';",
  "  rideType: RideType;\r\n  isWomenOnlyEligible?: boolean;"
);

// 4. PoolPassenger
code = code.replace(
  "  status: 'CONFIRMED' | 'BOARDED' | 'DROPPED_OFF' | 'CANCELLED';\r\n}",
  "  status: 'CONFIRMED' | 'BOARDED' | 'DROPPED_OFF' | 'CANCELLED';\r\n  isWomenOnlyEligible?: boolean;\r\n}"
);

// 5. RidePool
code = code.replace(
  '  passengers: PoolPassenger[];',
  '  isWomenOnlyPool?: boolean;\r\n  poolCategory?: RideType;\r\n  passengers: PoolPassenger[];'
);

// 6. Booking
code = code.replace(
  "  operatingMode?: 'development' | 'sandbox' | 'production';",
  "  rideType?: RideType;\r\n  isWomenOnlyPool?: boolean;\r\n  operatingMode?: 'development' | 'sandbox' | 'production';"
);

// 7. Add config and verification record interfaces at the end
if (!code.includes('WomenOnlyPoolConfig')) {
  code += `\r\n
export interface WomenOnlyPoolConfig {
  enabled: boolean;
  nighttimeStartHour: number; // e.g. 20 (8:00 PM)
  nighttimeEndHour: number;   // e.g. 6 (6:00 AM)
  timezone: string;          // e.g. 'Asia/Kolkata'
  eligibleAirports: string[]; // e.g. ['BOM']
  eligiblePickupZones: string[];
  allowDaytimeBooking: boolean;
  requireOptInVerification: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface WomenOnlyVerificationRecord {
  id: string;
  passengerId: string;
  passengerName: string;
  passengerPhone: string;
  status: 'pending' | 'verified' | 'rejected';
  optInTimestamp: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  selfDeclarationConfirmed: boolean;
}
`;
}

fs.writeFileSync('src/types/index.ts', code, 'utf8');
console.log('src/types/index.ts updated successfully.');
