import fs from 'fs';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'src/views/AdminDashboardView.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add tab button
const targetButton = `          <button
            onClick={() => setActiveTab('audit')}
            className={\`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap \${
              activeTab === 'audit' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }\`}
          >
            Audit Log Ledger
          </button>`;

const replacementButton = `          <button
            onClick={() => setActiveTab('audit')}
            className={\`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap \${
              activeTab === 'audit' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-white'
            }\`}
          >
            Audit Log Ledger
          </button>
          <button
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

if (content.includes(targetButton)) {
  content = content.replace(targetButton, replacementButton);
  console.log('Tab button replaced successfully.');
} else {
  console.warn('Target button not found in file!');
}

// 2. Add Map Provider content tab right after TAB 6
const targetTab6End = `          {/* TAB 6: AUDIT LOG LEDGER */}
          {activeTab === 'audit' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-bold text-white">Immutable System Audit Log</h2>
              <div className="space-y-2 font-mono text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-300">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span className="text-sky-400 font-bold">{log.action}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div>{log.details}</div>
                    <div className="text-[10px] text-slate-500 mt-1">Actor: {log.actorName} ({log.actorRole})</div>
                  </div>
                ))}
              </div>
            </div>
          )}`;

const replacementTabContent = `${targetTab6End}

          {/* TAB 7: MAP PROVIDER ENGINE (PHASE 3) */}
          {activeTab === 'maps' && (
            <MapProviderSettingsCard
              onNotify={(type, msg) => setDispatchFeedback({ type: type === 'info' ? 'success' : type, message: msg })}
            />
          )}`;

if (content.includes(targetTab6End)) {
  content = content.replace(targetTab6End, replacementTabContent);
  console.log('Tab content replaced successfully.');
} else {
  console.warn('Target Tab 6 not found in file!');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('AdminDashboardView updated.');

