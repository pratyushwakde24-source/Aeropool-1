import { DestinationPoint, PickupZone, AirportTerminal } from '../types';

export const CSMIA_AIRPORT = {
  id: 'BOM',
  name: 'Chhatrapati Shivaji Maharaj International Airport',
  city: 'Mumbai',
  iata: 'BOM',
  latitude: 19.0902,
  longitude: 72.8628,
};

export const TERMINALS: AirportTerminal[] = [
  {
    id: 'T1',
    code: 'T1',
    name: 'Terminal 1 (Domestic / Santacruz)',
    description: 'Serves selected domestic flights (Akasa, SpiceJet, IndiGo regional).',
    airlines: ['Akasa Air', 'SpiceJet', 'IndiGo (Select)'],
  },
  {
    id: 'T2',
    code: 'T2',
    name: 'Terminal 2 (International & Domestic / Sahar)',
    description: 'Main international terminal and primary hub for Air India, Vistara, IndiGo.',
    airlines: ['Air India', 'IndiGo', 'Vistara', 'Emirates', 'Singapore Airlines', 'Qatar Airways', 'British Airways', 'Lufthansa'],
  },
];

export const PICKUP_ZONES: PickupZone[] = [
  {
    id: 'pz-t2-p4-east',
    terminalCode: 'T2',
    name: 'T2 Level P4 East (AeroPool Lounge)',
    pillar: 'Pillar 4 - 6',
    floor: 'Level P4 Arrival Concourse',
    instructions: 'Exit Gate 5 or 6, take the escalator to P4. Follow AeroPool signs to designated bays.',
    latitude: 19.0972,
    longitude: 72.8752,
  },
  {
    id: 'pz-t2-p7-pool',
    terminalCode: 'T2',
    name: 'T2 Level P7 Shared Ride Hub',
    pillar: 'Bay C, Pillar 12',
    floor: 'Level P7 Multilevel Car Park',
    instructions: 'Cross skywalk to MLCP, take Lift 3 to Level P7. Dedicated taxi pool boarding area.',
    latitude: 19.0965,
    longitude: 72.8739,
  },
  {
    id: 'pz-t1-arr-main',
    terminalCode: 'T1',
    name: 'T1 Domestic Arrival Curbside Zone',
    pillar: 'Pillar 3 & 4',
    floor: 'Ground Floor Arrival',
    instructions: 'Exit Terminal 1 main baggage claim hall. Cross first lane to the designated AeroPool ride bay.',
    latitude: 19.0886,
    longitude: 72.8679,
  },
];

export const MUMBAI_DESTINATIONS: DestinationPoint[] = [
  {
    id: 'bkc-bandra',
    name: 'Bandra Kurla Complex (BKC)',
    corridor: 'Bandra - BKC - Kurla',
    address: 'G Block, BKC, Bandra East, Mumbai, 400051',
    latitude: 19.0662,
    longitude: 72.8688,
    distanceKmFromCSMIA: 7.2,
    estMinutesFromCSMIA: 20,
  },
  {
    id: 'bandra-west',
    name: 'Bandra West (Linking Road / Bandstand)',
    corridor: 'Western Suburbs (South)',
    address: 'Hill Road / Linking Rd, Bandra West, Mumbai, 400050',
    latitude: 19.0596,
    longitude: 72.8295,
    distanceKmFromCSMIA: 9.4,
    estMinutesFromCSMIA: 25,
  },
  {
    id: 'lower-parel-worli',
    name: 'Lower Parel & Worli (High Street Phoenix)',
    corridor: 'South-Central Business District',
    address: 'Senapati Bapat Marg, Lower Parel, Mumbai, 400013',
    latitude: 19.0016,
    longitude: 72.8268,
    distanceKmFromCSMIA: 15.8,
    estMinutesFromCSMIA: 35,
  },
  {
    id: 'nariman-colaba',
    name: 'South Mumbai (Nariman Point / Colaba)',
    corridor: 'South Mumbai Heritage & Financial',
    address: 'Free Press Journal Marg, Nariman Point, Mumbai, 400021',
    latitude: 18.9256,
    longitude: 72.8242,
    distanceKmFromCSMIA: 25.4,
    estMinutesFromCSMIA: 45,
  },
  {
    id: 'powai-hiranandani',
    name: 'Powai (Hiranandani Gardens)',
    corridor: 'Eastern Suburbs & Tech Corridor',
    address: 'Central Avenue, Hiranandani Gardens, Powai, Mumbai, 400076',
    latitude: 19.1197,
    longitude: 72.9051,
    distanceKmFromCSMIA: 8.5,
    estMinutesFromCSMIA: 22,
  },
  {
    id: 'andheri-lokhandwala',
    name: 'Andheri West (Lokhandwala / Versova)',
    corridor: 'Western Suburbs (Central)',
    address: 'Lokhandwala Complex, Andheri West, Mumbai, 400053',
    latitude: 19.1411,
    longitude: 72.8265,
    distanceKmFromCSMIA: 6.8,
    estMinutesFromCSMIA: 20,
  },
  {
    id: 'borivali-west',
    name: 'Borivali West / Kandivali',
    corridor: 'Western Suburbs (North)',
    address: 'Shimpoli Road, Borivali West, Mumbai, 400092',
    latitude: 19.2307,
    longitude: 72.8427,
    distanceKmFromCSMIA: 18.2,
    estMinutesFromCSMIA: 38,
  },
  {
    id: 'navi-mumbai-vashi',
    name: 'Navi Mumbai (Vashi Sector 17)',
    corridor: 'Navi Mumbai Hub',
    address: 'Sector 17, Vashi, Navi Mumbai, 400703',
    latitude: 19.0771,
    longitude: 72.9986,
    distanceKmFromCSMIA: 22.0,
    estMinutesFromCSMIA: 42,
  },
  {
    id: 'thane-viviana',
    name: 'Thane West (Viviana / Majiwada)',
    corridor: 'Thane Metropolitan',
    address: 'Eastern Express Hwy, Majiwada, Thane West, 400606',
    latitude: 19.2081,
    longitude: 72.9714,
    distanceKmFromCSMIA: 24.5,
    estMinutesFromCSMIA: 45,
  },
  {
    id: 'dadar-matunga',
    name: 'Dadar & Matunga (Five Gardens)',
    corridor: 'Central Mumbai',
    address: 'Dadar TT Circle / Dr Ambedkar Rd, Mumbai, 400014',
    latitude: 19.0178,
    longitude: 72.8478,
    distanceKmFromCSMIA: 11.5,
    estMinutesFromCSMIA: 28,
  },
];

/**
 * Calculates straight line distance (Haversine formula in kilometers)
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

/**
 * Estimates driving distance applying urban road geometry winding factor (approx 1.25x - 1.35x for Mumbai)
 */
export function estimateDrivingDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const straightLine = calculateHaversineDistanceKm(lat1, lon1, lat2, lon2);
  return Number((straightLine * 1.28).toFixed(1));
}

/**
 * Calculate detour penalty between two destinations from an origin
 */
export function calculateDetourMetrics(
  originLat: number,
  originLng: number,
  dest1: { lat: number; lng: number },
  dest2: { lat: number; lng: number }
): {
  extraDistanceKm: number;
  extraMinutes: number;
  compatibilityRatio: number; // 0 to 1
} {
  const directDist1 = estimateDrivingDistanceKm(originLat, originLng, dest1.lat, dest1.lng);
  const directDist2 = estimateDrivingDistanceKm(originLat, originLng, dest2.lat, dest2.lng);
  const interDestDist = estimateDrivingDistanceKm(dest1.lat, dest1.lng, dest2.lat, dest2.lng);

  // Combined route: Origin -> Dest1 -> Dest2
  const combinedDist = directDist1 + interDestDist;
  const maxDirect = Math.max(directDist1, directDist2);
  const extraDistanceKm = Math.max(0, Number((combinedDist - maxDirect).toFixed(1)));

  // In Mumbai, urban transit average speed ~25-30 km/h
  const extraMinutes = Math.round((extraDistanceKm / 24) * 60);

  // If extra detour is < 5 km, compatibility is very high
  const compatibilityRatio = Math.max(0, Math.min(1, 1 - extraDistanceKm / 15));

  return {
    extraDistanceKm,
    extraMinutes,
    compatibilityRatio,
  };
}
