import 'dotenv/config';
import { evaluatePoolMatches } from '../src/services/matchingEngine';
import { db } from '../src/services/db';
import { womenOnlyService } from '../src/services/womenOnlyService';
import { DestinationPoint, FlightDetails, RidePool, UserProfile } from '../src/types';

// Six Audit Destinations
const AUDIT_DESTINATIONS: Record<string, DestinationPoint> = {
  'Western Suburbs North': {
    id: 'dest-borivali',
    name: 'Borivali West (Shimpoli)',
    corridor: 'Western Suburbs (North)',
    address: 'Shimpoli Rd, Borivali West, Mumbai 400092',
    latitude: 19.2307,
    longitude: 72.8427,
    distanceKmFromCSMIA: 16.5,
    estMinutesFromCSMIA: 35,
  },
  'Western Suburbs South': {
    id: 'dest-bandra-west',
    name: 'Bandra West (Linking Road)',
    corridor: 'Western Suburbs (South)',
    address: 'Linking Rd, Bandra West, Mumbai 400050',
    latitude: 19.0596,
    longitude: 72.8295,
    distanceKmFromCSMIA: 9.4,
    estMinutesFromCSMIA: 25,
  },
  'Bandra Kurla Complex': {
    id: 'dest-bkc',
    name: 'Bandra Kurla Complex (BKC)',
    corridor: 'Bandra - BKC - Kurla',
    address: 'G Block, BKC, Bandra East, Mumbai 400051',
    latitude: 19.0662,
    longitude: 72.8688,
    distanceKmFromCSMIA: 7.2,
    estMinutesFromCSMIA: 20,
  },
  'South Mumbai': {
    id: 'dest-south-mumbai',
    name: 'Colaba & Nariman Point',
    corridor: 'South Mumbai Heritage & Financial',
    address: 'Nariman Point, Mumbai 400021',
    latitude: 18.9256,
    longitude: 72.8242,
    distanceKmFromCSMIA: 25.4,
    estMinutesFromCSMIA: 45,
  },
  'Powai': {
    id: 'dest-powai',
    name: 'Powai (Hiranandani Gardens)',
    corridor: 'Eastern Suburbs & Tech Corridor',
    address: 'Central Ave, Powai, Mumbai 400076',
    latitude: 19.1197,
    longitude: 72.9051,
    distanceKmFromCSMIA: 8.5,
    estMinutesFromCSMIA: 22,
  },
  'Vasai': {
    id: 'dest-vasai',
    name: 'Vasai West',
    corridor: 'Western Suburbs (North)',
    address: 'Station Rd, Vasai West, Palghar 401202',
    latitude: 19.3824,
    longitude: 72.8274,
    distanceKmFromCSMIA: 43.5,
    estMinutesFromCSMIA: 75,
  },
};

const flightDEL: FlightDetails = {
  flightNumber: '6E 5312',
  airline: 'IndiGo',
  origin: 'DEL',
  destination: 'BOM',
  scheduledArrival: '2026-11-08T22:30:00.000Z',
  estimatedArrival: '2026-11-08T22:30:00.000Z',
  terminal: 'T2',
  status: 'ON_TIME',
  delayMinutes: 0,
};

async function runAudit() {
  console.log('=== RUNNING AEROPOOL MATCHING REGRESSION MATRIX AUDIT ===\n');

  // Register test users in memory
  const woman1: UserProfile = {
    id: 'usr-audit-w1',
    email: 'priya.audit@test.com',
    fullName: 'Priya Sharma',
    phone: '+91 98201 11111',
    role: 'passenger',
    isWomenOnlyEligible: true,
    womenOnlyVerificationStatus: 'verified',
    createdAt: new Date().toISOString(),
  };

  const woman2: UserProfile = {
    id: 'usr-audit-w2',
    email: 'ananya.audit@test.com',
    fullName: 'Ananya Deshmukh',
    phone: '+91 98202 22222',
    role: 'passenger',
    isWomenOnlyEligible: true,
    womenOnlyVerificationStatus: 'verified',
    createdAt: new Date().toISOString(),
  };

  const man1: UserProfile = {
    id: 'usr-audit-m1',
    email: 'rohit.audit@test.com',
    fullName: 'Rohit Mehta',
    phone: '+91 98203 33333',
    role: 'passenger',
    isWomenOnlyEligible: false,
    womenOnlyVerificationStatus: 'none',
    createdAt: new Date().toISOString(),
  };

  womenOnlyService.optInPassenger({
    passengerId: woman1.id,
    passengerName: woman1.fullName,
    passengerPhone: woman1.phone,
    selfDeclarationConfirmed: true,
  });

  womenOnlyService.optInPassenger({
    passengerId: woman2.id,
    passengerName: woman2.fullName,
    passengerPhone: woman2.phone,
    selfDeclarationConfirmed: true,
  });

  const matrixResults: any[] = [];

  for (const [hubName, dest] of Object.entries(AUDIT_DESTINATIONS)) {
    // 1. Create a Women-Only pool for this destination
    const womenPool: RidePool = {
      id: `pool-w-${dest.id}`,
      airportCode: 'BOM',
      terminal: 'T2',
      pickupZone: {
        id: 'zone-t2-p4',
        terminalCode: 'T2',
        name: 'T2 Level P4 East',
        pillar: 'P4',
        floor: 'P4',
        instructions: 'Follow signs to rideshare zone',
        latitude: 19.0886,
        longitude: 72.8679,
      },
      targetCorridor: dest.corridor,
      departureWindowStart: '2026-11-08T22:30:00.000Z',
      departureWindowEnd: '2026-11-08T22:50:00.000Z',
      vehicleCategory: 'Sedan',
      totalSeats: 4,
      availableSeats: 3,
      totalLuggageCapacity: 3,
      availableLuggage: 2,
      status: 'CONFIRMED',
      isWomenOnlyPool: true,
      poolCategory: 'WOMEN_ONLY_POOL',
      passengers: [
        {
          bookingId: `b-${dest.id}`,
          passengerId: woman1.id,
          passengerName: woman1.fullName,
          passengerPhone: woman1.phone,
          seatsBooked: 1,
          luggageCount: 1,
          destination: dest,
          farePaidPaise: 35000,
          pickupOtp: '1234',
          status: 'CONFIRMED',
          isWomenOnlyEligible: true,
        },
      ],
      stops: [],
      createdAt: new Date().toISOString(),
    };

    // 2. Create a standard Shared pool for this destination
    const sharedPool: RidePool = {
      ...womenPool,
      id: `pool-s-${dest.id}`,
      isWomenOnlyPool: false,
      poolCategory: 'SHARED_POOL',
      passengers: [
        {
          ...womenPool.passengers[0],
          bookingId: `bs-${dest.id}`,
          passengerId: man1.id,
          passengerName: man1.fullName,
          passengerPhone: man1.phone,
          isWomenOnlyEligible: false,
        },
      ],
    };

    // Test A: Eligible woman requesting Women-Only pool to same hub
    const matchWomenSame = evaluatePoolMatches([womenPool], {
      terminal: 'T2',
      pickupZoneId: 'zone-t2-p4',
      flightDetails: flightDEL,
      destination: dest,
      seatsNeeded: 1,
      luggageCount: 1,
      maxWaitMinutes: 20,
      readyTimeIso: '2026-11-08T22:30:00.000Z',
      rideType: 'WOMEN_ONLY_POOL',
      isWomenOnlyEligible: true,
      passengerId: woman2.id,
    });
    const canMatchWomenSame = matchWomenSame.some((m) => m.pool.id === womenPool.id && m.isCompatible);

    // Test B: Male requesting standard pool to same hub - must NOT match Women-Only pool
    const matchMaleIntoWomen = evaluatePoolMatches([womenPool], {
      terminal: 'T2',
      pickupZoneId: 'zone-t2-p4',
      flightDetails: flightDEL,
      destination: dest,
      seatsNeeded: 1,
      luggageCount: 1,
      maxWaitMinutes: 20,
      readyTimeIso: '2026-11-08T22:30:00.000Z',
      rideType: 'SHARED_POOL',
      isWomenOnlyEligible: false,
      passengerId: man1.id,
    });
    const maleBlockedFromWomen = matchMaleIntoWomen.length === 0;

    // Test C: Woman requesting Women-Only pool - must NOT match standard shared pool
    const matchWomenIntoShared = evaluatePoolMatches([sharedPool], {
      terminal: 'T2',
      pickupZoneId: 'zone-t2-p4',
      flightDetails: flightDEL,
      destination: dest,
      seatsNeeded: 1,
      luggageCount: 1,
      maxWaitMinutes: 20,
      readyTimeIso: '2026-11-08T22:30:00.000Z',
      rideType: 'WOMEN_ONLY_POOL',
      isWomenOnlyEligible: true,
      passengerId: woman2.id,
    });
    const womenBlockedFromShared = matchWomenIntoShared.length === 0;

    // Test D: Standard shared pool matching for male to standard pool
    const matchSharedNormal = evaluatePoolMatches([sharedPool], {
      terminal: 'T2',
      pickupZoneId: 'zone-t2-p4',
      flightDetails: flightDEL,
      destination: dest,
      seatsNeeded: 1,
      luggageCount: 1,
      maxWaitMinutes: 20,
      readyTimeIso: '2026-11-08T22:30:00.000Z',
      rideType: 'SHARED_POOL',
      isWomenOnlyEligible: false,
      passengerId: man1.id,
    });
    const canMatchSharedNormal = matchSharedNormal.some((m) => m.pool.id === sharedPool.id && m.isCompatible);

    // Test E: Cross-corridor test (try matching destination against an opposite corridor pool)
    const oppositeDest = hubName.includes('South') || hubName.includes('BKC')
      ? AUDIT_DESTINATIONS['Western Suburbs North']
      : AUDIT_DESTINATIONS['South Mumbai'];
    const crossMatch = evaluatePoolMatches([womenPool], {
      terminal: 'T2',
      pickupZoneId: 'zone-t2-p4',
      flightDetails: flightDEL,
      destination: oppositeDest,
      seatsNeeded: 1,
      luggageCount: 1,
      maxWaitMinutes: 20,
      readyTimeIso: '2026-11-08T22:30:00.000Z',
      rideType: 'WOMEN_ONLY_POOL',
      isWomenOnlyEligible: true,
      passengerId: woman2.id,
    });
    const crossCorridorBlocked = crossMatch.length === 0;

    matrixResults.push({
      hubName,
      corridor: dest.corridor,
      canMatchWomenSame,
      maleBlockedFromWomen,
      womenBlockedFromShared,
      canMatchSharedNormal,
      crossCorridorBlocked,
    });
  }

  console.table(matrixResults);
}

runAudit().catch(console.error);
