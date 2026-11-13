const fs = require('fs');
let code = fs.readFileSync('src/views/PassengerBookView.tsx', 'utf8');

// 1. Add imports
if (!code.includes("import { womenOnlyService }")) {
  code = code.replace(
    "import { DestinationPoint, FlightDetails, RidePool, PickupZone, UserProfile } from '../types';",
    "import { DestinationPoint, FlightDetails, RidePool, PickupZone, UserProfile, RideType } from '../types';\r\nimport { womenOnlyService } from '../services/womenOnlyService';"
  );
}

// 2. Update rideType state definition
code = code.replace(
  "  const [rideType, setRideType] = useState<'SHARED_POOL' | 'PRIVATE'>('SHARED_POOL');",
  "  const [rideType, setRideType] = useState<RideType>('SHARED_POOL');\r\n  const [showWomenOnlyModal, setShowWomenOnlyModal] = useState(false);\r\n  const [womenOnlySelfDeclaration, setWomenOnlySelfDeclaration] = useState(false);\r\n  const [switchConfirmModal, setSwitchConfirmModal] = useState<RideType | null>(null);"
);

// 3. Update evaluatePoolMatches call in handleStep3Search
code = code.replace(
  "        readyTimeIso,\r\n      });",
  "        readyTimeIso,\r\n        rideType,\r\n        isWomenOnlyEligible: Boolean(currentUser?.isWomenOnlyEligible || womenOnlyService.isPassengerEligible(currentUser?.id || 'usr-pass-001')),\r\n        passengerId: currentUser?.id,\r\n      });"
);

// 4. Update newPoolCandidate pool in handleStep3Search
code = code.replace(
  "          status: 'CONFIRMED',\r\n          passengers: [],",
  "          status: 'CONFIRMED',\r\n          isWomenOnlyPool: rideType === 'WOMEN_ONLY_POOL',\r\n          poolCategory: rideType,\r\n          passengers: [],"
);

// 5. Update fareQuote in newPoolCandidate
code = code.replace(
  "        fareQuote: rideType === 'PRIVATE' ? privateQuote : sharedQuote,",
  "        fareQuote: rideType === 'PRIVATE' ? privateQuote : sharedQuote,"
);

// 6. Update Step 3 Ride Category Selection Cards
const oldStep3Cards = `            {/* Ride Type Selection Cards */}
            <div className="grid grid-cols-1 auto-rows-fr gap-4">
              {/* Card 1: Shared AeroPool */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'SHARED_POOL'}
                data-testid="ride-category-shared"
                onClick={() => setRideType('SHARED_POOL')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setRideType('SHARED_POOL');
                  }
                }}
                className={\`w-full p-5 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none \${
                  rideType === 'SHARED_POOL'
                    ? 'border-[#00DDF5] bg-[#0B1930] shadow-[0_0_24px_rgba(0,221,245,0.18)] ring-1 ring-[#00DDF5]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-slate-700 hover:bg-[#0B1930]'
                }\`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Green Badge */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center min-w-0">
                      <Users className="w-7 h-7 text-[#00DDF5] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-3 sm:mx-3.5 shrink-0" />
                      <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                        Shared AeroPool
                      </h3>
                    </div>
                    <span className="shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold bg-[#0A3D2E] border border-[#10B981]/50 text-[#34D399] whitespace-nowrap shadow-sm">
                      Save up to 40%
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 sm:mt-4 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal">
                    Share a licensed commercial taxi with 1–2 verified flyers on the same route.
                  </p>
                </div>

                {/* Bottom Benefits Row */}
                <div className="mt-4 sm:mt-5 pt-1 flex items-center text-xs sm:text-sm text-slate-200 font-medium flex-wrap gap-y-2">
                  <div className="flex items-center gap-2">
                    <Waypoints className="w-5 h-5 text-[#00DDF5] shrink-0" />
                    <span>Max 1 en-route stop</span>
                  </div>
                  <div className="w-px h-4 bg-slate-700 mx-3 sm:mx-4 shrink-0" />
                  <div className="flex items-center gap-2">
                    <Armchair className="w-5 h-5 text-[#00DDF5] shrink-0" />
                    <span>Guaranteed comfort</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Private Airport Taxi */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'PRIVATE'}
                data-testid="ride-category-private"
                onClick={() => setRideType('PRIVATE')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setRideType('PRIVATE');
                  }
                }}
                className={\`w-full p-5 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none \${
                  rideType === 'PRIVATE'
                    ? 'border-[#00DDF5] bg-[#0B1930] shadow-[0_0_24px_rgba(0,221,245,0.18)] ring-1 ring-[#00DDF5]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-slate-700 hover:bg-[#0B1930]'
                }\`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Neutral Badge */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center min-w-0">
                      <Car className="w-7 h-7 text-[#00DDF5] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-3 sm:mx-3.5 shrink-0" />
                      <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                        Private Airport Taxi
                      </h3>
                    </div>
                    <span className="shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-[#182844] border border-slate-700 text-slate-300 whitespace-nowrap shadow-sm">
                      Express • Direct
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 sm:mt-4 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal">
                    Dedicated private vehicle with no other passengers. Direct, non-stop transit to your destination.
                  </p>
                </div>

                {/* Bottom Information Row */}
                <div className="mt-4 sm:mt-5 pt-1 flex items-center text-xs sm:text-sm text-slate-200 font-medium">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-white/90 shrink-0" />
                    <span>Standard airport meter fare applies</span>
                  </div>
                </div>
              </div>
            </div>`;

const newStep3Cards = `            {/* Ride Type Selection Cards */}
            <div className="grid grid-cols-1 auto-rows-fr gap-4">
              {/* Card 1: Shared AeroPool */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'SHARED_POOL'}
                data-testid="ride-category-shared"
                onClick={() => setRideType('SHARED_POOL')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setRideType('SHARED_POOL');
                  }
                }}
                className={\`w-full p-5 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none \${
                  rideType === 'SHARED_POOL'
                    ? 'border-[#00DDF5] bg-[#0B1930] shadow-[0_0_24px_rgba(0,221,245,0.18)] ring-1 ring-[#00DDF5]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-slate-700 hover:bg-[#0B1930]'
                }\`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Green Badge */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center min-w-0">
                      <Users className="w-7 h-7 text-[#00DDF5] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-3 sm:mx-3.5 shrink-0" />
                      <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                        Shared AeroPool
                      </h3>
                    </div>
                    <span className="shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold bg-[#0A3D2E] border border-[#10B981]/50 text-[#34D399] whitespace-nowrap shadow-sm">
                      Save up to 40%
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 sm:mt-4 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal">
                    Share a licensed commercial taxi with 1–2 verified flyers on the same route.
                  </p>
                </div>

                {/* Bottom Benefits Row */}
                <div className="mt-4 sm:mt-5 pt-1 flex items-center text-xs sm:text-sm text-slate-200 font-medium flex-wrap gap-y-2">
                  <div className="flex items-center gap-2">
                    <Waypoints className="w-5 h-5 text-[#00DDF5] shrink-0" />
                    <span>Max 1 en-route stop</span>
                  </div>
                  <div className="w-px h-4 bg-slate-700 mx-3 sm:mx-4 shrink-0" />
                  <div className="flex items-center gap-2">
                    <Armchair className="w-5 h-5 text-[#00DDF5] shrink-0" />
                    <span>Guaranteed comfort</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Women-Only Pool */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'WOMEN_ONLY_POOL'}
                data-testid="ride-category-women-only"
                onClick={() => {
                  const eligible = Boolean(currentUser?.isWomenOnlyEligible || womenOnlyService.isPassengerEligible(currentUser?.id || 'usr-pass-001'));
                  if (eligible) {
                    setRideType('WOMEN_ONLY_POOL');
                  } else {
                    setShowWomenOnlyModal(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const eligible = Boolean(currentUser?.isWomenOnlyEligible || womenOnlyService.isPassengerEligible(currentUser?.id || 'usr-pass-001'));
                    if (eligible) {
                      setRideType('WOMEN_ONLY_POOL');
                    } else {
                      setShowWomenOnlyModal(true);
                    }
                  }
                }}
                className={\`w-full p-5 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none \${
                  rideType === 'WOMEN_ONLY_POOL'
                    ? 'border-[#D946EF] bg-[#0E1528] shadow-[0_0_24px_rgba(217,70,239,0.22)] ring-1 ring-[#D946EF]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-purple-900/60 hover:bg-[#0B1930]'
                }\`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Badges */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center min-w-0">
                      <ShieldCheck className="w-7 h-7 text-[#F472B6] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-3 sm:mx-3.5 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                          Women-Only Pool
                        </h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {womenOnlyService.isNighttime() && (
                        <span className="hidden xs:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#181E38] border border-indigo-500/40 text-indigo-300 shadow-sm">
                          🌙 Night travel option
                        </span>
                      )}
                      <span className="shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold bg-[#2A1236] border border-[#D946EF]/50 text-[#F472B6] whitespace-nowrap shadow-sm">
                        WOMEN-ONLY MATCHING
                      </span>
                    </div>
                  </div>

                  {/* Subtitle & Description */}
                  <p className="mt-2 text-xs sm:text-[13px] text-pink-300 font-medium italic">
                    "Travel together. Feel more comfortable."
                  </p>
                  <p className="mt-2 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal">
                    Share your airport ride exclusively with verified women passengers travelling in a similar direction.
                  </p>
                </div>

                {/* Bottom Benefits Row */}
                <div className="mt-4 sm:mt-5 pt-1 flex items-center text-xs sm:text-sm text-slate-200 font-medium flex-wrap gap-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#F472B6] shrink-0" />
                    <span>Women-only co-passengers</span>
                  </div>
                  <div className="w-px h-4 bg-slate-700 mx-3 sm:mx-4 shrink-0" />
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#00DDF5] shrink-0" />
                    <span>Verified passenger accounts</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Private Airport Taxi */}
              <div
                role="button"
                tabIndex={0}
                aria-pressed={rideType === 'PRIVATE'}
                data-testid="ride-category-private"
                onClick={() => setRideType('PRIVATE')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setRideType('PRIVATE');
                  }
                }}
                className={\`w-full p-5 sm:p-6 rounded-3xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between select-none \${
                  rideType === 'PRIVATE'
                    ? 'border-[#00DDF5] bg-[#0B1930] shadow-[0_0_24px_rgba(0,221,245,0.18)] ring-1 ring-[#00DDF5]/40'
                    : 'border-[#1E3252] bg-[#0B1930]/80 hover:border-slate-700 hover:bg-[#0B1930]'
                }\`}
              >
                <div>
                  {/* Header Row: Icon + Divider + Title + Neutral Badge */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center min-w-0">
                      <Car className="w-7 h-7 text-[#00DDF5] shrink-0 stroke-[2.2]" />
                      <div className="w-px h-6 bg-slate-700/80 mx-3 sm:mx-3.5 shrink-0" />
                      <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                        Private Airport Taxi
                      </h3>
                    </div>
                    <span className="shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-[#182844] border border-slate-700 text-slate-300 whitespace-nowrap shadow-sm">
                      Express • Direct
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 sm:mt-4 text-sm sm:text-[15px] text-slate-200 leading-relaxed font-normal">
                    Dedicated private vehicle with no other passengers. Direct, non-stop transit to your destination.
                  </p>
                </div>

                {/* Bottom Information Row */}
                <div className="mt-4 sm:mt-5 pt-1 flex items-center text-xs sm:text-sm text-slate-200 font-medium">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-white/90 shrink-0" />
                    <span>Standard airport meter fare applies</span>
                  </div>
                </div>
              </div>
            </div>`;

// Replace oldStep3Cards with newStep3Cards (normalizing CRLF)
code = code.replace(oldStep3Cards.replace(/\r\n/g, '\n'), newStep3Cards);
code = code.replace(oldStep3Cards, newStep3Cards);

// 7. Update Wait Window Slider conditional to show for WOMEN_ONLY_POOL too
code = code.replace(
  "{rideType === 'SHARED_POOL' && (",
  "{(rideType === 'SHARED_POOL' || rideType === 'WOMEN_ONLY_POOL') && ("
);

// 8. Add Modals for Women-Only Verification and Fallback Confirmation before the closing container div
const modalCode = `
      {/* Women-Only Voluntary Opt-In & Privacy Modal */}
      {showWomenOnlyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-[#0B132B] border border-[#D946EF]/50 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#D946EF]/15 border border-[#D946EF]/40 text-[#F472B6] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">Women-Only Pooling</h3>
                  <div className="text-xs text-pink-300 font-medium">Verified Airport Community Guidelines</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWomenOnlyModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <p>
                To provide a supportive and comfortable travel environment for women arriving at CSMIA, this ride category matches vehicles <strong>exclusively with other verified women passengers</strong> travelling in the same direction.
              </p>
              <div className="p-3.5 bg-purple-950/30 border border-purple-800/40 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-pink-300 font-semibold">
                  <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
                  <span>Strict Backend Guarantee: Zero Male Co-Passengers</span>
                </div>
                <div className="text-slate-400 text-xs">
                  We never automatically downgrade you to a mixed pool. If no match is found, you choose whether to wait or switch voluntarily.
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={womenOnlySelfDeclaration}
                  onChange={(e) => setWomenOnlySelfDeclaration(e.target.checked)}
                  className="mt-0.5 accent-[#D946EF] w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-xs text-slate-200">
                  I voluntarily confirm that I identify as a woman and agree to the AeroPool Women-Only Pooling Community Guidelines.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWomenOnlyModal(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!womenOnlySelfDeclaration}
                onClick={() => {
                  womenOnlyService.optInPassenger({
                    passengerId: currentUser?.id || 'usr-pass-001',
                    passengerName: currentUser?.fullName || 'Verified Passenger',
                    passengerPhone: currentUser?.phone || '+91 98200 00000',
                    selfDeclarationConfirmed: true,
                  });
                  setRideType('WOMEN_ONLY_POOL');
                  setShowWomenOnlyModal(false);
                }}
                className={\`px-6 py-2.5 rounded-xl text-xs font-extrabold transition shadow-lg \${
                  womenOnlySelfDeclaration
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-pink-500/25 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }\`}
              >
                Confirm & Opt In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Voluntary Category Switch Modal */}
      {switchConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-[#0B132B] border border-sky-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <h3 className="text-lg font-bold text-white">Confirm Voluntary Switch</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              You are voluntarily switching from <strong>Women-Only Pool</strong> to{' '}
              <strong>{switchConfirmModal === 'PRIVATE' ? 'Private Airport Taxi' : 'Shared AeroPool (Standard)'}</strong>.
              AeroPool will never place you into a mixed pool without your explicit choice.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSwitchConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Keep Waiting
              </button>
              <button
                type="button"
                onClick={() => {
                  setRideType(switchConfirmModal);
                  setSwitchConfirmModal(null);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md shadow-sky-500/20"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace(
  "      {/* Razorpay Simulated SDK Modal */}",
  `${modalCode}\r\n      {/* Razorpay Simulated SDK Modal */}`
);

fs.writeFileSync('src/views/PassengerBookView.tsx', code, 'utf8');
console.log('src/views/PassengerBookView.tsx updated successfully');
