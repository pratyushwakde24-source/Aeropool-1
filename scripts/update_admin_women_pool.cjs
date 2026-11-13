const fs = require('fs');
let code = fs.readFileSync('src/views/AdminDashboardView.tsx', 'utf8');

// 1. Add imports if not present
if (!code.includes("import { womenOnlyService }")) {
  code = code.replace(
    "import { getActiveCommissionPolicy } from '../services/commissionEngine';",
    "import { getActiveCommissionPolicy } from '../services/commissionEngine';\r\nimport { womenOnlyService } from '../services/womenOnlyService';\r\nimport { WomenOnlyPoolConfig, WomenOnlyVerificationRecord } from '../types';"
  );
}

// 2. Update activeTab type
code = code.replace(
  "const [activeTab, setActiveTab] = useState<'overview' | 'diagnostics' | 'kyc' | 'pools' | 'payments' | 'incidents' | 'audit' | 'maps'>('overview');",
  "const [activeTab, setActiveTab] = useState<'overview' | 'diagnostics' | 'kyc' | 'pools' | 'payments' | 'incidents' | 'audit' | 'maps' | 'women_pool'>('overview');\r\n  const [womenConfig, setWomenConfig] = useState(womenOnlyService.getConfig());\r\n  const [womenVerifications, setWomenVerifications] = useState(womenOnlyService.getAllVerificationRecords());\r\n  const [configSuccessMsg, setConfigSuccessMsg] = useState<string | null>(null);"
);

// 3. Add Tab button after Maps tab button
const oldMapsBtn = `          <button
            onClick={() => setActiveTab('maps')}
            className={\`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 \${
              activeTab === 'maps'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }\`}
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>Map Provider Engine</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-cyan-950 border border-cyan-800 text-cyan-300 rounded font-bold">
              {getActiveMapProvider() === 'mapbox' ? 'Mapbox' : 'Google'}
            </span>
          </button>`;

const newTabsButtons = `          <button
            onClick={() => setActiveTab('maps')}
            className={\`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 \${
              activeTab === 'maps'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }\`}
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>Map Provider Engine</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-cyan-950 border border-cyan-800 text-cyan-300 rounded font-bold">
              {getActiveMapProvider() === 'mapbox' ? 'Mapbox' : 'Google'}
            </span>
          </button>
          <button
            onClick={() => {
              setWomenConfig(womenOnlyService.getConfig());
              setWomenVerifications(womenOnlyService.getAllVerificationRecords());
              setActiveTab('women_pool');
            }}
            className={\`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5 \${
              activeTab === 'women_pool'
                ? 'bg-[#2A1236] text-[#F472B6] border border-[#D946EF]/50 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }\`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#F472B6]" />
            <span>Women-Only Pool</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-purple-950/80 border border-purple-800 text-pink-300 rounded font-bold">
              {womenConfig.enabled ? 'Active' : 'Disabled'}
            </span>
          </button>`;

code = code.replace(oldMapsBtn.replace(/\r\n/g, '\n'), newTabsButtons);
code = code.replace(oldMapsBtn, newTabsButtons);

// 4. Add Tab Content for Women-Only Pool after maps tab
const oldMapsTabContent = `        {/* TAB 7: MAP PROVIDER ENGINE (PHASE 3) */}
        {activeTab === 'maps' && (
          <MapProviderSettingsCard
            onNotify={(type, msg) => setDispatchFeedback({ type: type === 'info' ? 'success' : type, message: msg })}
          />
        )}`;

const newWomenTabContent = `        {/* TAB 7: MAP PROVIDER ENGINE (PHASE 3) */}
        {activeTab === 'maps' && (
          <MapProviderSettingsCard
            onNotify={(type, msg) => setDispatchFeedback({ type: type === 'info' ? 'success' : type, message: msg })}
          />
        )}

        {/* TAB 8: WOMEN-ONLY POOL ADMINISTRATION & SAFETY */}
        {activeTab === 'women_pool' && (
          <div className="space-y-6">
            {/* Header Card */}
            <div className="glass-panel border border-[#D946EF]/30 rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-[#120F24] to-[#0B132B] shadow-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#D946EF]/15 border border-[#D946EF]/40 text-[#F472B6] flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                      Women-Only Pool Administration
                    </h2>
                    <p className="text-xs text-slate-300">
                      Super Admin controls, nighttime window configuration, and privacy-first verification queue.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = womenOnlyService.updateConfig({ enabled: !womenConfig.enabled });
                      setWomenConfig(updated);
                      setConfigSuccessMsg(\`Women-Only Pool is now \${updated.enabled ? 'ENABLED' : 'DISABLED'}.\`);
                      setTimeout(() => setConfigSuccessMsg(null), 3000);
                    }}
                    className={\`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border \${
                      womenConfig.enabled
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                    }\`}
                  >
                    <span className={\`w-2 h-2 rounded-full \${womenConfig.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}\`} />
                    <span>{womenConfig.enabled ? 'Platform Status: Active' : 'Platform Status: Disabled'}</span>
                  </button>
                </div>
              </div>

              {configSuccessMsg && (
                <div className="mt-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{configSuccessMsg}</span>
                </div>
              )}

              {/* Real-time KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Active Pools</div>
                  <div className="text-2xl font-mono font-extrabold text-[#F472B6] mt-1">
                    {womenOnlyService.getAnalytics().activePoolsCount}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Strict women-only matching</div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Verified Flyers</div>
                  <div className="text-2xl font-mono font-extrabold text-cyan-300 mt-1">
                    {womenOnlyService.getAnalytics().verifiedPassengersCount}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Voluntary self-declarations</div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Completed Trips</div>
                  <div className="text-2xl font-mono font-extrabold text-white mt-1">
                    {womenOnlyService.getAnalytics().completedTripsCount}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">100% compliance record</div>
                </div>

                <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl">
                  <div className="text-[11px] font-mono uppercase text-slate-400">Night Window</div>
                  <div className="text-xs font-mono font-bold text-indigo-300 mt-2 flex items-center gap-1.5">
                    <span>🌙 {womenConfig.nighttimeStartHour}:00 – {womenConfig.nighttimeEndHour}:00 IST</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {womenOnlyService.isNighttime() ? 'Currently in Night Window' : 'Day Window Active'}
                  </div>
                </div>
              </div>
            </div>

            {/* Nighttime Settings Card */}
            <div className="glass-panel border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Nighttime Operational Schedule & Airport Scope</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nighttime Start Hour (24-Hour IST)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={womenConfig.nighttimeStartHour}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const updated = womenOnlyService.updateConfig({ nighttimeStartHour: isNaN(val) ? 20 : val });
                      setWomenConfig(updated);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">Default 20 (8:00 PM local)</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nighttime End Hour (24-Hour IST)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={womenConfig.nighttimeEndHour}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const updated = womenOnlyService.updateConfig({ nighttimeEndHour: isNaN(val) ? 6 : val });
                      setWomenConfig(updated);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">Default 6 (6:00 AM local)</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Airport Timezone & Local Reference
                  </label>
                  <input
                    type="text"
                    disabled
                    value={womenConfig.timezone}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-400 font-mono"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">Indian Standard Time (IST / Asia/Kolkata)</div>
                </div>
              </div>
            </div>

            {/* Passenger Verification Review Queue */}
            <div className="glass-panel border border-slate-800 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#F472B6]" />
                  <span>Voluntary Eligibility Review & Audit Records</span>
                </h3>
                <span className="text-xs text-slate-400">
                  {womenVerifications.length} passenger records
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="py-3 px-3">PASSENGER</th>
                      <th className="py-3 px-3">PHONE</th>
                      <th className="py-3 px-3">STATUS</th>
                      <th className="py-3 px-3">OPT-IN TIMESTAMP</th>
                      <th className="py-3 px-3">VERIFIED BY</th>
                      <th className="py-3 px-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {womenVerifications.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-900/50">
                        <td className="py-3 px-3 text-white font-bold font-sans">{rec.passengerName}</td>
                        <td className="py-3 px-3 text-slate-300">{rec.passengerPhone}</td>
                        <td className="py-3 px-3">
                          <span
                            className={\`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase \${
                              rec.status === 'verified'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : rec.status === 'rejected'
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }\`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {new Date(rec.optInTimestamp).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3 text-slate-400">{rec.verifiedBy || 'Self-Declared'}</td>
                        <td className="py-3 px-3 text-right">
                          {rec.status === 'verified' ? (
                            <button
                              type="button"
                              onClick={() => {
                                womenOnlyService.setVerificationStatus(rec.passengerId, 'rejected', 'super-admin', 'Administrative safety review');
                                setWomenVerifications(womenOnlyService.getAllVerificationRecords());
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition text-[11px]"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                womenOnlyService.setVerificationStatus(rec.passengerId, 'verified', 'super-admin');
                                setWomenVerifications(womenOnlyService.getAllVerificationRecords());
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition text-[11px]"
                            >
                              Approve
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}`;

code = code.replace(oldMapsTabContent.replace(/\r\n/g, '\n'), newWomenTabContent);
code = code.replace(oldMapsTabContent, newWomenTabContent);

fs.writeFileSync('src/views/AdminDashboardView.tsx', code, 'utf8');
console.log('src/views/AdminDashboardView.tsx updated successfully with Women-Only Pool admin panel');
