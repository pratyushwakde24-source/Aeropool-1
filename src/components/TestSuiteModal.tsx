import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Play, RefreshCw, X, ShieldCheck, Zap } from 'lucide-react';
import type { TestResult } from '../tests/testSuite';

interface TestSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestSuiteModal: React.FC<TestSuiteModalProps> = ({ isOpen, onClose }) => {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const executeTests = async () => {
    setIsRunning(true);
    try {
      const { runAllAeroPoolTests } = await import('../tests/testSuite');
      const results = await runAllAeroPoolTests();
      setTests(results);
    } catch (err) {
      console.error('Failed to execute tests:', err);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      executeTests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const passedCount = tests.filter((t) => t.passed).length;
  const totalCount = tests.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-400 font-mono">Automated QA Verification</div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                AeroPool Architecture & Core Service Tests
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={executeTests}
              disabled={isRunning}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Rerun Tests"
            >
              <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin text-sky-400' : ''}`} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Score Banner */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Test Execution Status:</span>
            {totalCount > 0 && passedCount === totalCount ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All {totalCount} Passing
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-400">Running / Verifying...</span>
            )}
          </div>
          <div className="text-xs font-mono text-slate-400">
            Pass Rate: <span className="text-white font-bold">{totalCount ? Math.round((passedCount / totalCount) * 100) : 0}%</span>
          </div>
        </div>

        {/* Tests List */}
        <div className="p-5 overflow-y-auto space-y-3">
          {tests.map((test, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border transition ${
                test.passed
                  ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  : 'bg-red-950/20 border-red-500/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {test.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{test.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        {test.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{test.message}</p>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-400 shrink-0">{test.durationMs}ms</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
