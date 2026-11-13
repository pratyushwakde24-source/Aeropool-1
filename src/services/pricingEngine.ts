import { FareQuote, DestinationPoint, RideType } from '../types';

// Pricing constants in Minor Units (Paise: ₹1 = 100 paise)
export const PRICING_CONSTANTS = {
  BASE_FARE_PAISE: 15000, // ₹150.00 base fare
  PER_KM_RATE_PAISE: 2200, // ₹22.00 per km
  PER_MINUTE_RATE_PAISE: 250, // ₹2.50 per minute travel time
  AIRPORT_PARKING_CESS_PAISE: 11000, // ₹110.00 CSMIA commercial toll/parking
  PLATFORM_FEE_PAISE: 4000, // ₹40.00 platform coordination fee
  GST_RATE_PERCENT: 5, // 5% GST on transport
  POOL_SAVINGS_MULTIPLIER: 0.62, // Pooled passenger pays ~62% of solo benchmark (38% savings)
};

/**
 * Calculates fare quote in integer minor units (paise)
 */
export function calculateRideFare(
  destination: DestinationPoint,
  passengerCount: number = 1,
  rideType: RideType = 'SHARED_POOL',
  currentPoolPassengerCount: number = 2
): FareQuote {
  const distKm = destination.distanceKmFromCSMIA;
  const estMins = destination.estMinutesFromCSMIA;

  const baseFare = PRICING_CONSTANTS.BASE_FARE_PAISE;
  const distanceFare = Math.round(distKm * PRICING_CONSTANTS.PER_KM_RATE_PAISE);
  const timeFare = Math.round(estMins * PRICING_CONSTANTS.PER_MINUTE_RATE_PAISE);
  const airportToll = PRICING_CONSTANTS.AIRPORT_PARKING_CESS_PAISE;
  const platformFee = PRICING_CONSTANTS.PLATFORM_FEE_PAISE;

  const subtotalSolo = baseFare + distanceFare + timeFare + airportToll + platformFee;
  const gstSolo = Math.round((subtotalSolo * PRICING_CONSTANTS.GST_RATE_PERCENT) / 100);
  const individualBenchmarkFarePaise = subtotalSolo + gstSolo;

  if (rideType === 'PRIVATE') {
    return {
      totalEstimatedFarePaise: individualBenchmarkFarePaise,
      passengerShareFarePaise: individualBenchmarkFarePaise,
      individualBenchmarkFarePaise,
      savingsPaise: 0,
      savingsPercentage: 0,
      baseFarePaise: baseFare,
      distanceFarePaise: distanceFare,
      timeFarePaise: timeFare,
      airportTollPaise: airportToll,
      platformFeePaise: platformFee,
      gstPaise: gstSolo,
    };
  }

  // Pooled ride math:
  // Base cost split across pool with dynamic occupancy savings
  // When pool has 2+ passengers, discount is between 35% and 42%
  const occupancyFactor = Math.min(0.42, 0.32 + currentPoolPassengerCount * 0.04);
  const discountedRate = 1 - occupancyFactor;

  const pooledBaseAndDist = Math.round((baseFare + distanceFare + timeFare) * discountedRate);
  const pooledTollShare = Math.round(airportToll / Math.max(1, currentPoolPassengerCount));
  const pooledSubtotal = (pooledBaseAndDist + pooledTollShare + platformFee) * passengerCount;
  const pooledGst = Math.round((pooledSubtotal * PRICING_CONSTANTS.GST_RATE_PERCENT) / 100);

  const passengerShareFarePaise = pooledSubtotal + pooledGst;
  const totalEstimatedFarePaise = Math.round(passengerShareFarePaise * currentPoolPassengerCount);
  const savingsPaise = Math.max(0, individualBenchmarkFarePaise * passengerCount - passengerShareFarePaise);
  const savingsPercentage = Math.round((savingsPaise / (individualBenchmarkFarePaise * passengerCount)) * 100);

  return {
    totalEstimatedFarePaise,
    passengerShareFarePaise,
    individualBenchmarkFarePaise: individualBenchmarkFarePaise * passengerCount,
    savingsPaise,
    savingsPercentage,
    baseFarePaise: Math.round(baseFare * discountedRate),
    distanceFarePaise: Math.round(distanceFare * discountedRate),
    timeFarePaise: Math.round(timeFare * discountedRate),
    airportTollPaise: pooledTollShare,
    platformFeePaise: platformFee,
    gstPaise: pooledGst,
  };
}

/**
 * Formats paise into standard INR currency string (e.g. 45000 -> "₹450.00")
 */
export function formatINR(paise: number, showDecimals: boolean = false): string {
  const rupees = paise / 100;
  if (!showDecimals) {
    return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
  }
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
