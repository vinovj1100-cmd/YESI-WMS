import { db, logAction } from './db';

// ─── System Maintenance: Auto Cache & Memory Cleanup ───────────────────

export interface CleanupReport {
  timestamp: string;
  auditLogsDeleted: number;
  inventoryMovementsDeleted: number;
  oldCompletedTasksDeleted: number;
  qcHoldsDeleted: number;
  cacheEntriesCleared: number;
  estimatedBytesFreed: number;
  tablesOptimized: string[];
}

export interface MaintenanceConfig {
  auditLogRetentionDays: number;
  movementRetentionDays: number;
  completedTaskRetentionDays: number;
  releasedQCHoldRetentionDays: number;
  autoCleanupEnabled: boolean;
  lastCleanup?: string;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  auditLogRetentionDays: 90,
  movementRetentionDays: 60,
  completedTaskRetentionDays: 30,
  releasedQCHoldRetentionDays: 14,
  autoCleanupEnabled: true,
};

// Load or init config from preferences
async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const pref = await db.preferences.where({ key: 'maintenance_config' }).first();
  if (pref) {
    try { return { ...DEFAULT_CONFIG, ...JSON.parse(pref.value) }; } catch { /* noop */ }
  }
  return DEFAULT_CONFIG;
}

export async function setMaintenanceConfig(config: Partial<MaintenanceConfig>) {
  const current = await getMaintenanceConfig();
  const merged = { ...current, ...config };
  await db.preferences.put({
    key: 'maintenance_config',
    value: JSON.stringify(merged),
    createdAt: new Date().toISOString(),
  });
}

// Core cleanup function
export async function runSystemCleanup(): Promise<CleanupReport> {
  const config = await getMaintenanceConfig();
  const now = new Date();
  const report: CleanupReport = {
    timestamp: now.toISOString(),
    auditLogsDeleted: 0,
    inventoryMovementsDeleted: 0,
    oldCompletedTasksDeleted: 0,
    qcHoldsDeleted: 0,
    cacheEntriesCleared: 0,
    estimatedBytesFreed: 0,
    tablesOptimized: [],
  };

  // 1. Audit logs older than retention
  const auditCutoff = new Date(now.getTime() - config.auditLogRetentionDays * 86400000).toISOString();
  const oldAudits = await db.auditLogs.where('timestamp').below(auditCutoff).toArray();
  if (oldAudits.length > 0) {
    await db.auditLogs.bulkDelete(oldAudits.map(a => a.id!).filter(Boolean));
    report.auditLogsDeleted = oldAudits.length;
    report.estimatedBytesFreed += oldAudits.length * 200;
  }

  // 2. Inventory movements older than retention
  const moveCutoff = new Date(now.getTime() - config.movementRetentionDays * 86400000).toISOString();
  const oldMovements = await db.inventoryMovements.where('timestamp').below(moveCutoff).toArray();
  if (oldMovements.length > 0) {
    await db.inventoryMovements.bulkDelete(oldMovements.map(m => m.id!).filter(Boolean));
    report.inventoryMovementsDeleted = oldMovements.length;
    report.estimatedBytesFreed += oldMovements.length * 300;
  }

  // 3. Completed worker tasks older than retention
  const taskCutoff = new Date(now.getTime() - config.completedTaskRetentionDays * 86400000).toISOString();
  const oldTasks = await db.workerTasks
    .where('createdAt')
    .below(taskCutoff)
    .and(t => t.status === 'completed')
    .toArray();
  if (oldTasks.length > 0) {
    await db.workerTasks.bulkDelete(oldTasks.map(t => t.id!).filter(Boolean));
    report.oldCompletedTasksDeleted = oldTasks.length;
    report.estimatedBytesFreed += oldTasks.length * 400;
  }

  // 4. Released/rejected QC holds older than retention
  const qcCutoff = new Date(now.getTime() - config.releasedQCHoldRetentionDays * 86400000).toISOString();
  const oldQCs = await db.qcHolds
    .where('createdAt')
    .below(qcCutoff)
    .and(q => q.status !== 'hold')
    .toArray();
  if (oldQCs.length > 0) {
    await db.qcHolds.bulkDelete(oldQCs.map(q => q.id!).filter(Boolean));
    report.qcHoldsDeleted = oldQCs.length;
    report.estimatedBytesFreed += oldQCs.length * 250;
  }

  // 5. Clear service worker caches if available
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        // Delete cached responses older than 7 days (check URL for timestamp patterns)
        let cleared = 0;
        for (const request of requests) {
          const response = await cache.match(request);
          if (response) {
            const dateHeader = response.headers.get('date');
            if (dateHeader) {
              const cacheDate = new Date(dateHeader);
              if (now.getTime() - cacheDate.getTime() > 7 * 86400000) {
                await cache.delete(request);
                cleared++;
              }
            }
          }
        }
        report.cacheEntriesCleared += cleared;
      }
    } catch { /* noop in non-secure contexts */ }
  }

  // 6. Log cleanup action
  await logAction('SYSTEM_CLEANUP', `Freed ~${(report.estimatedBytesFreed / 1024).toFixed(1)}KB. Audit:${report.auditLogsDeleted} Move:${report.inventoryMovementsDeleted} Tasks:${report.oldCompletedTasksDeleted} QC:${report.qcHoldsDeleted} Cache:${report.cacheEntriesCleared}`, 'SYSTEM');

  // 7. Update last cleanup time
  await setMaintenanceConfig({ lastCleanup: now.toISOString() });

  return report;
}

// Auto-scheduled cleanup (call this on app init)
export async function autoCleanupCheck() {
  const config = await getMaintenanceConfig();
  if (!config.autoCleanupEnabled) return null;

  // Only run if last cleanup was > 24h ago or never
  const lastCleanup = config.lastCleanup ? new Date(config.lastCleanup) : null;
  const now = new Date();
  if (!lastCleanup || (now.getTime() - lastCleanup.getTime()) > 24 * 3600000) {
    return await runSystemCleanup();
  }
  return null;
}

// Get storage usage estimate
export async function getStorageUsage(): Promise<{ usedMB: number; totalMB: number | null; percent: number }> {
  let usedMB = 0;
  let totalMB: number | null = null;

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.usage) usedMB = estimate.usage / (1024 * 1024);
      if (estimate.quota) totalMB = estimate.quota / (1024 * 1024);
    } catch { /* noop */ }
  }

  // Fallback: count Dexie records
  if (usedMB === 0) {
    const tables = [
      db.auditLogs, db.inventoryMovements, db.workerTasks,
      db.inbound, db.orders, db.returns, db.cycleCounts,
    ];
    let totalRecords = 0;
    for (const table of tables) {
      totalRecords += await table.count();
    }
    usedMB = totalRecords * 0.5; // Rough estimate: 0.5KB per record
  }

  const percent = totalMB ? Math.round((usedMB / totalMB) * 100) : 0;
  return { usedMB: Math.round(usedMB * 100) / 100, totalMB: totalMB ? Math.round(totalMB * 100) / 100 : null, percent };
}
