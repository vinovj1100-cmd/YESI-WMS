import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/db';
import { getCriticalSummary, type PressureScenario, resolveScenario } from '@/lib/criticalWorkflow';
import { calculateAdaptation, getCurrentAdaptation, getModeColors, type AdaptationState } from '@/lib/adaptation';
import { runSystemCleanup, getStorageUsage, autoCleanupCheck, type CleanupReport } from '@/lib/maintenance';
import {
  Shield, AlertTriangle, CheckCircle, Activity, Zap, RefreshCw, Wrench,
  TrendingUp, Trash2, Database, Gauge, Brain, Sparkles, Play, Pause,
  ChevronRight, Server, HardDrive, Clock
} from 'lucide-react';

export default function GuardianDashboard() {
  const [scenarios, setScenarios] = useState<PressureScenario[]>([]);
  const [adaptation, setAdaptation] = useState<AdaptationState | null>(null);
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [storage, setStorage] = useState({ usedMB: 0, totalMB: null as number | null, percent: 0 });
  const [scanning, setScanning] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [lastScan, setLastScan] = useState('');
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'critical' | 'adaptation' | 'maintenance'>('critical');

  const runFullAnalysis = useCallback(async () => {
    setScanning(true);
    const [criticalSummary, adapt, storageInfo] = await Promise.all([
      getCriticalSummary(),
      calculateAdaptation(),
      getStorageUsage(),
    ]);
    setScenarios(criticalSummary.scenarios);
    setAdaptation(adapt);
    setStorage(storageInfo);

    // Auto-cleanup check
    const autoReport = await autoCleanupCheck();
    if (autoReport) setCleanupReport(autoReport);

    setLastScan(new Date().toLocaleTimeString());
    setScanning(false);
  }, []);

  useEffect(() => {
    runFullAnalysis();
    // Refresh every 30 seconds
    const interval = setInterval(runFullAnalysis, 30000);
    return () => clearInterval(interval);
  }, [runFullAnalysis]);

  const handleCleanup = async () => {
    setCleanupRunning(true);
    const report = await runSystemCleanup();
    setCleanupReport(report);
    const storageInfo = await getStorageUsage();
    setStorage(storageInfo);
    setCleanupRunning(false);
  };

  const handleResolveScenario = async (scenarioId: string) => {
    await resolveScenario(scenarioId);
    const summary = await getCriticalSummary();
    setScenarios(summary.scenarios);
  };

  const modeColors = adaptation ? getModeColors(adaptation.mode) : getModeColors('normal');

  const criticalCount = scenarios.filter(s => s.level === 'critical' || s.level === 'emergency').length;
  const elevatedCount = scenarios.filter(s => s.level === 'elevated').length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Guardian Ops Center</h1>
            <p className="text-sm text-white/40 mt-1">Critical workflow handler, dynamic adaptation & system maintenance</p>
          </div>
          <div className="flex items-center gap-2">
            {adaptation && (
              <div
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2"
                style={{
                  background: modeColors.bg,
                  border: `1px solid ${modeColors.border}`,
                  color: modeColors.text,
                }}
              >
                <Gauge className="w-3.5 h-3.5" />
                {adaptation.mode.toUpperCase()} MODE
              </div>
            )}
            <motion.button
              onClick={runFullAnalysis}
              whileTap={{ scale: 0.98 }}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
              style={{
                background: 'linear-gradient(180deg, rgba(56,189,248,0.15) 0%, rgba(56,189,248,0.05) 100%)',
                border: '1px solid rgba(56,189,248,0.2)',
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Scanning...' : 'Rescan'}
            </motion.button>
          </div>
        </div>
        {lastScan && <p className="text-[10px] text-white/30 mt-1">Last scan: {lastScan} · Auto-refresh every 30s</p>}
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="glossy-black rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-400' : 'text-green-400'}`} />
            <span className="text-[10px] text-white/30">CRITICAL</span>
          </div>
          <div className="text-2xl font-bold text-white">{criticalCount}</div>
          <div className="text-[10px] text-white/40">Active scenarios</div>
        </div>
        <div className="glossy-black rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-yellow-400" />
            <span className="text-[10px] text-white/30">ELEVATED</span>
          </div>
          <div className="text-2xl font-bold text-white">{elevatedCount}</div>
          <div className="text-[10px] text-white/40">Warning scenarios</div>
        </div>
        <div className="glossy-black rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Brain className="w-5 h-5 text-cyan-400" />
            <span className="text-[10px] text-white/30">ADAPTATION</span>
          </div>
          <div className="text-2xl font-bold text-white">{adaptation?.suggestions.filter(s => s.autoApply).length || 0}</div>
          <div className="text-[10px] text-white/40">Auto-applied</div>
        </div>
        <div className="glossy-black rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <HardDrive className="w-5 h-5 text-purple-400" />
            <span className="text-[10px] text-white/30">STORAGE</span>
          </div>
          <div className="text-2xl font-bold text-white">{storage.usedMB.toFixed(1)}MB</div>
          <div className="text-[10px] text-white/40">{storage.totalMB ? `${storage.percent}% of ${storage.totalMB.toFixed(0)}MB` : 'Local DB'}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['critical', 'adaptation', 'maintenance'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab
                ? 'text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
            style={activeTab === tab ? {
              background: 'linear-gradient(180deg, rgba(56,189,248,0.15) 0%, rgba(56,189,248,0.05) 100%)',
              border: '1px solid rgba(56,189,248,0.2)',
            } : { border: '1px solid transparent' }}
          >
            {tab === 'critical' && <><AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Critical Workflow</>}
            {tab === 'adaptation' && <><Sparkles className="w-3.5 h-3.5 inline mr-1" />Dynamic Adaptation</>}
            {tab === 'maintenance' && <><Server className="w-3.5 h-3.5 inline mr-1" />System Maintenance</>}
          </button>
        ))}
      </div>

      {/* Critical Workflow Tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'critical' && (
          <motion.div key="critical" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {scenarios.length === 0 ? (
              <div className="glossy-black rounded-xl p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white">All Systems Normal</h3>
                <p className="text-sm text-white/40 mt-1">No critical scenarios detected. Warehouse is operating within normal parameters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scenarios.map(scenario => (
                  <div
                    key={scenario.id}
                    className="glossy-black rounded-xl overflow-hidden"
                    style={{
                      borderLeft: `3px solid ${scenario.level === 'emergency' ? '#ef4444' : scenario.level === 'critical' ? '#f59e0b' : '#38bdf8'}`,
                    }}
                  >
                    <button
                      onClick={() => setExpandedScenario(expandedScenario === scenario.id ? null : scenario.id)}
                      className="w-full p-4 flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${scenario.level === 'emergency' ? 'bg-red-400 animate-pulse' : scenario.level === 'critical' ? 'bg-yellow-400' : 'bg-cyan-400'}`} />
                        <div>
                          <h4 className="text-sm font-semibold text-white">{scenario.title}</h4>
                          <p className="text-[11px] text-white/40 mt-0.5">{scenario.description.slice(0, 100)}...</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          scenario.level === 'emergency' ? 'bg-red-500/20 text-red-300' :
                          scenario.level === 'critical' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-cyan-500/20 text-cyan-300'
                        }`}>
                          {scenario.level.toUpperCase()}
                        </span>
                        <ChevronRight className={`w-4 h-4 text-white/30 transition-transform ${expandedScenario === scenario.id ? 'rotate-90' : ''}`} />
                      </div>
                    </button>

                    <AnimatePresence>
                      {expandedScenario === scenario.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-2">
                            <p className="text-xs text-white/50">{scenario.description}</p>
                            {scenario.affectedSkus && (
                              <div className="flex flex-wrap gap-1">
                                {scenario.affectedSkus.map(sku => (
                                  <span key={sku} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/50 font-mono">{sku}</span>
                                ))}
                              </div>
                            )}
                            <div className="space-y-2 mt-3">
                              <p className="text-[10px] text-white/30 uppercase tracking-widest">Suggested Actions</p>
                              {scenario.suggestedActions.map(action => (
                                <div key={action.id} className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-lg">
                                  <div>
                                    <p className="text-xs text-white/80">{action.description}</p>
                                    <p className="text-[10px] text-white/30">Impact: {action.estimatedImpact} · Risk: {action.riskLevel}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {action.type === 'auto' && (
                                      <span className="text-[9px] px-2 py-0.5 rounded bg-green-500/10 text-green-400">AUTO</span>
                                    )}
                                    {action.type === 'escalate' && (
                                      <span className="text-[9px] px-2 py-0.5 rounded bg-red-500/10 text-red-400">ESCALATE</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Adaptation Tab */}
        {activeTab === 'adaptation' && adaptation && (
          <motion.div key="adaptation" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* Mode Banner */}
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: modeColors.bg,
                border: `1px solid ${modeColors.border}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <Brain className="w-5 h-5" style={{ color: modeColors.accent }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: modeColors.text }}>
                    {adaptation.mode === 'normal' ? 'Normal Operations' :
                     adaptation.mode === 'efficiency' ? 'Efficiency Mode Active' :
                     adaptation.mode === 'surge' ? 'SURGE MODE — High Volume Detected' :
                     'CRISIS MODE — Immediate Action Required'}
                  </h3>
                  <p className="text-[11px] text-white/40">
                    Pick: {adaptation.recommendedPickingMethod} · Batch: {adaptation.recommendedBatchSize} · Refresh: {adaptation.dashboardRefreshInterval}s
                  </p>
                </div>
              </div>
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              <p className="text-[10px] text-white/30 uppercase tracking-widest px-1">Adaptation Suggestions</p>
              {adaptation.suggestions.map(suggestion => (
                <div
                  key={suggestion.id}
                  className="glossy-black rounded-xl p-4 flex items-center justify-between"
                  style={suggestion.applied ? { opacity: 0.6 } : {}}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      suggestion.impact === 'high' ? 'bg-red-500/10' :
                      suggestion.impact === 'medium' ? 'bg-yellow-500/10' :
                      'bg-cyan-500/10'
                    }`}>
                      {suggestion.category === 'picking' && <Zap className="w-4 h-4 text-yellow-400" />}
                      {suggestion.category === 'inventory' && <TrendingUp className="w-4 h-4 text-green-400" />}
                      {suggestion.category === 'staffing' && <Shield className="w-4 h-4 text-purple-400" />}
                      {suggestion.category === 'shipping' && <Activity className="w-4 h-4 text-cyan-400" />}
                      {suggestion.category === 'layout' && <Server className="w-4 h-4 text-blue-400" />}
                    </div>
                    <div>
                      <p className="text-xs text-white/80">{suggestion.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          suggestion.impact === 'high' ? 'bg-red-500/10 text-red-400' :
                          suggestion.impact === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-cyan-500/10 text-cyan-400'
                        }`}>
                          {suggestion.impact}
                        </span>
                        {suggestion.autoApply && (
                          <span className="text-[9px] text-green-400">Auto-apply enabled</span>
                        )}
                        {suggestion.applied && (
                          <span className="text-[9px] text-white/30">Applied</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Maintenance Tab */}
        {activeTab === 'maintenance' && (
          <motion.div key="maintenance" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cleanup Panel */}
              <div className="glossy-black rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Trash2 className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">System Cleanup</h3>
                </div>
                <p className="text-xs text-white/40 mb-4">
                  Automatically purges old audit logs, completed tasks, released QC holds, and expired cache entries.
                  Last cleanup data is preserved in the cleanup report.
                </p>
                <button
                  onClick={handleCleanup}
                  disabled={cleanupRunning}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                    boxShadow: '0 4px 24px rgba(56, 189, 248, 0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                  }}
                >
                  {cleanupRunning ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Cleaning...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Play className="w-4 h-4" /> Run Cleanup Now
                    </span>
                  )}
                </button>

                {cleanupReport && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 space-y-2">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest">Last Cleanup Result</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-white/[0.03] rounded-lg text-center">
                        <div className="text-lg font-bold text-white">{cleanupReport.auditLogsDeleted}</div>
                        <div className="text-[9px] text-white/30">Audit Logs</div>
                      </div>
                      <div className="p-2 bg-white/[0.03] rounded-lg text-center">
                        <div className="text-lg font-bold text-white">{cleanupReport.inventoryMovementsDeleted}</div>
                        <div className="text-[9px] text-white/30">Movements</div>
                      </div>
                      <div className="p-2 bg-white/[0.03] rounded-lg text-center">
                        <div className="text-lg font-bold text-white">{cleanupReport.oldCompletedTasksDeleted}</div>
                        <div className="text-[9px] text-white/30">Old Tasks</div>
                      </div>
                      <div className="p-2 bg-white/[0.03] rounded-lg text-center">
                        <div className="text-lg font-bold text-white">{cleanupReport.cacheEntriesCleared}</div>
                        <div className="text-[9px] text-white/30">Cache Entries</div>
                      </div>
                    </div>
                    <div className="p-2 bg-green-500/5 border border-green-500/10 rounded-lg">
                      <p className="text-xs text-green-400 text-center">
                        Freed ~{(cleanupReport.estimatedBytesFreed / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Storage Panel */}
              <div className="glossy-black rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="w-5 h-5 text-purple-400" />
                  <h3 className="text-sm font-semibold text-white">Storage Analysis</h3>
                </div>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/50">Used</span>
                    <span className="text-xs text-white font-mono">{storage.usedMB.toFixed(1)} MB</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${storage.percent}%` }}
                      className="h-full rounded-full"
                      style={{
                        background: storage.percent > 80 ? 'linear-gradient(90deg, #ef4444, #f59e0b)' :
                                   storage.percent > 50 ? 'linear-gradient(90deg, #f59e0b, #eab308)' :
                                   'linear-gradient(90deg, #38bdf8, #22c55e)',
                      }}
                    />
                  </div>
                  {storage.totalMB && (
                    <p className="text-[10px] text-white/30 mt-1">of {storage.totalMB.toFixed(0)} MB total</p>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                    <span className="text-xs text-white/50">Auto-cleanup</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">Enabled</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                    <span className="text-xs text-white/50">Retention (Audit Logs)</span>
                    <span className="text-[10px] text-white/30 font-mono">90 days</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                    <span className="text-xs text-white/50">Retention (Movements)</span>
                    <span className="text-[10px] text-white/30 font-mono">60 days</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg">
                    <span className="text-xs text-white/50">Retention (Tasks)</span>
                    <span className="text-[10px] text-white/30 font-mono">30 days</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
