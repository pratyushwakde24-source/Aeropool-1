import React, { useState, useEffect, useRef } from 'react';
import {
  Plane,
  MapPin,
  Calendar,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Car,
  Headphones,
  Sparkles,
  ArrowRight,
  X,
  Check,
  Percent,
  Clock,
  Navigation
} from 'lucide-react';
import { MUMBAI_DESTINATIONS, PICKUP_ZONES, TERMINALS } from '../services/geoService';
import { POPULAR_CSMIA_FLIGHTS, lookupCSMIAFlight } from '../services/flightService';
import { searchDestinationPlaces, PlaceSuggestion } from '../services/mapProviderService';
import { calculateRideFare, formatINR } from '../services/pricingEngine';
import { DestinationPoint, FlightDetails, PickupZone } from '../types';
import { HeroCarousel } from '../components/HeroCarousel';

interface LandingViewProps {
  onNavigate: (route: string) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
  // Booking Form State
  const [selectedTerminal, setSelectedTerminal] = useState<'T1' | 'T2'>('T2');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('pz-t2-p4-east');
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);

  // Destination State
  const [destinationSearch, setDestinationSearch] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<DestinationPoint | null>(null);
  const [destinationModalOpen, setDestinationModalOpen] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  // Flight State
  const [flightModalOpen, setFlightModalOpen] = useState(false);
  const [flightNumberInput, setFlightNumberInput] = useState('');
  const [selectedFlight, setSelectedFlight] = useState<FlightDetails | null>(null);
  const [isSearchingFlight, setIsSearchingFlight] = useState(false);
  const [flightSearchError, setFlightSearchError] = useState<string | null>(null);

  // Passenger State
  const [passengerCount, setPassengerCount] = useState<number>(1);
  const [passengerDropdownOpen, setPassengerDropdownOpen] = useState(false);

  // Savings / Promo Modal State
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);

  // Booking Card Ref for Smooth Scroll CTAs
  const bookingCardRef = useRef<HTMLDivElement>(null);
  const handleScrollToBooking = () => {
    bookingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Available pickup zones for current terminal
  const currentZones = PICKUP_ZONES.filter((z) => z.terminalCode === selectedTerminal);
  const activeZone = currentZones.find((z) => z.id === selectedZoneId) || currentZones[0];

  // Destination autocomplete search
  useEffect(() => {
    let active = true;
    if (destinationSearch.trim().length >= 2) {
      setIsSearchingPlaces(true);
      searchDestinationPlaces(destinationSearch)
        .then((results) => {
          if (active) {
            setPlaceSuggestions(results);
            setIsSearchingPlaces(false);
          }
        })
        .catch(() => {
          if (active) {
            setPlaceSuggestions([]);
            setIsSearchingPlaces(false);
          }
        });
    } else {
      setPlaceSuggestions([]);
      setIsSearchingPlaces(false);
    }
    return () => {
      active = false;
    };
  }, [destinationSearch]);

  const handleSelectSuggestion = (item: PlaceSuggestion) => {
    const dest: DestinationPoint = {
      id: item.id,
      name: item.name,
      corridor: item.corridor,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
      distanceKmFromCSMIA: item.distanceKm,
      estMinutesFromCSMIA: item.estMinutes,
    };
    setSelectedDestination(dest);
    setDestinationModalOpen(false);
    setDestinationSearch('');
  };

  const handleSelectPresetDestination = (dest: DestinationPoint) => {
    setSelectedDestination(dest);
    setDestinationModalOpen(false);
    setDestinationSearch('');
  };

  const handleFlightLookup = async (code: string) => {
    if (!code.trim()) return;
    setIsSearchingFlight(true);
    setFlightSearchError(null);
    try {
      const flight = await lookupCSMIAFlight(code);
      if (flight) {
        setSelectedFlight(flight);
        if (flight.terminal === 'T1' || flight.terminal === 'T2') {
          setSelectedTerminal(flight.terminal);
          const zones = PICKUP_ZONES.filter((z) => z.terminalCode === flight.terminal);
          if (zones.length > 0) setSelectedZoneId(zones[0].id);
        }
        setFlightModalOpen(false);
      } else {
        setFlightSearchError('Flight not found in today\'s CSMIA schedule. You can still proceed without flight tracking.');
      }
    } catch {
      setFlightSearchError('Unable to check flight schedule. Please try again.');
    } finally {
      setIsSearchingFlight(false);
    }
  };

  // Main Booking CTA
  const handleFindPoolRide = () => {
    const dest = selectedDestination || MUMBAI_DESTINATIONS[0];
    const pendingData = {
      terminal: selectedTerminal,
      pickupZoneId: activeZone?.id || 'pz-t2-p4-east',
      destination: dest,
      flightDetails: selectedFlight,
      passengerCount,
    };
    try {
      sessionStorage.setItem('aeropool_pending_booking', JSON.stringify(pendingData));
    } catch {
      // ignore
    }
    onNavigate('/app/book');
  };

  // Default display destination (Bandra BKC fallback benchmark)
  const previewDest = selectedDestination || MUMBAI_DESTINATIONS[0];
  const fareBreakdown = calculateRideFare(previewDest, passengerCount, 'SHARED_POOL', 2);

  return (
    <div className="min-h-screen bg-[#07101F] text-[#F8FAFC] pb-24 lg:pb-12 selection:bg-[#00DDF5] selection:text-[#07101F]">
      {/* Container: Centered on larger screens, full-width on mobile */}
      <div className="max-w-md mx-auto lg:max-w-4xl px-4 sm:px-6 pt-2">
        {/* =========================================================================
            1. HERO PROMOTIONAL CAROUSEL (4 Multi-Slide Experience with Auto-Rotation)
           ========================================================================= */}
        <HeroCarousel
          onNavigate={onNavigate}
          onOpenSavingsModal={() => setSavingsModalOpen(true)}
          onScrollToBooking={handleScrollToBooking}
        />

        {/* =========================================================================
            2. MAIN BOOKING CARD (Pickup + Drop + Dual Row + Find a Pool Ride CTA)
           ========================================================================= */}
        <section
          ref={bookingCardRef}
          id="booking-card"
          className="mt-4 bg-[#0D1D35]/95 backdrop-blur-xl border border-[rgba(75,150,220,0.25)] rounded-3xl p-4 sm:p-5 shadow-2xl relative z-30 scroll-mt-4"
        >
          <div className="space-y-3">
            {/* Row 1: Pickup (Airport) */}
            <button
              type="button"
              onClick={() => setTerminalModalOpen(true)}
              className="w-full bg-[#0B1728]/95 hover:bg-[#11243f] border border-[rgba(75,150,220,0.2)] rounded-2xl p-3.5 flex items-center justify-between transition group text-left focus:outline-none focus:border-[#00DDF5]/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-200 group-hover:text-white transition">
                  <Plane className="w-4 h-4 -rotate-45" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-[#A8B5CA] tracking-wide">Pickup (Airport)</div>
                  <div className="text-sm font-semibold text-white tracking-tight">
                    CSMIA – {selectedTerminal === 'T2' ? 'Terminal 2' : 'Terminal 1'}
                  </div>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition-transform group-hover:translate-y-0.5" />
            </button>

            {/* Vertical Dotted Connector Line between Pickup and Dropoff */}
            <div className="flex items-center pl-7 -my-1.5">
              <div className="h-4 w-px border-l-2 border-dashed border-slate-600" />
            </div>

            {/* Row 2: Drop to */}
            <button
              type="button"
              onClick={() => setDestinationModalOpen(true)}
              className="w-full bg-[#0B1728]/95 hover:bg-[#11243f] border border-[rgba(75,150,220,0.2)] rounded-2xl p-3.5 flex items-center justify-between transition group text-left focus:outline-none focus:border-[#00DDF5]/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-sky-950/60 border border-[#00DDF5]/30 flex items-center justify-center text-[#00DDF5] group-hover:scale-105 transition-transform shrink-0">
                  <MapPin className="w-4 h-4 fill-[#00DDF5]/20" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-[#A8B5CA] tracking-wide">Drop to</div>
                  <div className={`text-sm font-semibold tracking-tight truncate ${selectedDestination ? 'text-white' : 'text-[#A8B5CA]'}`}>
                    {selectedDestination ? selectedDestination.name : 'Enter your destination'}
                  </div>
                </div>
              </div>
              <Search className="w-4 h-4 text-slate-400 group-hover:text-[#00DDF5] transition shrink-0 ml-2" />
            </button>

            {/* Row 3: Dual Cards (Flight Details + Passengers) */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* Card A: Flight Details */}
              <button
                type="button"
                onClick={() => setFlightModalOpen(true)}
                className="bg-[#0B1728]/95 hover:bg-[#11243f] border border-[rgba(75,150,220,0.2)] rounded-2xl p-3 flex items-center gap-2.5 transition text-left focus:outline-none focus:border-[#00DDF5]/50 group"
              >
                <div className="w-7 h-7 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-400 group-hover:text-slate-200 shrink-0">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-medium text-[#A8B5CA] truncate">Flight Details</div>
                  <div className="text-xs font-semibold text-white truncate">
                    {selectedFlight ? `${selectedFlight.flightNumber}` : 'Add flight (optional)'}
                  </div>
                </div>
              </button>

              {/* Card B: Passengers */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPassengerDropdownOpen(!passengerDropdownOpen)}
                  className="w-full bg-[#0B1728]/95 hover:bg-[#11243f] border border-[rgba(75,150,220,0.2)] rounded-2xl p-3 flex items-center justify-between transition text-left focus:outline-none focus:border-[#00DDF5]/50 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-400 group-hover:text-slate-200 shrink-0">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium text-[#A8B5CA] truncate">Passengers</div>
                      <div className="text-xs font-semibold text-white truncate">
                        {passengerCount} {passengerCount === 1 ? 'passenger' : 'passengers'}
                      </div>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition shrink-0 ml-1" />
                </button>

                {/* Passenger Count Dropdown */}
                {passengerDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setPassengerDropdownOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 mt-2 w-44 bg-[#0B1728] border border-[rgba(75,150,220,0.3)] rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95">
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => {
                            setPassengerCount(num);
                            setPassengerDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
                            passengerCount === num
                              ? 'bg-[#00DDF5]/15 text-[#00DDF5] font-bold'
                              : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                          }`}
                        >
                          <span>{num} {num === 1 ? 'Passenger' : 'Passengers'}</span>
                          {passengerCount === num && <Check className="w-3.5 h-3.5 text-[#00DDF5]" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Main CTA Button: Find a Pool Ride */}
            <div className="pt-1.5">
              <button
                type="button"
                onClick={handleFindPoolRide}
                className="w-full bg-[#00DDF5] hover:bg-[#20e4fa] active:scale-[0.98] text-[#07101F] font-extrabold text-sm sm:text-base py-3.5 px-6 rounded-2xl shadow-lg shadow-[#00DDF5]/20 flex items-center justify-center gap-2 transition"
              >
                <span>Find a Pool Ride</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </section>

        {/* =========================================================================
            3. FOUR QUICK ACCESS CARDS (How It Works, Safety & KYC, Fleet Partner, Support)
           ========================================================================= */}
        <section className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          {/* 1. How It Works */}
          <button
            type="button"
            onClick={() => onNavigate('/how-it-works')}
            className="bg-[#0D1D35]/85 hover:bg-[#13243D] border border-[rgba(75,150,220,0.2)] rounded-2xl p-2 min-[380px]:p-3 flex flex-col items-center justify-center text-center transition group shadow-sm active:scale-95 focus:outline-none"
          >
            <div className="w-7 h-7 min-[380px]:w-8 min-[380px]:h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 group-hover:bg-sky-500/20 transition-transform">
              <Plane className="w-3.5 h-3.5 min-[380px]:w-4 min-[380px]:h-4 -rotate-45" />
            </div>
            <span className="text-[10px] min-[380px]:text-[11px] font-medium text-slate-200 mt-1.5 min-[380px]:mt-2 leading-tight">
              How It Works
            </span>
          </button>

          {/* 2. Safety & KYC */}
          <button
            type="button"
            onClick={() => onNavigate('/safety')}
            className="bg-[#0D1D35]/85 hover:bg-[#13243D] border border-[rgba(75,150,220,0.2)] rounded-2xl p-2 min-[380px]:p-3 flex flex-col items-center justify-center text-center transition group shadow-sm active:scale-95 focus:outline-none"
          >
            <div className="w-7 h-7 min-[380px]:w-8 min-[380px]:h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-transform">
              <ShieldCheck className="w-3.5 h-3.5 min-[380px]:w-4 min-[380px]:h-4" />
            </div>
            <span className="text-[10px] min-[380px]:text-[11px] font-medium text-slate-200 mt-1.5 min-[380px]:mt-2 leading-tight">
              Safety & KYC
            </span>
          </button>

          {/* 3. Fleet Partner */}
          <button
            type="button"
            onClick={() => onNavigate('/fleet-partners')}
            className="bg-[#0D1D35]/85 hover:bg-[#13243D] border border-[rgba(75,150,220,0.2)] rounded-2xl p-2 min-[380px]:p-3 flex flex-col items-center justify-center text-center transition group shadow-sm active:scale-95 focus:outline-none"
          >
            <div className="w-7 h-7 min-[380px]:w-8 min-[380px]:h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:bg-blue-500/20 transition-transform">
              <Car className="w-3.5 h-3.5 min-[380px]:w-4 min-[380px]:h-4" />
            </div>
            <span className="text-[10px] min-[380px]:text-[11px] font-medium text-slate-200 mt-1.5 min-[380px]:mt-2 leading-tight">
              Fleet Partner
            </span>
          </button>

          {/* 4. Support */}
          <button
            type="button"
            onClick={() => onNavigate('/support')}
            className="bg-[#0D1D35]/85 hover:bg-[#13243D] border border-[rgba(75,150,220,0.2)] rounded-2xl p-2 min-[380px]:p-3 flex flex-col items-center justify-center text-center transition group shadow-sm active:scale-95 focus:outline-none"
          >
            <div className="w-7 h-7 min-[380px]:w-8 min-[380px]:h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00DDF5] group-hover:scale-110 group-hover:bg-cyan-500/20 transition-transform">
              <Headphones className="w-3.5 h-3.5 min-[380px]:w-4 min-[380px]:h-4" />
            </div>
            <span className="text-[10px] min-[380px]:text-[11px] font-medium text-slate-200 mt-1.5 min-[380px]:mt-2 leading-tight">
              Support
            </span>
          </button>
        </section>

        {/* =========================================================================
            3B. DRIVE WITH AEROPOOL PARTNER BANNER
           ========================================================================= */}
        <section className="mt-3">
          <div className="bg-gradient-to-r from-[#0B1E3B] via-[#0E274D] to-[#0A1A33] border border-cyan-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-[#00DDF5] flex items-center justify-center shrink-0">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-white">Drive with AeroPool</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                    80% Payout Guaranteed
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Commercial airport drivers: Earn predictable income from CSMIA Mumbai terminal corridors with 100% toll pass-through.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/driver/onboarding')}
              className="shrink-0 h-9 px-4 bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 active:scale-95"
            >
              <span>Driver Onboarding</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* =========================================================================
            4. 40% SAVINGS PROMOTIONAL BANNER
           ========================================================================= */}
        <section className="mt-4">
          <button
            type="button"
            onClick={() => setSavingsModalOpen(true)}
            className="w-full bg-gradient-to-r from-[#004fcf] via-[#087BFF] to-[#00bfff]/90 border border-sky-400/30 rounded-2xl p-4 sm:p-5 flex items-center justify-between text-left shadow-xl hover:shadow-sky-500/25 transition group relative overflow-hidden focus:outline-none"
          >
            {/* Wavy abstract decorative background */}
            <div className="absolute -right-10 -bottom-10 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute top-0 right-1/4 w-28 h-28 bg-[#00DDF5]/20 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 space-y-0.5">
              <div className="text-lg sm:text-xl font-extrabold text-white leading-tight tracking-tight">
                Save up to 40%
              </div>
              <div className="text-xs text-sky-100 font-medium">
                on your airport ride
              </div>
            </div>

            {/* Glowing 3D coupon ticket graphic */}
            <div className="relative z-10">
              <div className="w-12 h-9 sm:w-14 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-500 via-sky-400 to-[#00DDF5] border border-white/30 shadow-lg shadow-blue-900/40 flex items-center justify-center text-white transform -rotate-6 group-hover:rotate-0 group-hover:scale-105 transition-all">
                <Percent className="w-5 h-5 text-white stroke-[2.5]" />
              </div>
            </div>
          </button>
        </section>

        {/* =========================================================================
            5. "AT CSMIA" TERMINAL & GUIDE CARD
           ========================================================================= */}
        <section className="mt-3">
          <button
            type="button"
            onClick={() => onNavigate('/faq')}
            className="w-full bg-[#0D1D35]/85 hover:bg-[#13243D] border border-[rgba(75,150,220,0.2)] rounded-2xl p-4 flex items-center justify-between transition text-left group shadow-sm focus:outline-none"
          >
            <div>
              <div className="text-sm font-bold text-white tracking-tight">At CSMIA</div>
              <div className="text-xs text-[#A8B5CA] mt-0.5">
                Terminal guides, pickup zones and more
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition" />
          </button>
        </section>
      </div>

      {/* =========================================================================
          MODALS & DRAWERS (Terminal Selector, Destination Picker, Flight Lookup, Savings)
         ========================================================================= */}

      {/* Modal 1: Terminal & Pickup Zone Selector */}
      {terminalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTerminalModalOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-[#00DDF5] -rotate-45" />
                <h3 className="text-sm font-bold text-white">Select Departure Terminal</h3>
              </div>
              <button
                onClick={() => setTerminalModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Terminal Switcher */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedTerminal('T2');
                  const t2Zones = PICKUP_ZONES.filter((z) => z.terminalCode === 'T2');
                  if (t2Zones.length > 0) setSelectedZoneId(t2Zones[0].id);
                }}
                className={`p-3 rounded-2xl border text-left transition ${
                  selectedTerminal === 'T2'
                    ? 'bg-[#00DDF5]/15 border-[#00DDF5] text-white shadow-sm'
                    : 'bg-[#0B1728] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold">Terminal 2 (T2)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">International & Major Domestic</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedTerminal('T1');
                  const t1Zones = PICKUP_ZONES.filter((z) => z.terminalCode === 'T1');
                  if (t1Zones.length > 0) setSelectedZoneId(t1Zones[0].id);
                }}
                className={`p-3 rounded-2xl border text-left transition ${
                  selectedTerminal === 'T1'
                    ? 'bg-[#00DDF5]/15 border-[#00DDF5] text-white shadow-sm'
                    : 'bg-[#0B1728] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold">Terminal 1 (T1)</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Domestic (Santacruz)</div>
              </button>
            </div>

            {/* Dedicated Pickup Bays */}
            <div className="space-y-2 pt-2">
              <div className="text-[11px] font-semibold text-[#A8B5CA] uppercase tracking-wider">
                Dedicated AeroPool Pickup Bays at {selectedTerminal}
              </div>
              <div className="space-y-1.5">
                {currentZones.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => {
                      setSelectedZoneId(zone.id);
                      setTerminalModalOpen(false);
                    }}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition ${
                      selectedZoneId === zone.id
                        ? 'bg-[#00DDF5]/10 border-[#00DDF5]/50 text-white'
                        : 'bg-[#0B1728] border-slate-800/80 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{zone.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{zone.instructions || `${zone.floor} • Pillar ${zone.pillar}`}</div>
                    </div>
                    {selectedZoneId === zone.id && <Check className="w-4 h-4 text-[#00DDF5]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Live Destination Search & Popular Hubs */}
      {destinationModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDestinationModalOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#00DDF5]" />
                <h3 className="text-sm font-bold text-white">Where are you heading?</h3>
              </div>
              <button
                onClick={() => setDestinationModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Autocomplete Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={destinationSearch}
                onChange={(e) => setDestinationSearch(e.target.value)}
                placeholder="Type destination, hotel, or landmark..."
                autoFocus
                className="w-full bg-[#0B1728] border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00DDF5]"
              />
              {isSearchingPlaces && (
                <div className="absolute right-3.5 top-3">
                  <div className="w-3.5 h-3.5 border-2 border-[#00DDF5] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Dynamic Results */}
            {placeSuggestions.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-[#A8B5CA]">Verified Match Results</div>
                {placeSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1728] hover:bg-slate-800/80 border border-slate-800 text-left transition flex items-center justify-between gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#00DDF5]/10 border border-[#00DDF5]/25 text-[#00DDF5] flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-[#00DDF5]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-semibold text-white leading-snug line-clamp-2 break-words">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed break-words">
                        {item.address}
                      </div>
                    </div>
                    {typeof item.distanceKm === 'number' && (
                      <div className="shrink-0 text-right pl-2 self-center">
                        <span className="text-xs font-mono font-bold text-cyan-400 whitespace-nowrap">
                          {item.distanceKm} km
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              /* Popular Mumbai Metropolitan Presets */
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-semibold text-[#A8B5CA] uppercase tracking-wider">
                  Popular Mumbai Destinations
                </div>
                <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto pr-1">
                  {MUMBAI_DESTINATIONS.map((dest) => (
                    <button
                      key={dest.id}
                      type="button"
                      onClick={() => handleSelectPresetDestination(dest)}
                      className="w-full p-2.5 rounded-xl bg-[#0B1728] hover:bg-slate-800/80 border border-slate-800 text-left transition flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white">{dest.name}</div>
                        <div className="text-[10px] text-slate-400">{dest.corridor}</div>
                      </div>
                      <div className="text-right text-[10px] text-sky-400 font-mono">
                        {dest.distanceKmFromCSMIA} km
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal 3: Flight Details & CSMIA Lookup */}
      {flightModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFlightModalOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#00DDF5]" />
                <h3 className="text-sm font-bold text-white">Add Flight Information</h3>
              </div>
              <button
                onClick={() => setFlightModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              AeroPool tracks your flight arrival automatically. If your flight is delayed, your departure pool will adjust at no charge.
            </p>

            {/* Flight Search Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={flightNumberInput}
                onChange={(e) => setFlightNumberInput(e.target.value.toUpperCase())}
                placeholder="e.g. 6E 5312, AI 678, UK 955"
                className="flex-1 bg-[#0B1728] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 uppercase focus:outline-none focus:border-[#00DDF5]"
              />
              <button
                type="button"
                onClick={() => handleFlightLookup(flightNumberInput)}
                disabled={isSearchingFlight}
                className="px-4 py-2 bg-[#00DDF5] hover:bg-[#20e4fa] text-[#07101F] text-xs font-bold rounded-xl transition disabled:opacity-50"
              >
                {isSearchingFlight ? 'Checking...' : 'Check'}
              </button>
            </div>

            {flightSearchError && (
              <p className="text-[11px] text-amber-400 leading-tight">{flightSearchError}</p>
            )}

            {/* Popular CSMIA Scheduled Flights */}
            <div className="space-y-1.5 pt-2">
              <div className="text-[11px] font-semibold text-[#A8B5CA] uppercase tracking-wider">
                Popular Arriving Flights at CSMIA
              </div>
              <div className="space-y-1.5">
                {POPULAR_CSMIA_FLIGHTS.slice(0, 4).map((f) => (
                  <button
                    key={f.flightNumber}
                    type="button"
                    onClick={() => {
                      setSelectedFlight(f);
                      if (f.terminal === 'T1' || f.terminal === 'T2') {
                        setSelectedTerminal(f.terminal);
                      }
                      setFlightModalOpen(false);
                    }}
                    className="w-full p-2.5 rounded-xl bg-[#0B1728] hover:bg-slate-800 border border-slate-800 text-left transition flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{f.airline} ({f.flightNumber})</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800">
                          {f.terminal}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        From {f.origin} • Arrives ~{new Date(f.scheduledArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-400">{f.status}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedFlight && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFlight(null);
                    setFlightModalOpen(false);
                  }}
                  className="w-full py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 font-medium transition"
                >
                  Remove Flight Details
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal 4: Savings & Promo Details */}
      {savingsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSavingsModalOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-[#0D1D35] border border-[rgba(75,150,220,0.3)] rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#00DDF5]" />
                <h3 className="text-sm font-bold text-white">AeroPool 40% Fare Guarantee</h3>
              </div>
              <button
                onClick={() => setSavingsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                By connecting 2–3 arriving passengers sharing the same corridor from CSMIA Mumbai, AeroPool cuts your individual fare by up to <strong>40%</strong> compared to private solo airport cabs.
              </p>

              {/* Live Route Fare Comparison */}
              <div className="p-3 rounded-2xl bg-[#0B1728] border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Sample Route:</span>
                  <span className="text-white font-semibold">{previewDest.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Solo Private Taxi:</span>
                  <span className="text-slate-400 line-through font-mono">
                    {formatINR(fareBreakdown.individualBenchmarkFarePaise)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800">
                  <span className="text-emerald-400 font-bold">AeroPool Shared Fare:</span>
                  <span className="text-base font-extrabold text-[#00DDF5] font-mono">
                    {formatINR(fareBreakdown.passengerShareFarePaise)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-[#A8B5CA]">
                <div>✓ Includes CSMIA toll & government GST</div>
                <div>✓ 100% verified commercial fleet cabs (Innova, Ertiga, Nexon EV)</div>
                <div>✓ Guaranteed 15-minute departure window from terminal bay</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSavingsModalOpen(false);
                handleFindPoolRide();
              }}
              className="w-full py-3 bg-[#00DDF5] hover:bg-[#20e4fa] text-[#07101F] font-bold text-xs rounded-xl shadow-lg shadow-[#00DDF5]/20 transition"
            >
              Book Shared Pool Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
