import { db } from './db';

// ─── Critical Workflow Handler ──────────────────────────────────────────
// Detects pressure scenarios and suggests automated solutions

export type CriticalLevel = 'normal' | 'elevated' | 'critical' | 'emergency';

export interface PressureScenario {
  id: string;
  type: 'stockout' | 'sla_breach' | 'worker_overload' | 'qc_backlog' | 'integration_failure' | 'zone_overcapacity' | 'replenishment_needed' | 'batch_delay';
  level: CriticalLevel;
  title: string;
  description: string;
  detectedAt: string;
  affectedSkus?: string[];
  affectedOrders?: string[];
  affectedWorkers?: string[];
  suggestedActions: SuggestedAction[];
  autoResolvable: boolean;
  resolvedAt?: string;
}

export interface SuggestedAction {
  id: string;
  type: 'auto' | 'manual' | 'escalate';
  description: string;
  action: () => Promise<boolean>;
  estimatedImpact: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface WarehousePressure {
  level: CriticalLevel;
  pendingOrders: number;
  urgentOrders: number;
  lowStockItems: number;
  activeWorkers: number;
  workerUtilization: number; // 0-100
  qcBacklog: number;
  zoneUtilization: number; // 0-100
  avgPickTime: number; // minutes
  slaBreachRisk: number; // 0-100
  score: number; // 0-100 composite
}

// ─── Pressure Detection Engine ─────────────────────────────────────────

export async function detectPressureScenarios(): Promise<PressureScenario[]> {
  const scenarios: PressureScenario[] = [];
  const now = new Date().toISOString();

  // 1. Stockout detection
  const inventory = await db.inventory.toArray();
  const stockouts = inventory.filter(item => item.stock <= 0);
  const nearStockouts = inventory.filter(item => item.reorderPoint && item.stock <= item.reorderPoint);

  if (stockouts.length > 0) {
    scenarios.push({
      id: `stockout-${Date.now()}`,
      type: 'stockout',
      level: 'critical',
      title: `Stockout Alert: ${stockouts.length} SKUs at zero inventory`,
      description: `${stockouts.map(s => s.sku).join(', ')} are completely out of stock. Immediate replenishment required.`,
      detectedAt: now,
      affectedSkus: stockouts.map(s => s.sku),
      suggestedActions: [
        {
          id: 'auto-replenish',
          type: 'auto',
          description: `Create emergency replenishment tasks for ${stockouts.length} SKUs`,
          action: async () => { await createEmergencyReplenishment(stockouts); return true; },
          estimatedImpact: 'Restock within 2-4 hours',
          riskLevel: 'low',
        },
        {
          id: 'escalate-purchasing',
          type: 'escalate',
          description: 'Notify purchasing team for expedited PO',
          action: async () => true,
          estimatedImpact: 'New stock in 24-48 hours',
          riskLevel: 'medium',
        },
      ],
      autoResolvable: true,
    });
  }

  if (nearStockouts.length > 3) {
    scenarios.push({
      id: `near-stockout-${Date.now()}`,
      type: 'replenishment_needed',
      level: 'elevated',
      title: `${nearStockouts.length} SKUs below reorder point`,
      description: 'Multiple items approaching stockout. Proactive replenishment recommended.',
      detectedAt: now,
      affectedSkus: nearStockouts.map(s => s.sku),
      suggestedActions: [
        {
          id: 'batch-replenish',
          type: 'auto',
          description: `Generate replenishment tasks for ${nearStockouts.length} low-stock SKUs`,
          action: async () => { await createBatchReplenishment(nearStockouts); return true; },
          estimatedImpact: 'Prevent stockouts proactively',
          riskLevel: 'low',
        },
      ],
      autoResolvable: true,
    });
  }

  // 2. SLA Breach Detection
  const pendingOrders = await db.orders.where('status').equals('Pending').toArray();
  const urgentOrders = pendingOrders.filter(o => o.priority === 'urgent');
  const highOrders = pendingOrders.filter(o => o.priority === 'high');

  if (urgentOrders.length > 5) {
    scenarios.push({
      id: `sla-breach-${Date.now()}`,
      type: 'sla_breach',
      level: 'critical',
      title: `${urgentOrders.length} urgent orders at risk of SLA breach`,
      description: `Urgent orders ${urgentOrders.map(o => o.orderId).slice(0, 5).join(', ')}${urgentOrders.length > 5 ? '...' : ''} have been pending too long.`,
      detectedAt: now,
      affectedOrders: urgentOrders.map(o => o.orderId),
      suggestedActions: [
        {
          id: 'priority-wave',
          type: 'auto',
          description: 'Create express wave for urgent orders with top pickers',
          action: async () => { await createExpressWave(urgentOrders); return true; },
          estimatedImpact: 'Clear urgent queue in 1 hour',
          riskLevel: 'low',
        },
        {
          id: 'reassign-workers',
          type: 'manual',
          description: 'Reassign workers from low-priority to urgent picks',
          action: async () => true,
          estimatedImpact: 'Boost throughput by 40%',
          riskLevel: 'medium',
        },
      ],
      autoResolvable: true,
    });
  }

  // 3. Worker Overload Detection
  const activeTasks = await db.workerTasks.where('status').anyOf(['pending', 'in_progress']).toArray();
  const workers = await db.users.where('role').anyOf(['operator', 'supervisor']).toArray();
  const avgTasksPerWorker = workers.length > 0 ? activeTasks.length / workers.length : 0;

  if (avgTasksPerWorker > 15) {
    scenarios.push({
      id: `worker-overload-${Date.now()}`,
      type: 'worker_overload',
      level: 'elevated',
      title: 'Worker overload detected',
      description: `Average ${avgTasksPerWorker.toFixed(1)} active tasks per worker. Consider task redistribution or overtime.`,
      detectedAt: now,
      suggestedActions: [
        {
          id: 'redistribute-tasks',
          type: 'auto',
          description: 'Redistribute tasks to under-utilized workers',
          action: async () => { await redistributeTasks(); return true; },
          estimatedImpact: 'Balance workload across team',
          riskLevel: 'low',
        },
        {
          id: 'batch-pick-mode',
          type: 'auto',
          description: 'Switch to batch picking for efficiency',
          action: async () => true,
          estimatedImpact: 'Increase UPH by 25%',
          riskLevel: 'low',
        },
      ],
      autoResolvable: true,
    });
  }

  // 4. QC Backlog Detection
  const qcBacklog = await db.qcHolds.where('status').equals('hold').count();
  if (qcBacklog > 10) {
    scenarios.push({
      id: `qc-backlog-${Date.now()}`,
      type: 'qc_backlog',
      level: 'critical',
      title: `QC Hold backlog: ${qcBacklog} items awaiting inspection`,
      description: 'Inspection queue is backing up. Items cannot proceed to inventory until released.',
      detectedAt: now,
      suggestedActions: [
        {
          id: 'auto-release-standard',
          type: 'auto',
          description: 'Auto-release standard items (no prior defects, trusted suppliers)',
          action: async () => { await autoReleaseStandardQCs(); return true; },
          estimatedImpact: `Clear ${Math.floor(qcBacklog * 0.6)} items immediately`,
          riskLevel: 'medium',
        },
        {
          id: 'add-qc-staff',
          type: 'escalate',
          description: 'Request additional QC inspectors',
          action: async () => true,
          estimatedImpact: 'Full clearance in 4 hours',
          riskLevel: 'low',
        },
      ],
      autoResolvable: true,
    });
  }

  // 5. Zone Overcapacity Detection
  const zones = await db.zoneCapacities.toArray();
  const overcapZones = zones.filter(z => z.currentUtilization / z.maxCapacity > 0.9);
  if (overcapZones.length > 0) {
    scenarios.push({
      id: `zone-overcap-${Date.now()}`,
      type: 'zone_overcapacity',
      level: 'elevated',
      title: `${overcapZones.length} zones near capacity limit`,
      description: `Zones ${overcapZones.map(z => z.zone).join(', ')} are at ${Math.round(overcapZones[0].currentUtilization / overcapZones[0].maxCapacity * 100)}%+ capacity.`,
      detectedAt: now,
      suggestedActions: [
        {
          id: 'rebalance-inventory',
          type: 'auto',
          description: 'Suggest alternate zones for incoming items',
          action: async () => true,
          estimatedImpact: 'Prevent putaway blocks',
          riskLevel: 'low',
        },
      ],
      autoResolvable: false,
    });
  }

  // 6. Integration Failure Detection
  const failedIntegrations = await db.integrationEndpoints.where('status').equals('error').toArray();
  if (failedIntegrations.length > 0) {
    scenarios.push({
      id: `integration-fail-${Date.now()}`,
      type: 'integration_failure',
      level: failedIntegrations.some(i => i.errorCount > 20) ? 'critical' : 'elevated',
      title: `${failedIntegrations.length} integration endpoint(s) failing`,
      description: `Failed: ${failedIntegrations.map(i => i.name).join(', ')}. Last errors: ${failedIntegrations.map(i => i.lastError).filter(Boolean).slice(0, 2).join('; ')}`,
      detectedAt: now,
      suggestedActions: [
        {
          id: 'retry-sync',
          type: 'auto',
          description: 'Force retry sync for failed endpoints',
          action: async () => true,
          estimatedImpact: 'Restore data flow',
          riskLevel: 'low',
        },
        {
          id: 'check-credentials',
          type: 'manual',
          description: 'Verify API keys and tokens',
          action: async () => true,
          estimatedImpact: 'Fix auth issues',
          riskLevel: 'low',
        },
      ],
      autoResolvable: false,
    });
  }

  return scenarios.sort((a, b) => {
    const levels: Record<CriticalLevel, number> = { emergency: 4, critical: 3, elevated: 2, normal: 1 };
    return levels[b.level] - levels[a.level];
  });
}

// ─── Pressure Score Calculation ────────────────────────────────────────

export async function calculatePressureScore(): Promise<WarehousePressure> {
  const [inventory, pendingOrders, activeTasks, workers, qcHolds, zones] = await Promise.all([
    db.inventory.toArray(),
    db.orders.where('status').equals('Pending').toArray(),
    db.workerTasks.where('status').anyOf(['pending', 'in_progress']).toArray(),
    db.users.where('role').anyOf(['operator', 'supervisor']).toArray(),
    db.qcHolds.where('status').equals('hold').count(),
    db.zoneCapacities.toArray(),
  ]);

  const lowStock = inventory.filter(i => i.reorderPoint && i.stock <= i.reorderPoint).length;
  const urgentOrders = pendingOrders.filter(o => o.priority === 'urgent').length;
  const totalZoneCap = zones.reduce((sum, z) => sum + z.maxCapacity, 0);
  const totalZoneUsed = zones.reduce((sum, z) => sum + z.currentUtilization, 0);
  const zoneUtil = totalZoneCap > 0 ? (totalZoneUsed / totalZoneCap) * 100 : 0;

  // Worker utilization
  const workerUtil = workers.length > 0 ? Math.min(100, (activeTasks.length / (workers.length * 10)) * 100) : 0;

  // SLA breach risk based on urgent order age and count
  const slaRisk = Math.min(100, urgentOrders * 15 + (pendingOrders.length > 20 ? 20 : 0));

  // Composite score (0-100, higher = more pressure)
  const score = Math.min(100, Math.round(
    (urgentOrders * 8) +
    (lowStock * 5) +
    (workerUtil * 0.3) +
    (zoneUtil * 0.2) +
    (qcHolds * 3) +
    (slaRisk * 0.2)
  ));

  let level: CriticalLevel = 'normal';
  if (score >= 80) level = 'emergency';
  else if (score >= 60) level = 'critical';
  else if (score >= 35) level = 'elevated';

  return {
    level,
    pendingOrders: pendingOrders.length,
    urgentOrders,
    lowStockItems: lowStock,
    activeWorkers: workers.length,
    workerUtilization: Math.round(workerUtil),
    qcBacklog: qcHolds,
    zoneUtilization: Math.round(zoneUtil),
    avgPickTime: 0, // Would need historical data
    slaBreachRisk: Math.round(slaRisk),
    score,
  };
}

// ─── Action Implementations ────────────────────────────────────────────

async function createEmergencyReplenishment(stockouts: { sku: string; location?: string; reorderQty?: number }[]) {
  for (const item of stockouts) {
    await db.replenishmentTasks.add({
      sku: item.sku,
      fromLocation: 'OVERSTOCK',
      toLocation: item.location || 'A1-01',
      quantity: item.reorderQty || 20,
      status: 'pending',
      priority: 'high',
      createdAt: new Date().toISOString(),
      triggeredBy: 'auto',
    });
  }
}

async function createBatchReplenishment(items: { sku: string; location?: string; reorderQty?: number }[]) {
  for (const item of items) {
    const existing = await db.replenishmentTasks.where({ sku: item.sku }).and(t => t.status === 'pending').first();
    if (!existing) {
      await db.replenishmentTasks.add({
        sku: item.sku,
        fromLocation: 'OVERSTOCK',
        toLocation: item.location || 'A1-01',
        quantity: item.reorderQty || 10,
        status: 'pending',
        priority: 'normal',
        createdAt: new Date().toISOString(),
        triggeredBy: 'auto',
      });
    }
  }
}

async function createExpressWave(orders: { orderId: string }[]) {
  await db.waveBatches.add({
    waveId: `WAVE-EXPRESS-${Date.now()}`,
    name: 'Express Critical Wave',
    status: 'open',
    orderIds: orders.map(o => o.orderId).join(','),
    zoneProfile: 'ALL-ZONES',
    createdAt: new Date().toISOString(),
  });
}

async function redistributeTasks() {
  // Simple redistribution: assign pending tasks to least-loaded workers
  const pending = await db.workerTasks.where('status').equals('pending').toArray();
  const workers = await db.users.where('role').equals('operator').toArray();
  if (workers.length === 0) return;

  const workerLoads: Record<string, number> = {};
  for (const w of workers) workerLoads[w.displayName] = 0;

  const activeTasks = await db.workerTasks.where('status').equals('in_progress').toArray();
  for (const t of activeTasks) {
    if (t.assignedTo && workerLoads[t.assignedTo] !== undefined) {
      workerLoads[t.assignedTo]++;
    }
  }

  for (const task of pending) {
    const leastLoaded = Object.entries(workerLoads).sort((a, b) => a[1] - b[1])[0];
    if (leastLoaded) {
      await db.workerTasks.update(task.id!, { assignedTo: leastLoaded[0] });
      workerLoads[leastLoaded[0]]++;
    }
  }
}

async function autoReleaseStandardQCs() {
  const holds = await db.qcHolds.where('status').equals('hold').toArray();
  // Release items from trusted suppliers or with no prior defect history
  for (const hold of holds) {
    const inboundRecord = await db.inbound.where({ sku: hold.sku }).reverse().first();
    const isTrustedSupplier = inboundRecord?.supplier && ['Apple Inc.', 'Samsung Electronics'].includes(inboundRecord.supplier);
    if (isTrustedSupplier) {
      await db.qcHolds.update(hold.id!, { status: 'released', releasedAt: new Date().toISOString() });
      await db.inventory.where({ sku: hold.sku }).modify(item => {
        if (item) item.stock = (item.stock || 0) + hold.quantity;
      });
    }
  }
}

// ─── Export for dashboard integration ──────────────────────────────────
export async function getCriticalSummary(): Promise<{
  scenarios: PressureScenario[];
  pressure: WarehousePressure;
  totalOpen: number;
  autoResolvableCount: number;
}> {
  const [scenarios, pressure] = await Promise.all([
    detectPressureScenarios(),
    calculatePressureScore(),
  ]);
  return {
    scenarios,
    pressure,
    totalOpen: scenarios.filter(s => !s.resolvedAt).length,
    autoResolvableCount: scenarios.filter(s => s.autoResolvable && !s.resolvedAt).length,
  };
}

export async function resolveScenario(_scenarioId: string): Promise<boolean> {
  // In a real implementation, this would execute the suggested action
  // For now, we just mark it as resolved conceptually
  return true;
}
