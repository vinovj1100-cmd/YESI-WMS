import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Sheet, RefreshCw, Upload, Link2, Key, Zap, Smartphone, Monitor,
  ArrowRight, CheckCircle, XCircle, AlertTriangle, Settings, Play,
  Pause, Package, Layers, Camera, Bell, Clock, Users, Database,
  FileSpreadsheet, Loader2, ExternalLink, Shield,
} from 'lucide-react';
import { db, type SheetSyncConfig, type SheetSyncLog } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import { DEFAULT_OZON_SHEET, parseSheetUrl, fetchSheet, parseUploadedFile } from '@/lib/googleSheets';
import { runSheetSync, getDetectedMappingPreview } from '@/lib/ozonSheetSync';
import { getDeviceId, getDeviceName, getOnlineDevices, registerDeviceHeartbeat } from '@/lib/deviceRegistry';
import { startAutomationLoop, stopAutomationLoop } from '@/lib/ozonAutomation';
import type { ConnectedDevice } from '@/lib/db';

type SyncMethod = 'live' | 'api' | 'upload';

const PIPELINE_STEPS = [
  { id: 'sheet', label: 'Google Sheet', icon: FileSpreadsheet, color: 'text-accent-green' },
  { id: 'map', label: 'Column Mapper', icon: Database, color: 'text-accent-sky' },
  { id: 'orders', label: 'WMS Orders', icon: Package, color: 'text-accent-yellow' },
  { id: 'pick', label: 'Pick & Pack', icon: Layers, color: 'text-accent-sky' },
  { id: 'post', label: 'Posting', icon: Camera, color: 'text-accent-green' },
];

export default function OzonSheetsHub() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const addNotification = useAppStore((s) => s.addNotification);
  const operator = user?.displayName || user?.username || 'System';

  const [config, setConfig] = useState<SheetSyncConfig | null>(null);
  const [logs, setLogs] = useState<SheetSyncLog[]>([]);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMethod, setSyncMethod] = useState<SyncMethod>('live');
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string | null>>({});
  const [lastResult, setLastResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [automationOn, setAutomationOn] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [adminForm, setAdminForm] = useState({
    sheetUrl: DEFAULT_OZON_SHEET.url,
    apiKey: '',
    fetchMethod: 'auto' as SheetSyncConfig['fetchMethod'],
    syncIntervalMinutes: 15,
    autoSync: true,
    autoAllocate: true,
    skipDuplicates: true,
  });

  const load = useCallback(async () => {
    const configs = await db.sheetSyncConfigs.toArray();
    const cfg = configs[0] || null;
    setConfig(cfg);
    if (cfg) {
      setAdminForm({
        sheetUrl: cfg.sheetUrl,
        apiKey: cfg.apiKey || '',
        fetchMethod: cfg.fetchMethod,
        syncIntervalMinutes: cfg.syncIntervalMinutes,
        autoSync: cfg.autoSync === 1,
        autoAllocate: cfg.autoAllocate === 1,
        skipDuplicates: cfg.skipDuplicates === 1,
      });
      setAutomationOn(cfg.autoSync === 1);
    }
    const logData = await db.sheetSyncLogs.orderBy('createdAt').reverse().limit(20).toArray();
    setLogs(logData);
    setDevices(await getOnlineDevices());
    setPendingCount(await db.orders.where('status').equals('Pending').count());
    await registerLocalHeartbeat();
  }, []);

  const registerLocalHeartbeat = async () => {
    await registerDeviceHeartbeat(operator);
    setDevices(await getOnlineDevices());
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (automationOn && config?.autoSync === 1) {
      startAutomationLoop(operator, 5);
    } else {
      stopAutomationLoop();
    }
    return () => stopAutomationLoop();
  }, [automationOn, config?.autoSync, operator]);

  const previewSheet = async () => {
    if (!config) return;
    try {
      const parsed = adminForm.apiKey
        ? await fetchSheet({
            spreadsheetId: config.spreadsheetId,
            gid: config.gid,
            apiKey: adminForm.apiKey,
          }, 'api')
        : await fetchSheet({
            spreadsheetId: config.spreadsheetId,
            gid: config.gid,
          }, 'gviz');
      setPreviewHeaders(parsed.headers);
      setColumnMap(getDetectedMappingPreview(parsed.headers));
      addNotification({
        title: 'Sheet Preview',
        message: `Detected ${parsed.headers.length} columns, ${parsed.rawRowCount} rows`,
        type: 'success',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Preview failed';
      addNotification({ title: 'Preview Failed', message: msg, type: 'error' });
    }
  };

  const handleSync = async (file?: File) => {
    if (!config?.id) return;
    setSyncing(true);
    setLastResult(null);
    try {
      const result = await runSheetSync(config, operator, file);
      setLastResult(result);
      addNotification({
        title: 'Ozon Sheet Sync Complete',
        message: `+${result.imported} new, ~${result.updated} updated, ${result.skipped} skipped`,
        type: result.errors.length ? 'warning' : 'success',
      });
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      addNotification({ title: 'Sync Failed', message: msg, type: 'error' });
      setLastResult({ imported: 0, updated: 0, skipped: 0, errors: [msg] });
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseUploadedFile(file);
      setPreviewHeaders(parsed.headers);
      setColumnMap(getDetectedMappingPreview(parsed.headers));
      await handleSync(file);
    } catch (err) {
      addNotification({
        title: 'Upload Failed',
        message: err instanceof Error ? err.message : 'Could not parse file',
        type: 'error',
      });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveAdminConfig = async () => {
    if (!isAdmin || !config?.id) return;
    const parsed = parseSheetUrl(adminForm.sheetUrl);
    const now = new Date().toISOString();
    await db.sheetSyncConfigs.update(config.id, {
      sheetUrl: adminForm.sheetUrl,
      spreadsheetId: parsed?.spreadsheetId || config.spreadsheetId,
      gid: parsed?.gid || config.gid,
      apiKey: adminForm.apiKey || undefined,
      fetchMethod: adminForm.fetchMethod,
      syncIntervalMinutes: adminForm.syncIntervalMinutes,
      autoSync: adminForm.autoSync ? 1 : 0,
      autoAllocate: adminForm.autoAllocate ? 1 : 0,
      skipDuplicates: adminForm.skipDuplicates ? 1 : 0,
      updatedAt: now,
    });
    setAutomationOn(adminForm.autoSync);
    addNotification({ title: 'Config Saved', message: 'Sheet sync settings updated', type: 'success' });
    await load();
    setShowAdmin(false);
  };

  const toggleAutomation = async () => {
    if (!isAdmin || !config?.id) return;
    const next = !automationOn;
    await db.sheetSyncConfigs.update(config.id, { autoSync: next ? 1 : 0 });
    setAutomationOn(next);
    setAdminForm((f) => ({ ...f, autoSync: next }));
    addNotification({
      title: next ? 'Automation Enabled' : 'Automation Paused',
      message: next ? `Auto-sync every ${config.syncIntervalMinutes} min` : 'Manual sync only',
      type: 'info',
    });
  };

  const onlineCount = devices.filter((d) => d.isOnline).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sheet className="w-5 h-5 text-accent-green" />
            <h1 className="text-xl font-bold text-text-primary">Ozon Sheets Hub</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-green/20 text-accent-green uppercase tracking-wider">
              Live Pipeline
            </span>
          </div>
          <p className="text-sm text-text-secondary">
            Google Sheets → Orders → Inventory → Pick/Pack → Posting
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSync()}
            disabled={syncing || !config}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-sky text-black text-sm font-semibold hover:bg-accent-sky/90 disabled:opacity-50 transition-colors"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Now
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowAdmin(!showAdmin)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Admin
            </button>
          )}
          <a
            href={config?.sheetUrl || DEFAULT_OZON_SHEET.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-sm text-text-secondary hover:text-accent-green transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open Sheet
          </a>
        </div>
      </div>

      {/* Pipeline */}
      <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-center gap-2 lg:gap-0">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={() => {
                  if (step.id === 'pick') navigate('/pick-pack');
                  if (step.id === 'post') navigate('/posting-tracker');
                  if (step.id === 'orders') navigate('/batch-pick');
                }}
                className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors min-w-[90px]"
              >
                <div className={`w-10 h-10 rounded-full bg-white/5 flex items-center justify-center ${step.color}`}>
                  <step.icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] text-text-secondary font-medium">{step.label}</span>
              </motion.button>
              {i < PIPELINE_STEPS.length - 1 && (
                <ArrowRight className="w-4 h-4 text-white/20 mx-1 hidden sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pending Orders', value: pendingCount, icon: Package, color: 'text-accent-yellow' },
          { label: 'Devices Online', value: `${onlineCount}/${devices.length}`, icon: Users, color: 'text-accent-sky' },
          { label: 'Last Sync', value: config?.lastSync ? new Date(config.lastSync).toLocaleTimeString() : 'Never', icon: Clock, color: 'text-accent-green', small: true },
          { label: 'Auto-Sync', value: automationOn ? 'ON' : 'OFF', icon: Zap, color: automationOn ? 'text-accent-green' : 'text-text-secondary' },
        ].map((s) => (
          <div key={s.label} className="glass-panel rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-[10px] uppercase tracking-wider text-text-secondary">{s.label}</span>
            </div>
            <p className={`font-bold text-text-primary ${s.small ? 'text-sm' : 'text-2xl'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Sync Methods */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="flex border-b border-white/[0.06]">
              {([
                { id: 'live' as SyncMethod, label: 'Live URL', icon: Link2 },
                { id: 'api' as SyncMethod, label: 'API Key', icon: Key },
                { id: 'upload' as SyncMethod, label: 'CSV Upload', icon: Upload },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSyncMethod(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm transition-colors ${
                    syncMethod === tab.id
                      ? 'bg-accent-sky/10 text-accent-sky border-b-2 border-accent-sky'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              <AnimatePresence mode="wait">
                {syncMethod === 'live' && (
                  <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <p className="text-sm text-text-secondary">
                      Fetches via Google gviz CSV. Sheet must be published: <strong className="text-text-primary">Anyone with link → Viewer</strong>.
                    </p>
                    <div className="p-3 rounded-lg bg-white/5 font-mono text-xs text-text-secondary break-all">
                      {config?.sheetUrl || DEFAULT_OZON_SHEET.url}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={previewSheet} className="px-3 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 text-text-secondary">
                        Preview Columns
                      </button>
                      <button onClick={() => handleSync()} disabled={syncing} className="px-3 py-2 text-sm rounded-lg bg-accent-green/20 text-accent-green hover:bg-accent-green/30 disabled:opacity-50">
                        Pull from Sheet
                      </button>
                    </div>
                  </motion.div>
                )}
                {syncMethod === 'api' && (
                  <motion.div key="api" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <p className="text-sm text-text-secondary">
                      Use Google Sheets API v4 with a restricted API key. Works on private sheets if shared with the service account or key has access.
                    </p>
                    {isAdmin ? (
                      <input
                        type="password"
                        placeholder="Google API Key (admin only)"
                        value={adminForm.apiKey}
                        onChange={(e) => setAdminForm((f) => ({ ...f, apiKey: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-text-primary placeholder:text-text-secondary/50"
                      />
                    ) : (
                      <p className="text-xs text-accent-yellow flex items-center gap-1">
                        <Shield className="w-3 h-3" /> API key configured by admin
                      </p>
                    )}
                    <button onClick={() => handleSync()} disabled={syncing} className="px-3 py-2 text-sm rounded-lg bg-accent-sky/20 text-accent-sky hover:bg-accent-sky/30 disabled:opacity-50">
                      Sync via API
                    </button>
                  </motion.div>
                )}
                {syncMethod === 'upload' && (
                  <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <p className="text-sm text-text-secondary">
                      Export sheet as CSV from Google Sheets (File → Download → CSV) and upload. Works offline and with private sheets.
                    </p>
                    <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} className="hidden" />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={syncing}
                      className="w-full flex flex-col items-center gap-2 p-8 rounded-xl border-2 border-dashed border-white/10 hover:border-accent-sky/40 hover:bg-accent-sky/5 transition-colors"
                    >
                      <Upload className="w-8 h-8 text-accent-sky" />
                      <span className="text-sm text-text-primary font-medium">Drop CSV or click to upload</span>
                      <span className="text-xs text-text-secondary">Always works — no publish required</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {lastResult && (
                <div className={`mt-4 p-3 rounded-lg border ${
                  lastResult.errors.length ? 'border-accent-yellow/30 bg-accent-yellow/5' : 'border-accent-green/30 bg-accent-green/5'
                }`}>
                  <div className="flex items-center gap-2 text-sm">
                    {lastResult.errors.length ? (
                      <AlertTriangle className="w-4 h-4 text-accent-yellow" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-accent-green" />
                    )}
                    <span className="text-text-primary">
                      +{lastResult.imported} imported, {lastResult.updated} updated, {lastResult.skipped} skipped
                    </span>
                  </div>
                  {lastResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-accent-red mt-1">{err}</p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Column mapping */}
          {previewHeaders.length > 0 && (
            <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
              <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-accent-sky" />
                Auto-Detected Column Mapping
              </h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {Object.entries(columnMap).map(([field, col]) => (
                  <div key={field} className="flex items-center justify-between p-2 rounded-lg bg-white/5 text-xs">
                    <span className="text-text-secondary capitalize">{field}</span>
                    <span className={col ? 'text-accent-green font-mono' : 'text-accent-red'}>
                      {col || 'not found'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: devices + automation + logs */}
        <div className="space-y-4">
          {/* This device */}
          <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-accent-sky" />
              This Device
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">ID</span>
                <span className="font-mono text-text-primary">{getDeviceId()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Platform</span>
                <span className="text-text-primary">{getDeviceName()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Operator</span>
                <span className="text-text-primary">{operator}</span>
              </div>
            </div>
          </div>

          {/* Connected devices */}
          <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
            <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-accent-green" />
              Warehouse Devices ({onlineCount} online)
            </h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {devices.length === 0 ? (
                <p className="text-xs text-text-secondary">No devices registered yet</p>
              ) : (
                devices.map((d) => (
                  <div key={d.deviceId} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                    <div className={`w-2 h-2 rounded-full ${d.isOnline ? 'bg-accent-green' : 'bg-white/20'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate">{d.deviceName} · {d.operator}</p>
                      <p className="text-[10px] text-text-secondary font-mono">{d.deviceId}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Automation */}
          <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Bell className="w-4 h-4 text-accent-yellow" />
                Automation & Alerts
              </h3>
              {isAdmin && (
                <button
                  onClick={toggleAutomation}
                  className={`p-1.5 rounded-lg transition-colors ${
                    automationOn ? 'bg-accent-green/20 text-accent-green' : 'bg-white/5 text-text-secondary'
                  }`}
                >
                  {automationOn ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              )}
            </div>
            <ul className="space-y-1.5 text-xs text-text-secondary">
              <li className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-accent-sky" />
                Auto-sync every {config?.syncIntervalMinutes || 15} min
              </li>
              <li className="flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-accent-yellow" />
                Low-stock & order volume alerts
              </li>
              <li className="flex items-center gap-2">
                <Package className="w-3 h-3 text-accent-green" />
                Auto-allocate inventory on import
              </li>
            </ul>
          </div>

          {/* Recent logs */}
          <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Sync Log</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-xs text-text-secondary">No sync history yet</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-2 rounded-lg bg-white/5 text-xs">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {log.status === 'success' ? (
                        <CheckCircle className="w-3 h-3 text-accent-green" />
                      ) : log.status === 'error' ? (
                        <XCircle className="w-3 h-3 text-accent-red" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-accent-yellow" />
                      )}
                      <span className="text-text-primary truncate">{log.message}</span>
                    </div>
                    <p className="text-[10px] text-text-secondary">
                      {log.operator} · {(log.durationMs / 1000).toFixed(1)}s · {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin panel */}
      <AnimatePresence>
        {showAdmin && isAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="glass-panel rounded-xl p-5 border border-accent-sky/20"
          >
            <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-accent-sky" />
              Admin — Sheet Configuration
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs text-text-secondary block mb-1">Sheet URL</label>
                <input
                  value={adminForm.sheetUrl}
                  onChange={(e) => setAdminForm((f) => ({ ...f, sheetUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Fetch Method</label>
                <select
                  value={adminForm.fetchMethod}
                  onChange={(e) => setAdminForm((f) => ({ ...f, fetchMethod: e.target.value as SheetSyncConfig['fetchMethod'] }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
                >
                  <option value="auto">Auto (API then gviz)</option>
                  <option value="gviz">gviz CSV only</option>
                  <option value="api">API only</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Sync Interval (minutes)</label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={adminForm.syncIntervalMinutes}
                  onChange={(e) => setAdminForm((f) => ({ ...f, syncIntervalMinutes: parseInt(e.target.value, 10) || 15 }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">Google API Key</label>
                <input
                  type="password"
                  value={adminForm.apiKey}
                  onChange={(e) => setAdminForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder="Optional — for private sheets"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                {(['autoSync', 'autoAllocate', 'skipDuplicates'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminForm[key]}
                      onChange={(e) => setAdminForm((f) => ({ ...f, [key]: e.target.checked }))}
                      className="rounded"
                    />
                    {key === 'autoSync' ? 'Auto-sync' : key === 'autoAllocate' ? 'Auto-allocate' : 'Skip duplicates'}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveAdminConfig} className="px-4 py-2 rounded-lg bg-accent-sky text-black text-sm font-semibold">
                Save Configuration
              </button>
              <button onClick={() => setShowAdmin(false)} className="px-4 py-2 rounded-lg border border-white/10 text-sm text-text-secondary">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Pick & Pack', path: '/pick-pack', icon: Package },
          { label: 'Batch Pick', path: '/batch-pick', icon: Layers },
          { label: 'Posting Tracker', path: '/posting-tracker', icon: Camera },
          { label: 'Inventory Hub', path: '/inventory', icon: Database },
          { label: 'Integrations', path: '/integrations', icon: Zap },
        ].map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-xs text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <action.icon className="w-3.5 h-3.5" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}