import { db } from './db';
import { runSheetSync } from './ozonSheetSync';
import { detectPressureScenarios } from './criticalWorkflow';
import { useAppStore } from './store';

let automationTimer: ReturnType<typeof setInterval> | null = null;

export async function runAutomationChecks(operator: string): Promise<string[]> {
  const alerts: string[] = [];

  const configs = await db.sheetSyncConfigs.where('autoSync').equals(1).toArray();
  for (const config of configs) {
    const lastSync = config.lastSync ? new Date(config.lastSync).getTime() : 0;
    const intervalMs = (config.syncIntervalMinutes || 15) * 60 * 1000;
    if (Date.now() - lastSync >= intervalMs) {
      try {
        const result = await runSheetSync(config, operator);
        alerts.push(`Sheet sync: ${result.imported} new orders from ${config.name}`);
        useAppStore.getState().addNotification({
          title: 'Ozon Sheet Sync',
          message: `Imported ${result.imported} orders from ${config.name}`,
          type: 'success',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Sync failed';
        useAppStore.getState().addNotification({
          title: 'Sheet Sync Failed',
          message: msg,
          type: 'error',
        });
      }
    }
  }

  const inventory = await db.inventory.toArray();
  const lowStock = inventory.filter((i) => (i.reorderPoint || 10) >= (i.stock || 0));
  if (lowStock.length > 0) {
    alerts.push(`${lowStock.length} SKUs below reorder point`);
    useAppStore.getState().addNotification({
      title: 'Low Stock Alert',
      message: `${lowStock.length} SKUs need replenishment`,
      type: 'warning',
    });
  }

  const scenarios = await detectPressureScenarios();
  for (const s of scenarios.filter((x) => x.level === 'critical' || x.level === 'emergency').slice(0, 3)) {
    useAppStore.getState().addNotification({
      title: s.title,
      message: s.description.slice(0, 120),
      type: 'error',
    });
    alerts.push(s.title);
  }

  const pendingOrders = await db.orders.where('status').equals('Pending').count();
  if (pendingOrders > 20) {
    useAppStore.getState().addNotification({
      title: 'High Order Volume',
      message: `${pendingOrders} pending Ozon orders — consider batch picking`,
      type: 'warning',
    });
  }

  return alerts;
}

export function startAutomationLoop(operator: string, intervalMinutes = 5) {
  stopAutomationLoop();
  runAutomationChecks(operator).catch(console.error);
  automationTimer = setInterval(() => {
    runAutomationChecks(operator).catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

export function stopAutomationLoop() {
  if (automationTimer) {
    clearInterval(automationTimer);
    automationTimer = null;
  }
}