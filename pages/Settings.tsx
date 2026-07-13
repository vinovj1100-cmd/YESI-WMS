import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db, exportAllData, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { User, Download, Upload, Trash2, AlertTriangle, Database, Activity } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [dbStats, setDbStats] = useState({
    inventory: 0, orders: 0, returns: 0, inbound: 0, logs: 0,
    movements: 0, cycleCounts: 0, tasks: 0, replenishments: 0,
    qcHolds: 0, waves: 0,
  });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (user?.displayName) setDisplayName(user.displayName);
  }, [user?.displayName]);

  const loadStats = async () => {
    const [inv, ord, ret, inb, logs, movements, cycleCounts, tasks, replenishments, qcHolds, waves] = await Promise.all([
      db.inventory.count(),
      db.orders.count(),
      db.returns.count(),
      db.inbound.count(),
      db.auditLogs.count(),
      db.inventoryMovements.count(),
      db.cycleCounts.count(),
      db.workerTasks.count(),
      db.replenishmentTasks.count(),
      db.qcHolds.count(),
      db.waveBatches.count(),
    ]);
    setDbStats({
      inventory: inv, orders: ord, returns: ret, inbound: inb, logs,
      movements, cycleCounts, tasks, replenishments, qcHolds, waves,
    });
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    try {
      await db.users.update(user.id, { displayName });
      updateUser({ displayName });
      await logAction('PROFILE_UPDATE', `Updated display name to ${displayName}`, displayName);
      setMessage({ type: 'success', text: 'Profile updated successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile' });
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vortex_wms_export_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await logAction('DATA_EXPORT', 'Full database export', user?.displayName || 'Unknown');
      setMessage({ type: 'success', text: 'Data exported successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Export failed' });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.inventory) await db.inventory.bulkPut(data.inventory);
      if (data.orders) await db.orders.bulkPut(data.orders);
      if (data.returns) await db.returns.bulkPut(data.returns);
      if (data.inbound) await db.inbound.bulkPut(data.inbound);
      if (data.inventoryMovements) await db.inventoryMovements.bulkPut(data.inventoryMovements);
      if (data.cycleCounts) await db.cycleCounts.bulkPut(data.cycleCounts);
      if (data.zoneCapacities) await db.zoneCapacities.bulkPut(data.zoneCapacities);
      if (data.workerTasks) await db.workerTasks.bulkPut(data.workerTasks);
      if (data.replenishmentTasks) await db.replenishmentTasks.bulkPut(data.replenishmentTasks);
      if (data.qcHolds) await db.qcHolds.bulkPut(data.qcHolds);
      if (data.waveBatches) await db.waveBatches.bulkPut(data.waveBatches);

      await logAction('DATA_IMPORT', 'Database import from file', user?.displayName || 'Unknown');
      setMessage({ type: 'success', text: 'Data imported successfully' });
      loadStats();
    } catch {
      setMessage({ type: 'error', text: 'Import failed - invalid file format' });
    }
  };

  const handleReset = async () => {
    try {
      await db.delete();
      window.location.reload();
    } catch {
      setMessage({ type: 'error', text: 'Reset failed' });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">System configuration and data management</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Profile */}
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Operator Profile</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Username</label>
              <p className="text-sm text-text-secondary font-mono py-2">{user?.username}</p>
            </div>

            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Role</label>
              <span className="inline-block text-xs bg-accent-sky/20 text-accent-sky px-2 py-0.5 rounded-full uppercase tracking-wider">
                {user?.role}
              </span>
            </div>

            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Session Timeout</label>
              <p className="text-sm text-text-secondary py-2">30 minutes of inactivity</p>
            </div>

            <motion.button
              onClick={handleUpdateProfile}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-2 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
            >
              Update Profile
            </motion.button>
          </div>
        </div>

        {/* Data Management */}
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Data Management</h3>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.inventory}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Inventory</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.orders}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Orders</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.returns}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Returns</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.logs}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Logs</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.movements}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Movements</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.cycleCounts}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Counts</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.tasks}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Tasks</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.qcHolds}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">QC Holds</p>
            </div>
            <div className="p-2 bg-white/[0.02] rounded-md text-center">
              <p className="text-lg font-bold text-text-primary">{dbStats.waves}</p>
              <p className="text-[9px] text-text-secondary uppercase tracking-wider">Waves</p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-md text-xs text-text-primary hover:bg-white/[0.06] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export All Data (JSON)
            </button>

            <label className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-md text-xs text-text-primary hover:bg-white/[0.06] transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Import Data (JSON)
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        </div>

        {/* System Health */}
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent-green" />
            <h3 className="text-sm font-semibold text-text-primary">System Health</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 bg-white/[0.02] rounded-md">
              <span className="text-xs text-text-secondary">Database Version</span>
              <span className="text-xs font-mono text-accent-green">v2.0</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-white/[0.02] rounded-md">
              <span className="text-xs text-text-secondary">Storage Engine</span>
              <span className="text-xs font-mono text-text-primary">IndexedDB (Dexie)</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-white/[0.02] rounded-md">
              <span className="text-xs text-text-secondary">Offline Mode</span>
              <span className="text-xs font-mono text-accent-green">Active</span>
            </div>
            <div className="flex items-center justify-between p-2 bg-white/[0.02] rounded-md">
              <span className="text-xs text-text-secondary">Session Security</span>
              <span className="text-xs font-mono text-accent-green">30min Timeout</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="glass-panel rounded-lg p-6 border border-accent-red/20">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-accent-red" />
            <h3 className="text-sm font-semibold text-accent-red">Danger Zone</h3>
          </div>

          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent-red/10 border border-accent-red/20 rounded-md text-xs text-accent-red hover:bg-accent-red/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset All Data
            </button>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <p className="text-xs text-accent-red">This will permanently delete all data and reload the application. Are you sure?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-accent-red text-white text-xs rounded-md hover:bg-accent-red/90 transition-colors"
                >
                  Yes, Reset Everything
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 bg-white/[0.05] text-text-secondary text-xs rounded-md hover:bg-white/[0.08] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`fixed bottom-6 right-6 p-3 rounded-md text-xs ${
            message.type === 'success'
              ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
              : message.type === 'warning'
                ? 'bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow'
                : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
          }`}
        >
          {message.text}
        </motion.div>
      )}
    </div>
  );
}
