import React, { useState, useEffect, useCallback } from 'react';
import {
  Plane,
  MapPin,
  Users,
  Briefcase,
  Clock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  TrendingDown,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Car,
  Search,
  Navigation,
  Check,
  Building,
  ChevronRight,
  Info,
  X,
  Waypoints,
  Armchair
} from 'lucide-react';
import { db } from '../services/db';
import { MUMBAI_DESTINATIONS, PICKUP_ZONES, TERMINALS, CSMIA_AIRPORT, calculateHaversineDistanceKm } from '../services/geoService';
import { POPULAR_CSMIA_FLIGHTS, lookupCSMIAFlight } from '../services/flightService';
import { evaluatePoolMatches, PoolMatchCandidate } from '../services/matchingEngine';
import { calculateRideFare, formatINR } from '../services/pricingEngine';
import { DestinationPoint, FlightDetails, RidePool, PickupZone, UserProfile, RideType } from '../types';
import { womenOnlyService } from '../services/womenOnlyService';
import { RazorpayModal } from '../components/RazorpayModal';
import { InteractiveMap } from '../components/InteractiveMap';
import { searchDestinationPlaces, PlaceSuggestion } from '../services/mapProviderService';

interface PassengerBookViewProps {
  onNavigate: (route: string) => void;
  onBookingCreated: (bookingId: string) => void;
  onOpenAuthModal?: () => void;
}

export const PassengerBookView: React.FC<PassengerBookViewProps> = ({
  onNavigate,
  onBookingCreated,
  onOpenAuthModal,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const s = parseInt(urlParams.get('step') || '', 10);
        if (s >= 1 && s <= 5) return s as 1 | 2 | 3 | 4 | 5;
      }
    } catch {
      // ignore
    }
    return 1;
  });

  // Form State
  const [flightQuery, setFlightQuery] = useState('6E 5312');
  const [flightDetails, setFlightDetails] = useState<FlightDetails>(POPULAR_CSMIA_FLIGHTS[0]);
  const [isLookingUpFlight, setIsLookingUpFlight] = useState(false);
  const [terminal, setTerminal] = useState<'T1' | 'T2'>('T2');
  const [selectedPickupZoneId, setSelectedPickupZoneId] = useState<string>('pz-t2-p4-east');
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [arrivalTime, setArrivalTime] = useState(
    new Date(Date.now() + 60 * 60 * 1000).toTimeString().substring(0, 5)
  );
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(1);
  const [validationError, setValidationError] = useState<string | null>(null);

  const availablePickupZones = PICKUP_ZONES.filter((z) => z.terminalCode === terminal);
  const currentPickupZone: PickupZone =
    availablePickupZones.find((z) => z.id === selectedPickupZoneId) || availablePickupZones[0] || PICKUP_ZONES[0];

  const handleTerminalChange = (t: 'T1' | 'T2') => {
    setTerminal(t);
    const zonesForT = PICKUP_ZONES.filter((z) => z.terminalCode === t);
    if (zonesForT.length > 0) {
      setSelectedPickupZoneId(zonesForT[0].id);
    }
  };

  // Step 2: Destination
  const [destSearch, setDestSearch] = useState('');
  const [selectedDestId, setSelectedDestId] = useState<string>(MUMBAI_DESTINATIONS[0].id);
  const [customDestination, setCustomDestination] = useState<DestinationPoint | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [searchFailed, setSearchFailed] = useState<boolean>(false);
  const [liveRouteMetrics, setLiveRouteMetrics] = useState<{ distanceKm: number; durationMinutes: number } | null>(null);

  const selectedDestination: DestinationPoint =
    customDestination || MUMBAI_DESTINATIONS.find((d) => d.id === selectedDestId) || MUMBAI_DESTINATIONS[0];

  const handleDestSearchChange = async (query: string) => {
    setDestSearch(query);
    setSearchFailed(false);
    if (query.trim().length >= 2) {
      setIsSearchingPlaces(true);
      try {
        const results = await searchDestinationPlaces(query);
        setPlaceSuggestions(results);
        if (results.length === 0) {
          setSearchFailed(true);
        }
      } catch {
        setPlaceSuggestions([]);
        setSearchFailed(true);
      } finally {
        setIsSearchingPlaces(false);
      }
    } else {
      setPlaceSuggestions([]);
    }
  };

  const handleSelectSuggestion = (item: PlaceSuggestion) => {
    const newDest: DestinationPoint = {
      id: item.id,
      name: item.name,
      corridor: item.corridor,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      distanceKmFromCSMIA: item.distanceKm,
      estMinutesFromCSMIA: item.estMinutes,
    };
    setCustomDestination(newDest);
    setSelectedDestId(newDest.id);
    setPlaceSuggestions([]);
    setDestSearch(newDest.name);
    setSearchFailed(false);
    setLiveRouteMetrics(null);
  };

  const handleMapPinSelect = useCallback((pin: { lat: number; lng: number; name?: string }) => {
    const distKm = Number((calculateHaversineDistanceKm(CSMIA_AIRPORT.latitude, CSMIA_AIRPORT.longitude, pin.lat, pin.lng) * 1.3).toFixed(1));
    const estMins = Math.max(15, Math.round((distKm / 25) * 60));
    const corridor = pin.lat < 19.03 ? 'South Mumbai' : pin.lat > 19.13 ? 'Western Suburbs (North)' : 'Central / Western';
    const newDest: DestinationPoint = {
      id: `pin-${Date.now()}`,
      name: pin.name || `Map Pin (${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)})`,
      corridor,
      address: `Selected Map Location: ${pin.lat.toFixed(4)}° N, ${pin.lng.toFixed(4)}° E`,
      latitude: pin.lat,
      longitude: pin.lng,
      distanceKmFromCSMIA: distKm,
      estMinutesFromCSMIA: estMins,
    };
    setCustomDestination(newDest);
    setSelectedDestId(newDest.id);
    setDestSearch(newDest.name);
    setSearchFailed(false);
    setLiveRouteMetrics(null);
  }, []);

  // Step 3: Preferences
  const [rideType, setRideType] = useState<RideType>(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const rt = urlParams.get('rideType');
        if (rt === 'WOMEN_ONLY_POOL' || rt === 'SHARED_POOL' || rt === 'PRIVATE') {
          return rt as RideType;
        }
      }
    } catch {
      // ignore
    }
    return 'SHARED_POOL';
  });
  const [showWomenOnlyModal, setShowWomenOnlyModal] = useState(false);
  const [womenOnlySelfDeclaration, setWomenOnlySelfDeclaration] = useState(false);
  const [switchConfirmModal, setSwitchConfirmModal] = useState<RideType | null>(null);
  const [maxWaitMinutes, setMaxWaitMinutes] = useState(20);

  const handleSelectRideType = (selectedType: RideType) => {
    // If passenger is currently on WOMEN_ONLY_POOL and attempts to switch to another category
    if (rideType === 'WOMEN_ONLY_POOL' && selectedType !== 'WOMEN_ONLY_POOL') {
      setSwitchConfirmModal(selectedType);
      return;
    }

    if (selectedType === 'WOMEN_ONLY_POOL') {
      const isAlreadyEligible = Boolean(
        currentUser.isWomenOnlyEligible ||
        womenOnlySelfDeclaration ||
        womenOnlyService.isPassengerEligible(currentUser.id)
      );

      if (!isAlreadyEligible) {
        setShowWomenOnlyModal(true);
        return;
      }
    }

    setRideType(selectedType);
  };

  // Pick up pending booking parameters from homepage mobile CTA if present
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('aeropool_pending_booking');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.terminal) handleTerminalChange(data.terminal);
        if (data.pickupZoneId) setSelectedPickupZoneId(data.pickupZoneId);
        if (data.destination) {
          setCustomDestination(data.destination);
          setSelectedDestId(data.destination.id);
          setDestSearch(data.destination.name);
          setStep(2);
        }
        if (data.flightDetails) {
          setFlightDetails(data.flightDetails);
          setFlightQuery(data.flightDetails.flightNumber);
        }
        if (data.passengerCount) setPassengerCount(data.passengerCount);
        sessionStorage.removeItem('aeropool_pending_booking');
      }
    } catch {
      // ignore
    }
  }, []);

  // Step 4: Matches
  const [existingDatabaseMatches, setExistingDatabaseMatches] = useState<PoolMatchCandidate[]>([]);
  const [anchorCandidate, setAnchorCandidate] = useState<PoolMatchCandidate | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<PoolMatchCandidate | null>(null);

  // Step 5: Checkout & Razorpay
  const [showRazorpay, setShowRazorpay] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const dbUser = db.getState().currentUser;
  const isGuest = !dbUser;
  const currentUser: UserProfile = dbUser || {
    id: 'guest-flyer',
    email: 'guest@aeropool.test',
    fullName: 'Airport Flyer',
    phone: '+91 98200 00000',
    role: 'passenger',
    createdAt: new Date().toISOString(),
  };

  // Handle Flight Lookup
  const handleFlightSearch = async (query: string) => {
    setFlightQuery(query);
    if (query.trim().length >= 3) {
      setIsLookingUpFlight(true);
      const res = await lookupCSMIAFlight(query);
      if (res) {
        setFlightDetails(res);
        setTerminal(res.terminal);
      }
      setIsLookingUpFlight(false);
    }
  };

  const handleStep1Submit = () => {
    if (!flightQuery.trim()) {
      setValidationError('Please enter your incoming flight number.');
      return;
    }
    if (!arrivalDate || !arrivalTime) {
      setValidationError('Please specify arrival date and time.');
      return;
    }
    setValidationError(null);
    setStep(2);
  };

  // Run Matching Algorithm when entering step 4
  useEffect(() => {
    if (step === 4) {
      const allPools = db.getState().pools;
      const readyDate = new Date(`${arrivalDate}T${arrivalTime}:00`);
      const readyTimeIso = !isNaN(readyDate.getTime()) ? readyDate.toISOString() : new Date().toISOString();

      const existingMatches = evaluatePoolMatches(allPools, {
        terminal,
        pickupZoneId: currentPickupZone.id,
        flightDetails,
        destination: selectedDestination,
        seatsNeeded: passengerCount,
        luggageCount,
        maxWaitMinutes,
        readyTimeIso,
        rideType,
        isWomenOnlyEligible: Boolean(currentUser.isWomenOnlyEligible || womenOnlySelfDeclaration),
        passengerId: currentUser.id,
      });

      // Build candidate for initiating a brand new pool or private ride
      const sharedQuote = calculateRideFare(selectedDestination, passengerCount, 'SHARED_POOL', 2);
      const privateQuote = calculateRideFare(selectedDestination, passengerCount, 'PRIVATE', 1);

      const newPoolCandidate: PoolMatchCandidate = {
        pool: {
          id: rideType === 'PRIVATE' ? 'new-pool-private' : 'new-pool-initiate',
          airportCode: 'BOM',
          terminal,
          pickupZone: currentPickupZone,
          targetCorridor: selectedDestination.corridor,
          departureWindowStart: readyTimeIso,
          departureWindowEnd: new Date(new Date(readyTimeIso).getTime() + maxWaitMinutes * 60000).toISOString(),
          vehicleCategory: passengerCount > 2 ? 'XL' : 'Sedan',
          totalSeats: 4,
          availableSeats: 4 - passengerCount,
          totalLuggageCapacity: 3,
          availableLuggage: 3 - luggageCount,
          status: 'CONFIRMED',
          isWomenOnlyPool: rideType === 'WOMEN_ONLY_POOL',
          poolCategory: rideType,
          passengers: [],
          stops: [],
          createdAt: new Date().toISOString(),
        },
        compatibilityScore: 98,
        factors: {
          destinationScore: 35,
          pickupTimeScore: 25,
          detourScore: 20,
          capacityScore: 10,
          efficiencyScore: 8,
        },
        extraDetourKm: 0,
        extraDetourMinutes: 0,
        fareQuote: calculateRideFare(selectedDestination, passengerCount, rideType, rideType === 'PRIVATE' ? 1 : 2),
        departureWindowDesc: `${arrivalTime} (Anchor Departure)`,
        matchReason: `Optimal direct route along ${selectedDestination.corridor} — Start new pool as anchor passenger`,
        isCompatible: true,
      };

      setExistingDatabaseMatches(existingMatches);
      setAnchorCandidate(newPoolCandidate);

      if (existingMatches.length > 0) {
        setSelectedCandidate(existingMatches[0]);
      } else {
        setSelectedCandidate(newPoolCandidate);
      }
    }
  }, [step, terminal, currentPickupZone, selectedDestination, passengerCount, luggageCount, maxWaitMinutes, flightDetails, arrivalDate, arrivalTime, rideType]);

  // Handle Payment Success
  const handlePaymentSuccess = async (paymentDetails: {
    paymentId: string;
    orderId: string;
    method: 'UPI' | 'Card' | 'Netbanking';
  }) => {
    setShowRazorpay(false);
    setIsSubmitting(true);
    setBookingError(null);

    if (!selectedCandidate) return;

    // Idempotency key derived from payment to eliminate duplicate bookings
    const idempotencyKey = `idem-${paymentDetails.paymentId}-${currentUser.id}`;

    // Record the ride request in the persistent database
    db.createRideRequest({
      id: `req-${Date.now()}`,
      passengerId: currentUser.id,
      passengerName: currentUser.fullName,
      passengerPhone: currentUser.phone,
      flightDetails,
      pickupZoneId: currentPickupZone.id,
      destination: selectedDestination,
      seatsNeeded: passengerCount,
      luggageCount,
      maxWaitMinutes,
      rideType,
      isWomenOnlyEligible: Boolean(currentUser.isWomenOnlyEligible || womenOnlySelfDeclaration),
      createdAt: new Date().toISOString(),
      status: 'MATCHED',
    });

    let bookResult;
    if (selectedCandidate.pool.id.startsWith('new-pool-')) {
      // Initiate a new pool atomically
      const readyDate = new Date(`${arrivalDate}T${arrivalTime}:00`);
      const readyTimeIso = !isNaN(readyDate.getTime()) ? readyDate.toISOString() : new Date().toISOString();

      bookResult = await db.createPoolAndBookAtomicAsync({
        terminal,
        pickupZoneId: currentPickupZone.id,
        targetCorridor: selectedDestination.corridor,
        readyTimeIso,
        maxWaitMinutes,
        passengerId: currentUser.id,
        passengerName: currentUser.fullName,
        passengerPhone: currentUser.phone,
        flightNumber: flightDetails.flightNumber,
        destination: selectedDestination,
        seats: passengerCount,
        luggage: luggageCount,
        farePaise: selectedCandidate.fareQuote.passengerShareFarePaise,
        savingsPaise: selectedCandidate.fareQuote.savingsPaise,
        rideType,
        isWomenOnlyEligible: Boolean(currentUser.isWomenOnlyEligible || womenOnlySelfDeclaration),
        paymentMethod: paymentDetails.method,
        paymentId: paymentDetails.paymentId,
        razorpayOrderId: paymentDetails.orderId,
        idempotencyKey,
      });
    } else {
      // Book into existing pool atomically
      bookResult = await db.bookRideAtomicAsync({
        poolId: selectedCandidate.pool.id,
        passengerId: currentUser.id,
        passengerName: currentUser.fullName,
        passengerPhone: currentUser.phone,
        flightNumber: flightDetails.flightNumber,
        destination: selectedDestination,
        seats: passengerCount,
        luggage: luggageCount,
        farePaise: selectedCandidate.fareQuote.passengerShareFarePaise,
        savingsPaise: selectedCandidate.fareQuote.savingsPaise,
        paymentMethod: paymentDetails.method,
        paymentId: paymentDetails.paymentId,
        razorpayOrderId: paymentDetails.orderId,
        idempotencyKey,
        rideType,
        isWomenOnlyEligible: Boolean(currentUser.isWomenOnlyEligible || womenOnlySelfDeclaration),
      });
    }

    setIsSubmitting(false);

    if (bookResult.success && bookResult.booking) {
      const confirmedPool = db.getState().pools.find((p) => p.id === bookResult.booking?.poolId);
      if (confirmedPool && !confirmedPool.assignedDriverId) {
        const eligibleDrivers = db.findEligibleDriversForPickup({
          pickupLat: confirmedPool.pickupZone?.latitude || 19.0896,
          pickupLng: confirmedPool.pickupZone?.longitude || 72.8656,
          vehicleCategory: confirmedPool.vehicleCategory,
          terminal: confirmedPool.terminal,
          minSeats: confirmedPool.passengers.reduce((sum, p) => sum + p.seatsBooked, 0),
        });
        if (eligibleDrivers.length > 0) {
          db.createRideOffer({
            poolId: confirmedPool.id,
            driverId: eligibleDrivers[0].driver.id,
            actorId: currentUser.id,
          });
        }
      }

      onBookingCreated(bookResult.booking.id);
      onNavigate(`/app/track/${bookResult.booking.id}`);
    } else {
      setBookingError(bookResult.error || 'Failed to complete booking');
    }
  };

  const stepsList = [
    { num: 1, label: 'Flight & Bay' },
    { num: 2, label: 'Destination' },
    { num: 3, label: 'Preferences' },
    { num: 4, label: 'Matches' },
    { num: 5, label: 'Confirm' },
  ];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Top Progress Wizard Bar */}
        <div className="glass-panel border border-slate-800/80 rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-1.5 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
            {stepsList.map((s, idx) => (
              <React.Fragment key={s.num}>
                <div
                  className={`flex items-center gap-2 shrink-0 transition-all ${
                    step === s.num
                      ? 'text-white'
                      : step > s.num
                      ? 'text-sky-400'
                      : 'text-slate-500'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${
                      step === s.num
                        ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-slate-950 shadow-md shadow-sky-500/25'
                        : step > s.num
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/60'
                    }`}
                  >
                    {step > s.num ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.num}
                  </div>
                  <span className="text-xs font-semibold hidden md:inline">{s.label}</span>
                </div>
                {idx < stepsList.length - 1 && (
                  <div
                    className={`w-4 sm:w-8 h-0.5 rounded-full transition-all ${
                      step > s.num ? 'bg-sky-500/50' : 'bg-slate-800'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          <button
            onClick={() => onNavigate('/app')}
            className="text-slate-400 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-800/50 transition ml-2"
          >
            Cancel
          </button>
        </div>

        {/* STEP 1: FLIGHT & PASSENGERS */}
        {step === 1 && (
          <div className="glass-panel border border-slate-800/90 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            {/* Header with Airport Hub Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
              <div>
                <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                  Step 1 of 5 • Flight Touchdown
                </span>
                <h2 className="text-2xl font-extrabold text-white mt-1 tracking-tight">
                  Airport Arrival & Pickup Bay
                </h2>
              </div>
              <div className="px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs font-mono font-semibold self-start sm:self-auto flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-sky-400 -rotate-45" />
                CSMIA Mumbai (BOM)
              </div>
            </div>

            {/* Flight Search Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Incoming Flight Number
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={flightQuery}
                  onChange={(e) => handleFlightSearch(e.target.value)}
                  placeholder="e.g. 6E 5312, AI 678, UK 955, QP 1332"
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-2xl px-4 py-3.5 text-sm text-white font-mono uppercase tracking-wider focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 shadow-inner"
                />
                {isLookingUpFlight && (
                  <span className="absolute right-4 top-3.5 text-xs text-sky-400 animate-pulse font-mono">
                    Tracking CSMIA...
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
                <span className="font-medium text-slate-400">Frequent arrivals:</span>
                {POPULAR_CSMIA_FLIGHTS.slice(0, 4).map((f) => (
                  <button
                    key={f.flightNumber}
                    type="button"
                    onClick={() => handleFlightSearch(f.flightNumber)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-sky-300 font-mono text-[11px] font-semibold border border-slate-700/60 transition"
                  >
                    {f.flightNumber}
                  </button>
                ))}
              </div>
            </div>

            {/* Terminal Switcher */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                CSMIA Terminal
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleTerminalChange('T2')}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    terminal === 'T2'
                      ? 'bg-gradient-to-br from-sky-500/20 to-cyan-500/10 border-sky-500 text-white shadow-lg shadow-sky-500/15 ring-1 ring-sky-500'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-base font-extrabold text-white">Terminal 2 (T2)</span>
                    {terminal === 'T2' && <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />}
                  </div>
                  <div className="text-xs text-slate-400">International & Domestic Hub (Vistara, Air India, IndiGo)</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleTerminalChange('T1')}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    terminal === 'T1'
                      ? 'bg-gradient-to-br from-sky-500/20 to-cyan-500/10 border-sky-500 text-white shadow-lg shadow-sky-500/15 ring-1 ring-sky-500'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-base font-extrabold text-white">Terminal 1 (T1)</span>
                    {terminal === 'T1' && <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />}
                  </div>
                  <div className="text-xs text-slate-400">Domestic Flights (Santacruz West)</div>
                </button>
              </div>
            </div>

            {/* Pickup Zone Selection */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Select Designate Pickup Bay
                </label>
                <span className="text-[11px] text-sky-400 font-medium">Clear signage at exit gate</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availablePickupZones.map((zone) => {
                  const isSelected = zone.id === currentPickupZone.id;
                  return (
                    <div
                      key={zone.id}
                      onClick={() => setSelectedPickupZoneId(zone.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-400 text-white shadow-md shadow-sky-500/10'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-1.5">
                        <span className="text-sm font-bold text-white">{zone.name}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />}
                      </div>
                      <div className="text-xs text-cyan-300 font-mono font-semibold">
                        {zone.pillar} • {zone.floor}
                      </div>
                      <div className="text-xs text-slate-400 pt-1 leading-snug">
                        {zone.instructions}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Passenger and Luggage count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-sky-400" />
                  <span>Passengers (Seats Needed)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setPassengerCount(num)}
                      className={`py-3 rounded-xl border text-xs font-bold transition-all ${
                        passengerCount === num
                          ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md shadow-sky-500/20'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {num} {num === 1 ? 'Solo' : num === 2 ? 'Couple' : 'Group'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-sky-400" />
                  <span>Luggage Allowance</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setLuggageCount(num)}
                      className={`py-3 rounded-xl border text-xs font-bold transition-all ${
                        luggageCount === num
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {num} {num === 1 ? 'Bag' : 'Bags'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {validationError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleStep1Submit}
                className="h-12 px-8 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-sky-500/25 transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>Continue to Destination</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: DESTINATION (UBER/OLA BENCHMARK SPEC) */}
        {step === 2 && (
          <div className="glass-panel border border-slate-800/90 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
              <div>
                <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Step 2 of 5 • Destination Corridor
                </span>
                <h2 className="text-2xl font-extrabold text-white mt-1 tracking-tight">
                  Where in Mumbai are you heading?
                </h2>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Pickup Location:</span>
                <div className="text-xs font-mono font-bold text-sky-400">CSMIA {terminal} • {currentPickupZone.name.split('(')[0]}</div>
              </div>
            </div>

            {/* Destination Autocomplete Search Box */}
            <div className="relative">
              <div className="relative flex items-center">
                <Search className="w-5 h-5 text-sky-400 absolute left-4 pointer-events-none" />
                <input
                  type="text"
                  value={destSearch}
                  onChange={(e) => handleDestSearchChange(e.target.value)}
                  placeholder="Search destination, hotel, office, or landmark (e.g. BKC, Colaba, Powai, Andheri, Taj Mahal Hotel)..."
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-2xl pl-12 pr-12 py-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 shadow-inner"
                />
                {isSearchingPlaces && (
                  <span className="absolute right-4 text-xs text-sky-400 animate-pulse font-mono font-semibold">
                    Searching...
                  </span>
                )}
                {destSearch.length > 0 && !isSearchingPlaces && (
                  <button
                    type="button"
                    onClick={() => {
                      setDestSearch('');
                      setPlaceSuggestions([]);
                      setSearchFailed(false);
                    }}
                    className="absolute right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Predictions Dropdown */}
              {placeSuggestions.length > 0 && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setPlaceSuggestions([])}
                    aria-hidden="true"
                  />
                  <div
                    role="listbox"
                    aria-label="Destination suggestions"
                    className="absolute left-0 right-0 top-full mt-2 bg-[#0B1728] border border-slate-700/90 rounded-2xl shadow-2xl z-40 overflow-hidden divide-y divide-slate-800/80 max-h-80 overflow-y-auto backdrop-blur-xl"
                  >
                  {placeSuggestions.map((item) => {
                    const isSelected = selectedDestination.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-testid={`place-suggestion-${item.id}`}
                        onClick={() => handleSelectSuggestion(item)}
                        className={`w-full px-4 py-3 sm:px-5 sm:py-3.5 text-left text-xs transition flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-[#00DDF5]/15 border-l-4 border-l-[#00DDF5] text-white'
                            : 'hover:bg-slate-800/80 text-slate-200'
                        }`}
                      >
                        {/* LEFT: Small cyan location-pin icon in subtle dark circular container */}
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#00DDF5]/10 border border-[#00DDF5]/25 text-[#00DDF5] flex items-center justify-center shrink-0 self-center">
                          <MapPin className="w-4 h-4 text-[#00DDF5]" />
                        </div>

                        {/* CENTRE: Full destination name + readable secondary address (NO category badge) */}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white text-sm sm:text-base leading-snug line-clamp-2 break-words">
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed break-words">
                            {item.address}
                          </div>
                        </div>

                        {/* RIGHT: Distance from CSMIA */}
                        {typeof item.distanceKm === 'number' && !isNaN(item.distanceKm) && (
                          <div className="shrink-0 text-right pl-2 self-center">
                            <span className="text-xs font-mono font-bold text-cyan-400 whitespace-nowrap">
                              {item.distanceKm} km
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

              {/* No Results Empty State */}
              {searchFailed && !isSearchingPlaces && destSearch.trim().length >= 2 && placeSuggestions.length === 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-[#0B1728] border border-slate-700/90 rounded-2xl p-4 shadow-2xl z-40 text-center space-y-1">
                  <div className="text-xs font-semibold text-slate-300">
                    No verified places found for &ldquo;{destSearch}&rdquo;
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Try searching by locality, building, or click the map below to drop a custom pin.
                  </div>
                </div>
              )}
            </div>

            {/* Popular Curated Destination Chips (Quick Select) */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Popular Mumbai Hubs:
              </div>
              <div className="flex flex-wrap gap-2">
                {MUMBAI_DESTINATIONS.slice(0, 6).map((dest) => {
                  const isSelected = dest.id === selectedDestId;
                  return (
                    <button
                      key={dest.id}
                      type="button"
                      data-testid={`hub-${dest.id}`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setCustomDestination(null);
                        setSelectedDestId(dest.id);
                        setDestSearch(dest.name);
                        setPlaceSuggestions([]);
                        setLiveRouteMetrics(null);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-slate-950 font-bold shadow-md shadow-sky-500/20'
                          : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{dest.name.split('(')[0].trim()}</span>
                      <span className="font-mono text-[10px] opacity-80">({dest.distanceKmFromCSMIA} km)</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Interactive Map Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-bold text-slate-300">
                  <Navigation className="w-4 h-4 text-sky-400" />
                  <span>Route Polyline & Distance</span>
                </span>
                <span className="text-slate-400 font-mono text-[11px]">Click map to drop custom pin</span>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                <InteractiveMap
                  pickupZone={currentPickupZone}
                  destination={selectedDestination}
                  onDestinationSelect={handleMapPinSelect}
                  onRouteCalculated={(route) => {
                    setLiveRouteMetrics({
                      distanceKm: route.distanceKm,
                      durationMinutes: route.durationMinutes,
                    });
                  }}
                  interactiveSelection={true}
                  heightClass="h-72 sm:h-80"
                />
              </div>
            </div>

            {/* Selected Destination Details Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-sky-950/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-[11px] font-mono text-sky-400 font-bold uppercase">Target Drop-Off Point</div>
                <div className="text-base font-extrabold text-white">{selectedDestination.name}</div>
                <div className="text-xs text-slate-400">{selectedDestination.address}</div>
              </div>
              <div className="flex items-center gap-4 text-right shrink-0">
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase">Distance</div>
                  <div className="text-base font-mono font-extrabold text-white">
                    {liveRouteMetrics ? `${liveRouteMetrics.distanceKm} km` : `${selectedDestination.distanceKmFromCSMIA} km`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase">Est. Drive</div>
                  <div className="text-base font-mono font-extrabold text-cyan-300">
                    {liveRouteMetrics ? `~${liveRouteMetrics.durationMinutes} mins` : `~${selectedDestination.estMinutesFromCSMIA} mins`}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-11 px-5 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="h-12 px-8 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-sky-500/25 transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>Continue to Preferences</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RIDE PREFERENCES */}
        {step === 3 && (
          <div className="glass-panel border border-slate-800/90 rounded-3xl p-4 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Step 3 of 5 • Pooling Comfort
              </span>
              <h2 className="text-2xl font-extrabold text-white mt-1 tracking-tight">
                Select Ride Category & Wait Window
              </h2>
            </div>

            {/* Ride Type Selection Cards */}
            <div className="grid grid-cols-1 auto-rows-fr gap-4">
              {/* Card 1: Shared AeroPool */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'SHARED_POOL'}
                data-testid="ride-category-shared"
                onClick={() => handleSelectRideType('SHARED_POOL')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectRideType('SHARED_POOL');
                  }
                }}
                className={`w-full p-4 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none ${
                  rideType === 'SHARED_POOL'
                    ? 'border-[#00DDF5] bg-[#0B1930] shadow-[0_0_24px_rgba(0,221,245,0.18)] ring-1 ring-[#00DDF5]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-slate-700 hover:bg-[#0B1930]'
                }`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Green Badge */}
                  <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <Users className="w-6 h-6 sm:w-7 sm:h-7 text-[#00DDF5] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-1 shrink-0" />
                      <h3 className="text-base sm:text-xl font-bold text-white tracking-tight break-normal leading-snug">
                        Shared AeroPool
                      </h3>
                    </div>
                    <span className="self-start min-[400px]:self-center px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-[#0A3D2E] border border-[#10B981]/50 text-[#34D399] whitespace-nowrap shadow-sm">
                      Save up to 40%
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 sm:mt-4 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal break-words">
                    Share a licensed commercial taxi with 1–2 verified flyers on the same route.
                  </p>
                </div>

                {/* Bottom Benefits Row */}
                <div className="mt-4 sm:mt-5 pt-1 flex items-center text-xs sm:text-sm text-slate-200 font-medium flex-wrap gap-y-2 gap-x-3 sm:gap-x-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Waypoints className="w-5 h-5 text-[#00DDF5] shrink-0" />
                    <span className="break-words">Max 1 en-route stop</span>
                  </div>
                  <div className="hidden min-[420px]:block w-px h-4 bg-slate-700 shrink-0" />
                  <div className="flex items-center gap-2 min-w-0">
                    <Armchair className="w-5 h-5 text-[#00DDF5] shrink-0" />
                    <span className="break-words">Guaranteed comfort</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Women's-Only AeroPool */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'WOMEN_ONLY_POOL'}
                data-testid="ride-category-women-only"
                onClick={() => handleSelectRideType('WOMEN_ONLY_POOL')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectRideType('WOMEN_ONLY_POOL');
                  }
                }}
                className={`w-full p-4 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none ${
                  rideType === 'WOMEN_ONLY_POOL'
                    ? 'border-[#00DDF5] bg-[#0B1930] shadow-[0_0_24px_rgba(0,221,245,0.18)] ring-1 ring-[#00DDF5]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-slate-700 hover:bg-[#0B1930]'
                }`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Badge */}
                  <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-[#00DDF5] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-1 shrink-0" />
                      <h3 className="text-base sm:text-xl font-bold text-white tracking-tight break-normal leading-snug">
                        Women's-Only AeroPool
                      </h3>
                    </div>
                    <span className="self-start min-[400px]:self-center px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold bg-[#142646] border border-cyan-400/40 text-cyan-300 whitespace-nowrap shadow-sm">
                      Women-only shared ride
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 sm:mt-4 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal break-words">
                    Share your airport ride exclusively with other eligible women passengers. Designed to provide an additional choice for women who prefer women-only shared travel.
                  </p>
                </div>

                {/* Safety Details Section */}
                <div className="mt-4 sm:mt-5 pt-3 border-t border-slate-800/80">
                  <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2 text-xs text-slate-200 font-medium">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-[#00DDF5] shrink-0" />
                      <span className="break-words">Women-only passenger matching</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-[#00DDF5] shrink-0" />
                      <span className="break-words">Verified commercial driver</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-[#00DDF5] shrink-0" />
                      <span className="break-words">Driver KYC and required safety checks</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-[#00DDF5] shrink-0" />
                      <span className="break-words">Clear ride and driver details before confirmation</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 italic">
                    Availability confirmed upon match evaluation. No ride is booked until confirmed by matching service.
                  </p>
                </div>
              </div>

              {/* Card 3: Private Airport Taxi */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'PRIVATE'}
                data-testid="ride-category-private"
                onClick={() => handleSelectRideType('PRIVATE')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectRideType('PRIVATE');
                  }
                }}
                className={`w-full p-4 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none ${
                  rideType === 'PRIVATE'
                    ? 'border-[#00DDF5] bg-[#0B1930] shadow-[0_0_24px_rgba(0,221,245,0.18)] ring-1 ring-[#00DDF5]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-slate-700 hover:bg-[#0B1930]'
                }`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Neutral Badge */}
                  <div className="flex flex-col min-[400px]:flex-row min-[400px]:items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <Car className="w-6 h-6 sm:w-7 sm:h-7 text-[#00DDF5] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-1 shrink-0" />
                      <h3 className="text-base sm:text-xl font-bold text-white tracking-tight break-normal leading-snug">
                        Private Airport Taxi
                      </h3>
                    </div>
                    <span className="self-start min-[400px]:self-center px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold bg-[#182844] border border-slate-700 text-slate-300 whitespace-nowrap shadow-sm">
                      Express • Direct
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 sm:mt-4 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal break-words">
                    Dedicated private vehicle with no other passengers. Direct, non-stop transit to your destination.
                  </p>
                </div>

                {/* Bottom Information Row */}
                <div className="mt-4 sm:mt-5 pt-1 flex items-center text-xs sm:text-sm text-slate-200 font-medium">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-5 h-5 text-white/90 shrink-0" />
                    <span className="break-words">Standard airport meter fare applies</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Max Wait Window */}
            {(rideType === 'SHARED_POOL' || rideType === 'WOMEN_ONLY_POOL') && (
              <div className="space-y-3 bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-200">Maximum Acceptable Waiting Window</span>
                  <span className="font-mono text-cyan-300 font-extrabold text-sm">{maxWaitMinutes} minutes</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={35}
                  step={5}
                  value={maxWaitMinutes}
                  onChange={(e) => setMaxWaitMinutes(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>10 mins (Express)</span>
                  <span>20 mins (Standard Optimal)</span>
                  <span>35 mins (Maximum Savings)</span>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-11 px-5 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="h-12 px-8 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-sky-500/25 transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>Find Compatible Matches</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: INTELLIGENT MATCH RESULTS */}
        {step === 4 && (
          <div className="glass-panel border border-slate-800/90 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Step 4 of 5 • Active Pool Matches
              </span>
              <h2 className="text-2xl font-extrabold text-white mt-1 tracking-tight">
                CSMIA {terminal} Departure Pools
              </h2>
            </div>

            {/* Match Safety Banner */}
            <div className="p-4 bg-sky-950/40 border border-sky-500/30 rounded-2xl text-xs text-sky-300 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 shrink-0 text-cyan-400" />
              <span>
                {rideType === 'WOMEN_ONLY_POOL' ? (
                  <>
                    <strong>Women's-Only Verified Pooling:</strong> Only eligible women passengers are matched in this vehicle. Official 4-digit OTP and vehicle details are assigned immediately upon booking.
                  </>
                ) : (
                  <>
                    <strong>Verified Corridor Pooling:</strong> All pools are managed under strict commercial taxi compliance. Official 4-digit OTP and vehicle details are assigned immediately upon booking.
                  </>
                )}
              </span>
            </div>

            {/* Results */}
            {existingDatabaseMatches.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/80 rounded-2xl border border-slate-800 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white tracking-wide">
                    {rideType === 'WOMEN_ONLY_POOL'
                      ? 'NO EXISTING WOMEN-ONLY POOL FOR THIS EXACT WINDOW'
                      : 'NO EXISTING POOL FOR THIS EXACT WINDOW'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    {rideType === 'WOMEN_ONLY_POOL'
                      ? `There are no current verified women flyers departing along ${selectedDestination.corridor} at ${arrivalTime}. You can initiate a new Women's-Only pool as the anchor flyer, or wait within your window!`
                      : `There are no current passengers departing along ${selectedDestination.corridor} at ${arrivalTime}. You can initiate a new pool as the anchor flyer!`}
                  </p>
                </div>

                {anchorCandidate && (
                  <div
                    onClick={() => setSelectedCandidate(anchorCandidate)}
                    className={`p-5 rounded-2xl border text-left cursor-pointer transition max-w-lg mx-auto ${
                      selectedCandidate?.pool.id === anchorCandidate.pool.id
                        ? 'bg-sky-500/15 border-sky-400 ring-1 ring-sky-400 shadow-xl'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {rideType === 'WOMEN_ONLY_POOL'
                          ? "START NEW WOMEN'S-ONLY POOL • ANCHOR PASSENGER"
                          : "START NEW POOL • ANCHOR PASSENGER"}
                      </span>
                      <span className="text-slate-400">Guaranteed Departure</span>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-bold text-white">{anchorCandidate.pool.targetCorridor} Corridor</div>
                        <div className="text-xs text-slate-400">
                          Ready Time: <strong className="text-white">{anchorCandidate.departureWindowDesc}</strong>
                        </div>
                        <div className="text-xs text-cyan-300 flex items-center gap-1.5 pt-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>
                            {rideType === 'WOMEN_ONLY_POOL'
                              ? 'Direct departure — Only verified women co-passengers join your pool automatically'
                              : 'Direct departure — Co-passengers join your pool automatically'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xl font-mono font-extrabold text-white">
                          {formatINR(anchorCandidate.fareQuote.passengerShareFarePaise)}
                        </div>
                        <div className="text-xs text-emerald-400 font-bold flex items-center gap-1 justify-end">
                          <TrendingDown className="w-3 h-3" />
                          <span>Save {formatINR(anchorCandidate.fareQuote.savingsPaise)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {rideType === 'WOMEN_ONLY_POOL' && (
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setSwitchConfirmModal('SHARED_POOL')}
                      className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white transition"
                    >
                      Switch to Shared AeroPool
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwitchConfirmModal('PRIVATE')}
                      className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white transition"
                    >
                      Switch to Private Taxi
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Active Verified Pools ({existingDatabaseMatches.length}):
                </div>
                {existingDatabaseMatches.map((candidate) => {
                  const isSelected = selectedCandidate?.pool.id === candidate.pool.id;
                  return (
                    <div
                      key={candidate.pool.id}
                      onClick={() => setSelectedCandidate(candidate)}
                      className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-sky-500/20 to-cyan-500/10 border-sky-400 ring-1 ring-sky-400 shadow-xl shadow-sky-500/15'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-[10px] font-mono">
                        <span className="px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {candidate.pool.isWomenOnlyPool ? "CONFIRMED WOMEN'S-ONLY POOL" : "CONFIRMED RIDE POOL"}
                        </span>
                        <span className="text-slate-400">
                          {candidate.pool.isWomenOnlyPool
                            ? `${candidate.pool.passengers.length} verified woman co-traveller(s)`
                            : `${candidate.pool.passengers.length} co-traveller(s) joined`}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-white">{candidate.pool.targetCorridor}</span>
                            <span className="text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
                              {candidate.compatibilityScore}% Compatible
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Departure Window: <strong className="text-white">{candidate.departureWindowDesc}</strong>
                          </div>
                          <div className="text-xs text-cyan-300 flex items-center gap-1.5 pt-0.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{candidate.matchReason}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xl font-mono font-extrabold text-white">
                            {formatINR(candidate.fareQuote.passengerShareFarePaise)}
                          </div>
                          <div className="text-xs text-emerald-400 font-bold flex items-center gap-1 justify-end">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>Save {formatINR(candidate.fareQuote.savingsPaise)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                        <div className="flex items-center gap-3">
                          <span>Seats: <strong className="text-white">{candidate.pool.availableSeats} open</strong></span>
                          <span>•</span>
                          <span>Luggage: <strong className="text-white">{candidate.pool.availableLuggage} open</strong></span>
                        </div>
                        <div className="font-mono text-[11px] text-sky-400">
                          Bay: {candidate.pool.pickupZone.name.split('(')[0]}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="h-11 px-5 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={!selectedCandidate}
                onClick={() => setStep(5)}
                className="h-12 px-8 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs rounded-2xl shadow-lg shadow-sky-500/25 transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>Review & Confirm Itinerary</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW & CHECKOUT */}
        {step === 5 && selectedCandidate && (
          <div className="glass-panel border border-slate-800/90 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <span className="text-[11px] font-mono font-bold text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Step 5 of 5 • Final Confirmation
              </span>
              <h2 className="text-2xl font-extrabold text-white mt-1 tracking-tight">
                Review Itinerary & Reserve Seat
              </h2>
            </div>

            {bookingError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{bookingError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRazorpay(true)}
                  className="px-3 py-1 bg-rose-500/20 text-rose-300 rounded-lg text-xs font-bold hover:bg-rose-500/30 transition"
                >
                  Retry Payment
                </button>
              </div>
            )}

            {/* Map Preview */}
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-sky-400" />
                <span>Authorized Route Polyline</span>
              </div>
              <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
                <InteractiveMap
                  pickupZone={selectedCandidate.pool.pickupZone}
                  destination={selectedDestination}
                  interactiveSelection={false}
                  heightClass="h-56 sm:h-64"
                />
              </div>
            </div>

            {/* Itinerary Summary Card */}
            <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-800/80">
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Ride Category</div>
                  <div className="text-sm font-bold text-white mt-0.5 flex items-center gap-1.5">
                    {selectedCandidate.pool.isWomenOnlyPool || rideType === 'WOMEN_ONLY_POOL' ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span className="text-cyan-300">Women's-Only AeroPool</span>
                      </>
                    ) : rideType === 'PRIVATE' ? (
                      <>
                        <Car className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>Private Airport Taxi</span>
                      </>
                    ) : (
                      <>
                        <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>Shared AeroPool</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Flight Number</div>
                  <div className="text-base font-extrabold text-white font-mono mt-0.5">{flightDetails.flightNumber}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-800/80">
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Pickup Bay</div>
                  <div className="text-sm font-bold text-cyan-300 mt-0.5">{selectedCandidate.pool.pickupZone.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Corridor</div>
                  <div className="text-sm font-bold text-white mt-0.5">{selectedDestination.corridor}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-800/80">
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Destination</div>
                  <div className="text-sm font-bold text-white mt-0.5">{selectedDestination.name}</div>
                  <div className="text-xs text-slate-400 truncate">{selectedDestination.address}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Seat / Luggage</div>
                  <div className="text-xs font-bold text-white mt-0.5">
                    {passengerCount} Seat(s) • {luggageCount} Bag(s)
                  </div>
                </div>
              </div>

              {/* Fare Breakdown */}
              <div className="space-y-2 text-xs text-slate-400 pt-1">
                <div className="flex justify-between">
                  <span>Base & Distance Fare:</span>
                  <span className="font-mono text-slate-200">
                    {formatINR(selectedCandidate.fareQuote.baseFarePaise + selectedCandidate.fareQuote.distanceFarePaise)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>CSMIA Airport Parking & Toll Pass-Through:</span>
                  <span className="font-mono text-slate-200">
                    {formatINR(selectedCandidate.fareQuote.airportTollPaise)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Platform Coordination Fee:</span>
                  <span className="font-mono text-slate-200">
                    {formatINR(selectedCandidate.fareQuote.platformFeePaise)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>GST (5%):</span>
                  <span className="font-mono text-slate-200">
                    {formatINR(selectedCandidate.fareQuote.gstPaise)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-white pt-3 border-t border-slate-800">
                  <span>Total Payable:</span>
                  <span className="font-mono text-cyan-300 text-lg">
                    {formatINR(selectedCandidate.fareQuote.passengerShareFarePaise, true)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="h-11 px-5 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Change Pool</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowRazorpay(true)}
                className="h-12 px-8 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs rounded-2xl shadow-xl shadow-sky-500/25 transition active:scale-[0.98] flex items-center gap-2"
              >
                <span>Proceed to Pay {formatINR(selectedCandidate.fareQuote.passengerShareFarePaise)}</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Voluntary Verification & Opt-In Modal */}
      {showWomenOnlyModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowWomenOnlyModal(false);
          }}
        >
          <div className="bg-[#0B1930] border border-cyan-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-cyan-500/10 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Women's-Only AeroPool</h3>
                  <span className="text-[11px] font-mono font-bold text-cyan-300 uppercase">Voluntary Passenger Verification</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWomenOnlyModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Women's-Only AeroPool is dedicated to eligible women passengers for airport transit. All co-passengers in this pool are verified women flyers travelling along the same corridor.
            </p>

            <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2.5 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>Shared exclusively with other eligible women flyers</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>Commercial taxi driver with verified KYC credentials</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>Full transparency of ride and driver details before trip starts</span>
              </div>
            </div>

            <label className="flex items-start gap-3 p-3.5 bg-slate-900/60 rounded-2xl border border-cyan-500/20 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={womenOnlySelfDeclaration}
                onChange={(e) => setWomenOnlySelfDeclaration(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-cyan-400 focus:ring-cyan-400 focus:ring-offset-0 bg-slate-950"
              />
              <span className="text-xs text-slate-200 leading-relaxed font-medium">
                I confirm that I am an eligible woman passenger and voluntarily opt in to Women-Only shared airport pooling.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWomenOnlyModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!womenOnlySelfDeclaration}
                onClick={() => {
                  womenOnlyService.optInPassenger({
                    passengerId: currentUser.id,
                    passengerName: currentUser.fullName,
                    passengerPhone: currentUser.phone,
                    selfDeclarationConfirmed: true,
                  });
                  setRideType('WOMEN_ONLY_POOL');
                  setShowWomenOnlyModal(false);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 shadow-lg shadow-cyan-500/20 transition"
              >
                Confirm & Select
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch Category Explicit Confirmation Modal */}
      {switchConfirmModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSwitchConfirmModal(null);
          }}
        >
          <div className="bg-[#0B1930] border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Confirm Ride Category Switch</h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  You are currently selected for <strong>Women's-Only AeroPool</strong>. Switching will move your booking to{' '}
                  <strong>{switchConfirmModal === 'SHARED_POOL' ? 'Shared AeroPool (mixed-gender pool)' : 'Private Airport Taxi (dedicated solo ride)'}</strong>.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-slate-200">Category Details:</div>
              <div className="text-slate-400">
                {switchConfirmModal === 'SHARED_POOL'
                  ? 'Shared AeroPool pairs you with verified co-passengers of any gender along your destination corridor.'
                  : 'Private Airport Taxi provides non-stop direct transit in a private vehicle at standard meter fares.'}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSwitchConfirmModal(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                Keep Women's-Only
              </button>
              <button
                type="button"
                onClick={() => {
                  setRideType(switchConfirmModal);
                  setSwitchConfirmModal(null);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20 transition"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Razorpay Test Mode Checkout Modal */}
      {selectedCandidate && (
        <RazorpayModal
          isOpen={showRazorpay}
          amountPaise={selectedCandidate.fareQuote.passengerShareFarePaise}
          passengerName={currentUser.fullName}
          passengerPhone={currentUser.phone}
          destinationName={selectedDestination.name}
          bookingId={`book_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`}
          onSuccess={handlePaymentSuccess}
          onClose={() => setShowRazorpay(false)}
        />
      )}
    </div>
  );
};
