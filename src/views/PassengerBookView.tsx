import React, { useState, useEffect } from 'react';
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
  CheckCircle2,
  AlertCircle,
  Car
} from 'lucide-react';
import { db } from '../services/db';
import { MUMBAI_DESTINATIONS, PICKUP_ZONES, TERMINALS } from '../services/geoService';
import { POPULAR_CSMIA_FLIGHTS, lookupCSMIAFlight } from '../services/flightService';
import { evaluatePoolMatches, PoolMatchCandidate } from '../services/matchingEngine';
import { calculateRideFare, formatINR } from '../services/pricingEngine';
import { DestinationPoint, FlightDetails, RidePool } from '../types';
import { RazorpayModal } from '../components/RazorpayModal';

interface PassengerBookViewProps {
  onNavigate: (route: string) => void;
  onBookingCreated: (bookingId: string) => void;
}

export const PassengerBookView: React.FC<PassengerBookViewProps> = ({
  onNavigate,
  onBookingCreated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form State
  const [flightQuery, setFlightQuery] = useState('6E 5312');
  const [flightDetails, setFlightDetails] = useState<FlightDetails>(POPULAR_CSMIA_FLIGHTS[0]);
  const [isLookingUpFlight, setIsLookingUpFlight] = useState(false);
  const [terminal, setTerminal] = useState<'T1' | 'T2'>('T2');
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [arrivalTime, setArrivalTime] = useState(
    new Date(Date.now() + 60 * 60 * 1000).toTimeString().substring(0, 5)
  );
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(1);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Step 2: Destination
  const [destSearch, setDestSearch] = useState('');
  const [selectedDestId, setSelectedDestId] = useState<string>(MUMBAI_DESTINATIONS[0].id);
  const selectedDestination = MUMBAI_DESTINATIONS.find((d) => d.id === selectedDestId) || MUMBAI_DESTINATIONS[0];

  // Step 3: Preferences
  const [rideType, setRideType] = useState<'SHARED_POOL' | 'PRIVATE'>('SHARED_POOL');
  const [maxWaitMinutes, setMaxWaitMinutes] = useState(20);

  // Step 4: Matches
  const [matchCandidates, setMatchCandidates] = useState<PoolMatchCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<PoolMatchCandidate | null>(null);

  // Step 5: Checkout & Razorpay
  const [showRazorpay, setShowRazorpay] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const currentUser = db.getState().currentUser;

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
        pickupZoneId: PICKUP_ZONES.find((z) => z.terminalCode === terminal)?.id || PICKUP_ZONES[0].id,
        flightDetails,
        destination: selectedDestination,
        seatsNeeded: passengerCount,
        luggageCount,
        maxWaitMinutes,
        readyTimeIso,
      });

      // Build synthetic candidate for initiating a brand new pool or private ride
      const sharedQuote = calculateRideFare(selectedDestination, passengerCount, 'SHARED_POOL', 2);
      const privateQuote = calculateRideFare(selectedDestination, passengerCount, 'PRIVATE', 1);

      const newPoolCandidate: PoolMatchCandidate = {
        pool: {
          id: rideType === 'PRIVATE' ? 'new-pool-private' : 'new-pool-initiate',
          airportCode: 'BOM',
          terminal,
          pickupZone: PICKUP_ZONES.find((z) => z.terminalCode === terminal) || PICKUP_ZONES[0],
          targetCorridor: selectedDestination.corridor,
          departureWindowStart: readyTimeIso,
          departureWindowEnd: new Date(new Date(readyTimeIso).getTime() + maxWaitMinutes * 60000).toISOString(),
          vehicleCategory: passengerCount > 2 ? 'XL' : 'Sedan',
          totalSeats: 4,
          availableSeats: 4 - passengerCount,
          totalLuggageCapacity: 3,
          availableLuggage: 3 - luggageCount,
          status: 'CONFIRMED',
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
        fareQuote: rideType === 'PRIVATE' ? privateQuote : sharedQuote,
        departureWindowDesc: `${arrivalTime} (Anchor Departure)`,
        matchReason: `Optimal direct route along ${selectedDestination.corridor} — Start new pool as anchor passenger`,
        isCompatible: true,
      };

      if (existingMatches.length > 0) {
        // Show active pools first, plus option to initiate fresh pool
        setMatchCandidates([...existingMatches, newPoolCandidate]);
        setSelectedCandidate(existingMatches[0]);
      } else {
        // No existing active pool matches: offer new pool initiation or private ride
        setMatchCandidates([newPoolCandidate]);
        setSelectedCandidate(newPoolCandidate);
      }
    }
  }, [step, terminal, selectedDestination, passengerCount, luggageCount, maxWaitMinutes, flightDetails, arrivalDate, arrivalTime, rideType]);

  // Handle Payment Success
  const handlePaymentSuccess = (paymentDetails: {
    paymentId: string;
    orderId: string;
    method: 'UPI' | 'Card' | 'Netbanking';
  }) => {
    setShowRazorpay(false);
    setIsSubmitting(true);
    setBookingError(null);

    if (!selectedCandidate) return;

    // Record the ride request in the persistent database
    db.createRideRequest({
      id: `req-${Date.now()}`,
      passengerId: currentUser.id,
      passengerName: currentUser.fullName,
      passengerPhone: currentUser.phone,
      flightDetails,
      pickupZoneId: PICKUP_ZONES.find((z) => z.terminalCode === terminal)?.id || PICKUP_ZONES[0].id,
      destination: selectedDestination,
      seatsNeeded: passengerCount,
      luggageCount,
      maxWaitMinutes,
      rideType,
      createdAt: new Date().toISOString(),
      status: 'MATCHED',
    });

    let bookResult;
    if (selectedCandidate.pool.id.startsWith('new-pool-')) {
      // Initiate a new pool atomically
      const readyDate = new Date(`${arrivalDate}T${arrivalTime}:00`);
      const readyTimeIso = !isNaN(readyDate.getTime()) ? readyDate.toISOString() : new Date().toISOString();

      bookResult = db.createPoolAndBookAtomic({
        terminal,
        pickupZoneId: PICKUP_ZONES.find((z) => z.terminalCode === terminal)?.id || PICKUP_ZONES[0].id,
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
        paymentMethod: paymentDetails.method,
      });
    } else {
      // Book into existing pool atomically
      bookResult = db.bookRideAtomic({
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
      });
    }

    setIsSubmitting(false);

    if (bookResult.success && bookResult.booking) {
      onBookingCreated(bookResult.booking.id);
      onNavigate(`/app/track/${bookResult.booking.id}`);
    } else {
      setBookingError(bookResult.error || 'Failed to complete booking');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Progress Wizard Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 sm:gap-4 overflow-x-auto">
            <span className={`font-semibold flex items-center gap-1 ${step >= 1 ? 'text-sky-400' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">1</span>
              <span>Flight</span>
            </span>
            <span className="text-slate-700">→</span>
            <span className={`font-semibold flex items-center gap-1 ${step >= 2 ? 'text-sky-400' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">2</span>
              <span>Destination</span>
            </span>
            <span className="text-slate-700">→</span>
            <span className={`font-semibold flex items-center gap-1 ${step >= 3 ? 'text-sky-400' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">3</span>
              <span>Preferences</span>
            </span>
            <span className="text-slate-700">→</span>
            <span className={`font-semibold flex items-center gap-1 ${step >= 4 ? 'text-sky-400' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">4</span>
              <span>Matches</span>
            </span>
            <span className="text-slate-700">→</span>
            <span className={`font-semibold flex items-center gap-1 ${step >= 5 ? 'text-sky-400' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">5</span>
              <span>Confirm</span>
            </span>
          </div>

          <button
            onClick={() => onNavigate('/app')}
            className="text-slate-400 hover:text-white text-xs font-medium ml-2"
          >
            Cancel
          </button>
        </div>

        {/* STEP 1: FLIGHT & PASSENGERS */}
        {step === 1 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-in fade-in">
            <div>
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">Step 1 of 5</span>
              <h2 className="text-xl font-bold text-white mt-1">Flight Details & Passenger Group</h2>
              <p className="text-xs text-slate-400 mt-1">
                We monitor CSMIA touchdown times to coordinate pickup precisely when you collect your baggage.
              </p>
            </div>

            {/* Flight Search Input */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Incoming Flight Number</label>
              <div className="relative">
                <input
                  type="text"
                  value={flightQuery}
                  onChange={(e) => handleFlightSearch(e.target.value)}
                  placeholder="e.g. 6E 5312, AI 678, UK 955, QP 1332"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white font-mono uppercase focus:outline-none focus:border-sky-500"
                />
                {isLookingUpFlight && (
                  <span className="absolute right-3 top-3 text-xs text-sky-400 animate-pulse">Checking CSMIA...</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-400">
                <span>Quick select:</span>
                {POPULAR_CSMIA_FLIGHTS.slice(0, 4).map((f) => (
                  <button
                    key={f.flightNumber}
                    type="button"
                    onClick={() => handleFlightSearch(f.flightNumber)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-mono transition"
                  >
                    {f.flightNumber}
                  </button>
                ))}
              </div>
            </div>

            {/* Detected Flight Card */}
            {flightDetails && (
              <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm">
                    <Plane className="w-5 h-5 -rotate-45" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span>{flightDetails.airline} {flightDetails.flightNumber}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {flightDetails.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {flightDetails.origin} → Mumbai CSMIA ({flightDetails.terminal})
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Terminal</div>
                  <div className="text-sm font-bold text-sky-400">{terminal}</div>
                </div>
              </div>
            )}

            {/* Arrival Date, Time, and Terminal Choice */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Arrival Date</span>
                </label>
                <input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Estimated Touchdown</span>
                </label>
                <input
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">CSMIA Terminal</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTerminal('T1')}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      terminal === 'T1'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    T1 (Dom)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTerminal('T2')}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      terminal === 'T2'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    T2 (Intl/Dom)
                  </button>
                </div>
              </div>
            </div>

            {/* Passenger and Luggage count */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-400" />
                  <span>Passengers</span>
                </label>
                <select
                  value={passengerCount}
                  onChange={(e) => setPassengerCount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                >
                  <option value={1}>1 Seat (Solo Traveller)</option>
                  <option value={2}>2 Seats (Couple / Friends)</option>
                  <option value={3}>3 Seats (Small Group)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-sky-400" />
                  <span>Check-in Luggage</span>
                </label>
                <select
                  value={luggageCount}
                  onChange={(e) => setLuggageCount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white"
                >
                  <option value={1}>1 Bag (Up to 23 kg)</option>
                  <option value={2}>2 Bags</option>
                  <option value={3}>3 Bags</option>
                </select>
              </div>
            </div>

            {validationError && (
              <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleStep1Submit}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <span>Continue to Destination</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: DESTINATION */}
        {step === 2 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-in fade-in">
            <div>
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">Step 2 of 5</span>
              <h2 className="text-xl font-bold text-white mt-1">Select Drop-Off Corridor & Destination</h2>
              <p className="text-xs text-slate-400 mt-1">
                Choose your Mumbai destination to cluster with co-passengers travelling down the same route.
              </p>
            </div>

            {/* Destination Search Box */}
            <div className="relative">
              <input
                type="text"
                value={destSearch}
                onChange={(e) => setDestSearch(e.target.value)}
                placeholder="Search Mumbai destination (e.g., Bandra, BKC, Powai, Colaba)..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Destination Selection Cards */}
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {MUMBAI_DESTINATIONS.filter(
                (d) =>
                  !destSearch.trim() ||
                  d.name.toLowerCase().includes(destSearch.toLowerCase()) ||
                  d.corridor.toLowerCase().includes(destSearch.toLowerCase())
              ).map((dest) => {
                const isSelected = dest.id === selectedDestId;
                return (
                  <div
                    key={dest.id}
                    onClick={() => setSelectedDestId(dest.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white">{dest.name}</div>
                        <div className="text-[11px] text-slate-400">{dest.corridor}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-semibold text-slate-300">{dest.distanceKmFromCSMIA} km</div>
                      <div className="text-[10px] text-slate-400">~{dest.estMinutesFromCSMIA} mins from BOM</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <span>Continue to Preferences</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RIDE PREFERENCES */}
        {step === 3 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-in fade-in">
            <div>
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">Step 3 of 5</span>
              <h2 className="text-xl font-bold text-white mt-1">Ride Pooling Preferences</h2>
              <p className="text-xs text-slate-400 mt-1">
                Customize maximum waiting window and sharing comfort.
              </p>
            </div>

            {/* Ride Type Option */}
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => setRideType('SHARED_POOL')}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  rideType === 'SHARED_POOL'
                    ? 'bg-sky-500/10 border-sky-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">Shared AeroPool</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                    SAVE ~38%
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Share a commercial taxi with 1–2 verified flyers heading towards {selectedDestination.name.split('(')[0]}.
                </p>
              </div>

              <div
                onClick={() => setRideType('PRIVATE')}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  rideType === 'PRIVATE'
                    ? 'bg-sky-500/10 border-sky-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">Dedicated Private Cab</span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    DIRECT
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Direct departure with zero stops for other passengers. Standard airport taxi benchmark rates apply.
                </p>
              </div>
            </div>

            {/* Max Wait Window */}
            {rideType === 'SHARED_POOL' && (
              <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Max Acceptable Waiting Window</span>
                  <span className="font-mono text-sky-400 font-bold">{maxWaitMinutes} minutes</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={35}
                  step={5}
                  value={maxWaitMinutes}
                  onChange={(e) => setMaxWaitMinutes(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>10 mins (Urgent)</span>
                  <span>20 mins (Standard)</span>
                  <span>35 mins (Max Savings)</span>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                onClick={() => setStep(4)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <span>Find Compatible Matches</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: INTELLIGENT MATCH RESULTS */}
        {step === 4 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-in fade-in">
            <div>
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">Step 4 of 5</span>
              <h2 className="text-xl font-bold text-white mt-1">Available Ride Pools at CSMIA {terminal}</h2>
              <p className="text-xs text-slate-400 mt-1">
                Ranked by our multi-factor matching engine based on route proximity, arrival time, and minimal detour.
              </p>
            </div>

            {/* Estimated Match Disclaimer Banner */}
            <div className="p-3 bg-sky-950/40 border border-sky-500/30 rounded-xl text-xs text-sky-300 flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0 text-sky-400" />
              <span>
                <strong>Estimated Matches:</strong> Fares and departure windows are calculated based on your flight touchdown and corridor compatibility. Official OTP and vehicle allocation are locked upon instant reservation.
              </span>
            </div>

            {matchCandidates.length === 0 ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">No Direct Matches Right Now</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No existing pool fits your exact departure window. You can initiate a new pool or book a direct vehicle.
                </p>
                <button
                  onClick={() => setRideType('PRIVATE')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg transition"
                >
                  Switch to Private Direct Ride
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {matchCandidates.map((candidate) => {
                  const isSelected = selectedCandidate?.pool.id === candidate.pool.id;
                  const isNewPool = candidate.pool.id.startsWith('new-pool-initiate');
                  const isPrivate = candidate.pool.id.startsWith('new-pool-private');
                  return (
                    <div
                      key={candidate.pool.id}
                      onClick={() => setSelectedCandidate(candidate)}
                      className={`p-4 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-sky-500/10 border-sky-500 ring-1 ring-sky-500/50 shadow-xl'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Type Indicator */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60 text-[10px] font-mono">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            isPrivate
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : isNewPool
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {isPrivate
                            ? 'DEDICATED PRIVATE CAB • DIRECT'
                            : isNewPool
                            ? 'START NEW SHARED POOL • ANCHOR PASSENGER'
                            : 'ACTIVE POOLED CAB • SEATS IN PROGRESS'}
                        </span>
                        <span className="text-slate-400">
                          {isPrivate ? 'No Co-passengers' : isNewPool ? 'First Flyer to Book' : `${candidate.pool.passengers.length} co-passengers joined`}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">{candidate.pool.targetCorridor}</span>
                            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              {candidate.compatibilityScore}% Compatibility
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Departure Window: <strong className="text-slate-200">{candidate.departureWindowDesc}</strong>
                          </div>
                          <div className="text-[11px] text-sky-400 flex items-center gap-1.5 pt-0.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{candidate.matchReason}</span>
                          </div>
                        </div>

                        {/* Price Display */}
                        <div className="text-right">
                          <div className="text-lg font-mono font-extrabold text-white">
                            {formatINR(candidate.fareQuote.passengerShareFarePaise)}
                          </div>
                          <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 justify-end">
                            <TrendingDown className="w-3 h-3" />
                            <span>Save {formatINR(candidate.fareQuote.savingsPaise)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Pool Occupancy & Luggage Meter */}
                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center gap-3">
                          <span>
                            Seats Available:{' '}
                            <strong className="text-white">{candidate.pool.availableSeats} of {candidate.pool.totalSeats}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Luggage Space:{' '}
                            <strong className="text-white">{candidate.pool.availableLuggage} bags</strong>
                          </span>
                        </div>
                        <div className="text-slate-400 font-mono text-[10px]">
                          Pickup: {candidate.pool.pickupZone.name.split('(')[0]}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                disabled={!selectedCandidate}
                onClick={() => setStep(5)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2"
              >
                <span>Review & Confirm Booking</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW & CHECKOUT */}
        {step === 5 && selectedCandidate && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 animate-in fade-in">
            <div>
              <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-widest">Step 5 of 5</span>
              <h2 className="text-xl font-bold text-white mt-1">Review Booking & Secure Payment</h2>
              <p className="text-xs text-slate-400 mt-1">
                Verify trip itinerary and pickup instructions prior to instant seat reservation.
              </p>
            </div>

            {/* Error Banner */}
            {bookingError && (
              <div className="p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            {/* Itinerary Summary Card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-xs text-slate-400">Arriving Flight</div>
                  <div className="text-sm font-bold text-white font-mono">{flightDetails.flightNumber}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Terminal & Pickup Bay</div>
                  <div className="text-sm font-bold text-sky-400">{selectedCandidate.pool.pickupZone.name}</div>
                </div>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-xs text-slate-400">Drop-off Destination</div>
                  <div className="text-sm font-bold text-white">{selectedDestination.name}</div>
                  <div className="text-[11px] text-slate-400">{selectedDestination.address}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Passenger Count</div>
                  <div className="text-xs font-semibold text-white">{passengerCount} Seat(s), {luggageCount} Bag(s)</div>
                </div>
              </div>

              {/* Fare Breakdown in Integer Paise */}
              <div className="space-y-1.5 text-xs text-slate-400 pt-1">
                <div className="flex justify-between">
                  <span>Base & Distance Fare:</span>
                  <span className="font-mono text-slate-200">
                    {formatINR(selectedCandidate.fareQuote.baseFarePaise + selectedCandidate.fareQuote.distanceFarePaise)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>CSMIA Airport Parking / Toll Share:</span>
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
                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                  <span>Total Payable:</span>
                  <span className="font-mono text-sky-400">
                    {formatINR(selectedCandidate.fareQuote.passengerShareFarePaise, true)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => setStep(4)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Change Pool</span>
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => setShowRazorpay(true)}
                className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-xs rounded-xl shadow-xl shadow-blue-600/30 transition flex items-center gap-2"
              >
                <span>Proceed to Pay {formatINR(selectedCandidate.fareQuote.passengerShareFarePaise)}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Razorpay Sandbox Checkout Modal */}
      {selectedCandidate && (
        <RazorpayModal
          isOpen={showRazorpay}
          amountPaise={selectedCandidate.fareQuote.passengerShareFarePaise}
          passengerName={currentUser.fullName}
          passengerPhone={currentUser.phone}
          destinationName={selectedDestination.name}
          onSuccess={handlePaymentSuccess}
          onClose={() => setShowRazorpay(false)}
        />
      )}
    </div>
  );
};
