import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'src/tests/testSuite.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Remove duplicate on line 3311
const dupTarget = `    source: 'REAL_GPS',
    actorRole: 'driver',
      source: 'REAL_GPS' as const,`;

const dupFixed = `    source: 'REAL_GPS',
    actorRole: 'driver',`;

content = content.replace(dupTarget, dupFixed);

// 2. Add source in Test 118
const t118Target = `  // 118. Zero GPS Disruption: Driver location stream and anti-spoofing validation remain active
  const startT118 = performance.now();
  const driverProfile = db.getState().driverProfiles.find((d) => d.verificationStatus === 'approved');
  let gpsStreamActive = false;
  if (driverProfile) {
    const locRes = db.recordDriverLocationBreadcrumb({
      driverId: driverProfile.id,
      lat: 19.0896,
      lng: 72.8656,
      heading: 90,
      speedKmph: 24,
      accuracyMeters: 4.2,
      actorId: driverProfile.id,
      actorRole: 'driver',
    });`;

const t118Fixed = `  // 118. Zero GPS Disruption: Driver location stream and anti-spoofing validation remain active
  const startT118 = performance.now();
  const driverProfile = db.getState().driverProfiles.find((d) => d.verificationStatus === 'approved');
  let gpsStreamActive = false;
  if (driverProfile) {
    const locRes = db.recordDriverLocationBreadcrumb({
      driverId: driverProfile.id,
      lat: 19.0896,
      lng: 72.8656,
      heading: 90,
      speedKmph: 24,
      accuracyMeters: 4.2,
      source: 'REAL_GPS',
      actorId: driverProfile.id,
      actorRole: 'driver',
    });`;

content = content.replace(t118Target, t118Fixed);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Cleaned up both locations in testSuite.ts');

