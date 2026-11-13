import { RidePool, DestinationPoint, FlightDetails, FareQuote } from '../types';
import { calculateDetourMetrics, estimateDrivingDistanceKm } from './geoService';
import { calculateRideFare } from './pricingEngine';
import { womenOnlyService } from './womenOnlyService';
import { RideType } from '../types';

export interface PoolMatchCandidate {
  pool: RidePool;
  compatibilityScore: number; // 0 - 100
  factors: {
    destinationScore: number; // 0 - 35
    pickupTimeScore: number; // 0 - 25
    detourScore: number; // 0 - 20
    capacityScore: number; // 0 - 10
    efficiencyScore: number; // 0 - 10
  };
  extraDetourKm: number;
  extraDetourMinutes: number;
  fareQuote: FareQuote;
  departureWindowDesc: string;
  matchReason: string;
  isCompatible: boolean;
}

export interface MatchingWeights {
  destination: number; // 0.35
  time: number; // 0.25
  detour: number; // 0.20
  capacity: number; // 0.10
  efficiency: number; // 0.10
}

export const DEFAULT_WEIGHTS: MatchingWeights = {
  destination: 0.35,
  time: 0.25,
  detour: 0.20,
  capacity: 0.10,
  efficiency: 0.10,
};

/**
 * Intelligent Ride-Pooling algorithm
 */
export function evaluatePoolMatches(
  existingPools: RidePool[],
  request: {
    terminal: 'T1' | 'T2';
    pickupZoneId: string;
    flightDetails: FlightDetails;
    destination: DestinationPoint;
    seatsNeeded: number;
    luggageCount: number;
    maxWaitMinutes: number;
    readyTimeIso: string;
    rideType?: RideType;
    isWomenOnlyEligible?: boolean;
    passengerId?: string;
  },
  weights: MatchingWeights = DEFAULT_WEIGHTS
): PoolMatchCandidate[] {
  const reqTime = new Date(request.readyTimeIso).getTime();

  const candidates: PoolMatchCandidate[] = [];

  for (const pool of existingPools) {
    // 1. Hard Terminal Check: Must be in the same terminal
    if (pool.terminal !== request.terminal) {
      continue;
    }

    // 2. Hard Capacity Constraints: Must have enough seats and luggage room
    if (pool.availableSeats < request.seatsNeeded || pool.availableLuggage < request.luggageCount) {
      continue;
    }

    // 3. Pool must not be completed or cancelled
    if (pool.status === 'COMPLETED' || pool.status === 'CANCELLED' || pool.status === 'IN_PROGRESS') {
      continue;
    }

    // 4. Strict Ride Category Isolation (Women-Only Pool vs Shared Pool)
    const requestedType = request.rideType || 'SHARED_POOL';
    const isPoolWomenOnly = Boolean(pool.isWomenOnlyPool || pool.poolCategory === 'WOMEN_ONLY_POOL');

    if (requestedType === 'WOMEN_ONLY_POOL') {
      // Pool MUST be a dedicated Women-Only pool
      if (!isPoolWomenOnly) {
        continue;
      }
      // Passenger MUST be eligible
      const isEligible = Boolean(
        request.isWomenOnlyEligible ||
        (request.passengerId && womenOnlyService.isPassengerEligible(request.passengerId))
      );
      if (!isEligible) {
        continue;
      }
      // Every existing passenger in the pool MUST be verified eligible
      const hasIneligible = pool.passengers.some((p) => p.isWomenOnlyEligible === false);
      if (hasIneligible) {
        continue;
      }
    } else {
      // Standard pools MUST NOT match into Women-Only pools
      if (isPoolWomenOnly) {
        continue;
      }
    }

    // Evaluate Departure Window overlap
    const windowStart = new Date(pool.departureWindowStart).getTime();
    const windowEnd = new Date(pool.departureWindowEnd).getTime();

    // Time difference between passenger arrival and pool departure window
    const timeDeltaMinutes = Math.abs(windowStart - reqTime) / (60 * 1000);
    if (timeDeltaMinutes > request.maxWaitMinutes + 15) {
      // Too far outside waiting tolerance
      continue;
    }

    // 4. Calculate Detour & Destination Alignment
    let maxDetourKm = 0;
    let maxDetourMins = 0;
    let routeCompatibilityRatio = 0.5;

    // Check target corridor alignment: pools strictly match same corridor
    const sameCorridor = Boolean(pool.targetCorridor && pool.targetCorridor.toLowerCase() === request.destination.corridor.toLowerCase());
    if (!sameCorridor && pool.targetCorridor && pool.targetCorridor !== 'All Corridors') {
      continue;
    }

    if (pool.passengers.length === 0) {
      maxDetourKm = 0;
      maxDetourMins = 0;
      routeCompatibilityRatio = 1.0;
    } else {
      // Compare destination with existing passenger destinations
      let totalComp = 0;
      for (const p of pool.passengers) {
        const metrics = calculateDetourMetrics(
          19.0902, // CSMIA BOM lat
          72.8628, // CSMIA BOM lng
          { lat: p.destination.latitude, lng: p.destination.longitude },
          { lat: request.destination.latitude, lng: request.destination.longitude }
        );
        if (metrics.extraDistanceKm > maxDetourKm) {
          maxDetourKm = metrics.extraDistanceKm;
          maxDetourMins = metrics.extraMinutes;
        }
        totalComp += metrics.compatibilityRatio;
      }
      routeCompatibilityRatio = totalComp / pool.passengers.length;
    }

    // Incompatible if detour exceeds 22 minutes or 12 km
    if (maxDetourMins > 22 || maxDetourKm > 12) {
      continue;
    }

    // 5. Compute Weighted Scoring Factor Breakdown:
    // Destination score (0 - 35)
    // Same corridor gives high base; routeCompatibilityRatio scales
    const destFactor = sameCorridor ? Math.max(0.7, routeCompatibilityRatio) : routeCompatibilityRatio;
    const destinationScore = Math.round(destFactor * (weights.destination * 100));

    // Time score (0 - 25)
    // Closer to departure window = higher score
    const timeRatio = Math.max(0, 1 - timeDeltaMinutes / 45);
    const pickupTimeScore = Math.round(timeRatio * (weights.time * 100));

    // Detour score (0 - 20)
    // 0 detour = full score; 20 min detour = 0 score
    const detourRatio = Math.max(0, 1 - maxDetourMins / 20);
    const detourScore = Math.round(detourRatio * (weights.detour * 100));

    // Capacity score (0 - 10)
    // Fits comfortably without filling luggage to max
    const capacityRatio = (pool.availableSeats - request.seatsNeeded >= 0) ? 1.0 : 0.5;
    const capacityScore = Math.round(capacityRatio * (weights.capacity * 100));

    // Efficiency score (0 - 10)
    // Pools with 1 or 2 existing passengers achieve higher split efficiency
    const currentOccupancy = pool.totalSeats - pool.availableSeats;
    const efficiencyRatio = Math.min(1.0, 0.5 + currentOccupancy * 0.25);
    const efficiencyScore = Math.round(efficiencyRatio * (weights.efficiency * 100));

    const totalScore = Math.min(100, Math.max(0, 
      destinationScore + pickupTimeScore + detourScore + capacityScore + efficiencyScore
    ));

    // Dynamic Fare Quote for this specific pool match
    const fareQuote = calculateRideFare(
      request.destination,
      request.seatsNeeded,
      requestedType,
      pool.passengers.length + 1
    );

    // Format human-readable window description
    const startStr = new Date(pool.departureWindowStart).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const endStr = new Date(pool.departureWindowEnd).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    let matchReason = `Direct match along ${pool.targetCorridor}`;
    if (sameCorridor && maxDetourMins <= 5) {
      matchReason = `Optimal corridor match (< 5 min detour)`;
    } else if (maxDetourMins > 0) {
      matchReason = `Compatible route (+${maxDetourMins} min estimated detour)`;
    }

    candidates.push({
      pool,
      compatibilityScore: totalScore,
      factors: {
        destinationScore,
        pickupTimeScore,
        detourScore,
        capacityScore,
        efficiencyScore,
      },
      extraDetourKm: maxDetourKm,
      extraDetourMinutes: maxDetourMins,
      fareQuote,
      departureWindowDesc: `${startStr} – ${endStr}`,
      matchReason,
      isCompatible: totalScore >= 55,
    });
  }

  // Rank by highest compatibility score first
  return candidates.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}
