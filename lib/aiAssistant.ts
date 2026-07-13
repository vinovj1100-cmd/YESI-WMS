import { db } from './db';
import { calculatePressureScore, detectPressureScenarios } from './criticalWorkflow';
import { calculateAdaptation } from './adaptation';
import { getAllocationSummary } from './allocation';
import { optimizePickPath } from './pickPathOptimizer';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  actions?: AssistantAction[];
}

export interface AssistantAction {
  label: string;
  path?: string;
  type: 'navigate' | 'action';
}

interface IntentMatch {
  intent: string;
  confidence: number;
  entities: Record<string, string>;
}

const INTENT_PATTERNS: { intent: string; patterns: RegExp[] }[] = [
  { intent: 'greeting', patterns: [/^(hi|hello|hey|good\s*(morning|afternoon|evening))/i, /^what can you do/i, /^help$/i] },
  { intent: 'stock_lookup', patterns: [/stock|inventory|how many|qty|quantity/i, /where is\s+(\S+)/i, /lookup\s+(\S+)/i] },
  { intent: 'low_stock', patterns: [/low stock|stockout|out of stock|reorder|running low/i] },
  { intent: 'order_status', patterns: [/order|ord-|pending orders|shipped|fulfillment/i] },
  { intent: 'pressure', patterns: [/pressure|guardian|crisis|surge|warehouse status|ops status/i] },
  { intent: 'putaway', patterns: [/putaway|put away|receiving dock/i] },
  { intent: 'serial', patterns: [/serial|imei|sn-|traceability/i] },
  { intent: 'batch_pick', patterns: [/batch|pick path|wave|optimize pick/i] },
  { intent: 'dock', patterns: [/dock|appointment|yard|asn|inbound schedule/i] },
  { intent: 'allocation', patterns: [/allocat|reserv|fefo|fifo/i] },
  { intent: 'labor', patterns: [/labor|worker|uph|productivity|staff/i] },
  { intent: 'navigate', patterns: [/go to|open|show me|navigate|take me to/i] },
  { intent: 'replenish', patterns: [/replenish|restock|create replen/i] },
  { intent: 'analytics', patterns: [/analytics|kpi|report|trend|forecast/i] },
];

function matchIntent(input: string): IntentMatch {
  const normalized = input.trim().toLowerCase();
  let best: IntentMatch = { intent: 'unknown', confidence: 0, entities: {} };

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        const confidence = match[0].length / normalized.length;
        if (confidence > best.confidence || best.intent === 'unknown') {
          best = {
            intent,
            confidence: Math.min(1, confidence + 0.3),
            entities: {},
          };
          if (match[1]) best.entities.sku = match[1].toUpperCase();
        }
      }
    }
  }

  const skuMatch = input.match(/\b([A-Z]{2,4}-[A-Z0-9-]+)\b/i);
  if (skuMatch) best.entities.sku = skuMatch[1].toUpperCase();

  const orderMatch = input.match(/\b(ORD-\d+)\b/i);
  if (orderMatch) best.entities.orderId = orderMatch[1].toUpperCase();

  const serialMatch = input.match(/\b(SN-[A-Z0-9-]+)\b/i);
  if (serialMatch) best.entities.serial = serialMatch[1].toUpperCase();

  return best;
}

const NAV_MAP: Record<string, { path: string; label: string }> = {
  dashboard: { path: '/', label: 'Dashboard' },
  inbound: { path: '/inbound', label: 'Inbound Receiving' },
  inventory: { path: '/inventory', label: 'Inventory Hub' },
  pick: { path: '/pick-pack', label: 'Pick & Pack' },
  'pick-pack': { path: '/pick-pack', label: 'Pick & Pack' },
  putaway: { path: '/putaway', label: 'Putaway Management' },
  serial: { path: '/serial-tracking', label: 'Serial Tracking' },
  batch: { path: '/batch-pick', label: 'Batch Pick Center' },
  dock: { path: '/dock', label: 'Dock Management' },
  shipping: { path: '/shipping', label: 'Shipping' },
  replenishment: { path: '/replenishment', label: 'Replenishment' },
  analytics: { path: '/analytics', label: 'Analytics' },
  labor: { path: '/labor', label: 'Labor Management' },
  guardian: { path: '/guardian', label: 'Guardian Ops' },
  qc: { path: '/qc', label: 'QC Management' },
  'cycle-count': { path: '/cycle-count', label: 'Cycle Count' },
};

async function handleGreeting(): Promise<{ content: string; actions: AssistantAction[] }> {
  const pressure = await calculatePressureScore();
  return {
    content: `Hello! I'm **Vortex AI**, your warehouse operations assistant. Current warehouse pressure is **${pressure.level}** (score ${pressure.score}/100).\n\nI can help with:\n• Stock & order lookups\n• Low stock & allocation alerts\n• Putaway, batch pick & dock scheduling\n• Guardian pressure analysis\n• Quick navigation\n\nTry: *"show low stock items"* or *"what's the pressure status?"*`,
    actions: [
      { label: 'Dashboard', path: '/', type: 'navigate' },
      { label: 'Guardian Ops', path: '/guardian', type: 'navigate' },
    ],
  };
}

async function handleStockLookup(entities: Record<string, string>): Promise<{ content: string; actions: AssistantAction[] }> {
  if (entities.sku) {
    const item = await db.inventory.where('sku').equals(entities.sku).first();
    if (!item) {
      return { content: `No inventory found for SKU **${entities.sku}**. Check spelling or search in Inventory Hub.`, actions: [{ label: 'Inventory Hub', path: '/inventory', type: 'navigate' }] };
    }
    const serials = await db.serialNumbers.where('sku').equals(entities.sku).count();
    return {
      content: `**${item.sku}** — ${item.product}\n• Stock: **${item.stock}** units\n• Location: **${item.location}** (Zone ${item.location.split('-')[0]})\n• Velocity: ${item.velocity || 'medium'}\n• Reorder point: ${item.reorderPoint ?? 'N/A'}\n• Lot: ${item.lotNumber || 'N/A'}\n• Serialized units tracked: ${serials}`,
      actions: [{ label: 'View Inventory', path: '/inventory', type: 'navigate' }],
    };
  }

  const inventory = await db.inventory.toArray();
  const totalSkus = inventory.length;
  const totalUnits = inventory.reduce((s, i) => s + (i.stock || 0), 0);
  return {
    content: `**Inventory Overview**\n• ${totalSkus} active SKUs\n• ${totalUnits.toLocaleString()} total units on hand\n• Top velocity items: ${inventory.filter(i => i.velocity === 'high').map(i => i.sku).slice(0, 3).join(', ') || 'none'}`,
    actions: [{ label: 'Inventory Hub', path: '/inventory', type: 'navigate' }],
  };
}

async function handleLowStock(): Promise<{ content: string; actions: AssistantAction[] }> {
  const inventory = await db.inventory.toArray();
  const low = inventory.filter(i => i.reorderPoint && (i.stock || 0) <= i.reorderPoint);
  const stockouts = inventory.filter(i => (i.stock || 0) === 0);

  if (low.length === 0) {
    return { content: 'All SKUs are above reorder points. No immediate stock concerns.', actions: [] };
  }

  const lines = low.slice(0, 8).map(i => `• **${i.sku}**: ${i.stock} units (reorder at ${i.reorderPoint})${i.stock === 0 ? ' ⚠️ STOCKOUT' : ''}`);
  return {
    content: `**${low.length} SKUs** below reorder point (${stockouts.length} at zero):\n\n${lines.join('\n')}${low.length > 8 ? `\n\n...and ${low.length - 8} more` : ''}`,
    actions: [
      { label: 'Replenishment', path: '/replenishment', type: 'navigate' },
      { label: 'Guardian Ops', path: '/guardian', type: 'navigate' },
    ],
  };
}

async function handleOrderStatus(entities: Record<string, string>): Promise<{ content: string; actions: AssistantAction[] }> {
  if (entities.orderId) {
    const order = await db.orders.where('orderId').equals(entities.orderId).first();
    if (!order) return { content: `Order **${entities.orderId}** not found.`, actions: [] };
    return {
      content: `**${order.orderId}**\n• Status: **${order.status}**\n• Priority: ${order.priority}\n• SKUs: ${order.requiredSkus}\n• Carrier: ${order.carrier || 'Not assigned'}\n• Tracking: ${order.trackingNumber || 'N/A'}`,
      actions: [{ label: 'Pick & Pack', path: '/pick-pack', type: 'navigate' }],
    };
  }

  const orders = await db.orders.toArray();
  const pending = orders.filter(o => o.status === 'Pending');
  const urgent = pending.filter(o => o.priority === 'urgent');
  const picking = orders.filter(o => o.status === 'Picking');

  return {
    content: `**Order Pipeline**\n• ${pending.length} pending (${urgent.length} urgent)\n• ${picking.length} actively picking\n• ${orders.filter(o => o.status === 'Shipped').length} shipped\n• ${orders.filter(o => o.status === 'Packed').length} packed awaiting ship`,
    actions: [{ label: 'Pick & Pack', path: '/pick-pack', type: 'navigate' }],
  };
}

async function handlePressure(): Promise<{ content: string; actions: AssistantAction[] }> {
  const [pressure, scenarios, adaptation] = await Promise.all([
    calculatePressureScore(),
    detectPressureScenarios(),
    calculateAdaptation(),
  ]);

  const scenarioLines = scenarios.slice(0, 4).map(s => `• [${s.level.toUpperCase()}] ${s.title}`);
  return {
    content: `**Guardian Pressure Analysis**\n• Level: **${pressure.level}** (${pressure.score}/100)\n• Pending orders: ${pressure.pendingOrders} (${pressure.urgentOrders} urgent)\n• Worker utilization: ${pressure.workerUtilization}%\n• QC backlog: ${pressure.qcBacklog}\n• SLA breach risk: ${pressure.slaBreachRisk}%\n• Adaptation mode: **${adaptation.mode}**\n• Recommended picking: ${adaptation.recommendedPickingMethod}\n\n${scenarios.length > 0 ? `**Active Scenarios (${scenarios.length}):**\n${scenarioLines.join('\n')}` : 'No critical scenarios detected.'}`,
    actions: [{ label: 'Guardian Ops', path: '/guardian', type: 'navigate' }],
  };
}

async function handlePutaway(): Promise<{ content: string; actions: AssistantAction[] }> {
  const tasks = await db.putawayTasks.toArray();
  const pending = tasks.filter(t => t.status === 'pending');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const completed = tasks.filter(t => t.status === 'completed');

  const lines = [...pending, ...inProgress].slice(0, 5).map(t =>
    `• **${t.taskId}**: ${t.sku} ×${t.quantity} → ${t.suggestedLocation} [${t.status}]`
  );

  return {
    content: `**Putaway Queue**\n• ${pending.length} pending\n• ${inProgress.length} in progress\n• ${completed.length} completed today\n\n${lines.length > 0 ? lines.join('\n') : 'Queue is clear.'}`,
    actions: [{ label: 'Putaway Management', path: '/putaway', type: 'navigate' }],
  };
}

async function handleSerial(entities: Record<string, string>): Promise<{ content: string; actions: AssistantAction[] }> {
  if (entities.serial) {
    const sn = await db.serialNumbers.where('serialNumber').equals(entities.serial).first();
    if (!sn) return { content: `Serial **${entities.serial}** not found.`, actions: [] };
    return {
      content: `**${sn.serialNumber}**\n• SKU: ${sn.sku}\n• Product: ${sn.product}\n• Status: **${sn.status}**\n• Location: ${sn.location}\n• IMEI: ${sn.imei1 || 'N/A'}\n• Lot: ${sn.lotNumber || 'N/A'}\n• Order: ${sn.orderId || 'Unassigned'}`,
      actions: [{ label: 'Serial Tracking', path: '/serial-tracking', type: 'navigate' }],
    };
  }

  const serials = await db.serialNumbers.toArray();
  const inStock = serials.filter(s => s.status === 'in_stock');
  const reserved = serials.filter(s => s.status === 'reserved');
  return {
    content: `**Serial Tracking**\n• ${inStock.length} in stock\n• ${reserved.length} reserved\n• ${serials.filter(s => s.status === 'shipped').length} shipped\n• ${serials.filter(s => s.status === 'quarantine').length} in quarantine`,
    actions: [{ label: 'Serial Tracking', path: '/serial-tracking', type: 'navigate' }],
  };
}

async function handleBatchPick(): Promise<{ content: string; actions: AssistantAction[] }> {
  const [batches, paths, orders] = await Promise.all([
    db.batchGroups.toArray(),
    db.pickPaths.toArray(),
    db.orders.where('status').equals('Pending').toArray(),
  ]);

  const openBatches = batches.filter(b => b.status === 'open' || b.status === 'picking');
  const activePaths = paths.filter(p => p.status === 'active' || p.status === 'planned');

  let recommendation = '';
  if (orders.length >= 10) {
    recommendation = '\n\n💡 **Recommendation:** High order volume — switch to **wave picking** with batch size 25-35.';
  } else if (orders.length >= 5) {
    recommendation = '\n\n💡 **Recommendation:** Use **batch picking** for 5+ concurrent orders.';
  }

  return {
    content: `**Batch Pick Center**\n• ${openBatches.length} active batches\n• ${activePaths.length} pick paths planned/active\n• ${orders.length} orders ready to batch${recommendation}`,
    actions: [{ label: 'Batch Pick Center', path: '/batch-pick', type: 'navigate' }],
  };
}

async function handleDock(): Promise<{ content: string; actions: AssistantAction[] }> {
  const appointments = await db.dockAppointments.toArray();
  const today = new Date().toISOString().split('T')[0];
  const todayAppts = appointments.filter(a => a.scheduledDate.startsWith(today));
  const active = appointments.filter(a => a.status === 'checked_in' || a.status === 'unloading');

  const lines = todayAppts.slice(0, 5).map(a =>
    `• **${a.appointmentId}**: ${a.supplier} @ Dock ${a.dockNumber} [${a.status}] — ${a.scheduledTime}`
  );

  return {
    content: `**Dock Schedule (Today)**\n• ${todayAppts.length} appointments\n• ${active.length} currently active\n\n${lines.length > 0 ? lines.join('\n') : 'No appointments scheduled today.'}`,
    actions: [{ label: 'Dock Management', path: '/dock', type: 'navigate' }],
  };
}

async function handleAllocation(): Promise<{ content: string; actions: AssistantAction[] }> {
  const summary = await getAllocationSummary();
  return {
    content: `**Allocation Engine (FEFO)**\n• ${summary.totalReservations} active reservations\n• ${summary.pendingAllocations} orders awaiting allocation\n• ${summary.conflicts} allocation conflicts\n• ${summary.fefoEligible} SKUs with expiry-based priority\n\nTop reserved SKUs:\n${summary.topReserved.map(r => `• ${r.sku}: ${r.reserved} reserved / ${r.available} available`).join('\n') || '• None'}`,
    actions: [{ label: 'Inventory Hub', path: '/inventory', type: 'navigate' }],
  };
}

async function handleLabor(): Promise<{ content: string; actions: AssistantAction[] }> {
  const perf = await db.workerPerformance.orderBy('date').reverse().limit(10).toArray();
  const tasks = await db.workerTasks.where('status').equals('in_progress').toArray();
  const topWorker = perf[0];

  return {
    content: `**Labor Overview**\n• ${tasks.length} tasks in progress\n• Top performer today: **${topWorker?.workerName || 'N/A'}** (${topWorker?.uph || 0} UPH, ${topWorker?.accuracy || 0}% accuracy)\n• Avg UPH across team: ${Math.round(perf.reduce((s, p) => s + p.uph, 0) / (perf.length || 1))}`,
    actions: [{ label: 'Labor Management', path: '/labor', type: 'navigate' }],
  };
}

async function handleNavigate(input: string): Promise<{ content: string; actions: AssistantAction[] }> {
  const normalized = input.toLowerCase();
  for (const [key, nav] of Object.entries(NAV_MAP)) {
    if (normalized.includes(key)) {
      return {
        content: `Opening **${nav.label}** for you.`,
        actions: [{ label: nav.label, path: nav.path, type: 'navigate' }],
      };
    }
  }
  return {
    content: 'I can navigate to: Dashboard, Inventory, Pick & Pack, Putaway, Serial Tracking, Batch Pick, Dock, Shipping, Replenishment, Analytics, Labor, Guardian.',
    actions: [],
  };
}

async function handleReplenish(): Promise<{ content: string; actions: AssistantAction[] }> {
  const inventory = await db.inventory.toArray();
  const low = inventory.filter(i => i.reorderPoint && (i.stock || 0) <= i.reorderPoint);
  const existing = await db.replenishmentTasks.where('status').equals('pending').count();

  return {
    content: `**Replenishment Status**\n• ${low.length} SKUs need restocking\n• ${existing} replenishment tasks already pending\n\nGo to Replenishment to auto-generate tasks from low-stock alerts.`,
    actions: [{ label: 'Replenishment', path: '/replenishment', type: 'navigate' }],
  };
}

async function handleAnalytics(): Promise<{ content: string; actions: AssistantAction[] }> {
  const inventory = await db.inventory.toArray();
  const orders = await db.orders.toArray();
  const shipped = orders.filter(o => o.status === 'Shipped').length;
  const rate = orders.length > 0 ? Math.round((shipped / orders.length) * 100) : 0;

  const velocityBurn = { high: 8, medium: 4, low: 1 } as const;
  const atRisk = inventory.filter(i => {
    const burn = velocityBurn[(i.velocity || 'low') as keyof typeof velocityBurn];
    return i.stock > 0 && i.stock / burn <= 7;
  });

  return {
    content: `**Analytics Snapshot**\n• Fulfillment rate: **${rate}%**\n• ${atRisk.length} SKUs at risk of stockout within 7 days\n• ${inventory.reduce((s, i) => s + i.stock, 0).toLocaleString()} total units\n• ${orders.filter(o => o.status === 'Pending').length} orders in pipeline`,
    actions: [{ label: 'Analytics', path: '/analytics', type: 'navigate' }],
  };
}

async function handleOptimizePick(entities: Record<string, string>): Promise<{ content: string; actions: AssistantAction[] }> {
  const orders = await db.orders.where('status').equals('Pending').limit(10).toArray();
  if (orders.length === 0) {
    return { content: 'No pending orders to optimize a pick path for.', actions: [] };
  }
  const skus = orders.flatMap(o => o.requiredSkus.split(',').map(s => s.trim()));
  const path = await optimizePickPath(skus, orders.map(o => o.orderId));
  return {
    content: `**Optimized Pick Path** for ${orders.length} orders:\n• Total distance: **${path.totalDistance}m**\n• Est. time: **${path.estimatedTime} min**\n• Stops: ${path.stops.length}\n\nRoute: ${path.stops.map(s => s.location).join(' → ')}`,
    actions: [{ label: 'Batch Pick Center', path: '/batch-pick', type: 'navigate' }],
  };
}

export async function processUserMessage(input: string): Promise<{ content: string; actions: AssistantAction[] }> {
  const match = matchIntent(input);

  if (/optimi[sz]e.*pick|pick.*path|best route/i.test(input)) {
    return handleOptimizePick(match.entities);
  }

  switch (match.intent) {
    case 'greeting': return handleGreeting();
    case 'stock_lookup': return handleStockLookup(match.entities);
    case 'low_stock': return handleLowStock();
    case 'order_status': return handleOrderStatus(match.entities);
    case 'pressure': return handlePressure();
    case 'putaway': return handlePutaway();
    case 'serial': return handleSerial(match.entities);
    case 'batch_pick': return handleBatchPick();
    case 'dock': return handleDock();
    case 'allocation': return handleAllocation();
    case 'labor': return handleLabor();
    case 'navigate': return handleNavigate(input);
    case 'replenish': return handleReplenish();
    case 'analytics': return handleAnalytics();
    default:
      if (match.entities.sku) return handleStockLookup(match.entities);
      if (match.entities.orderId) return handleOrderStatus(match.entities);
      if (match.entities.serial) return handleSerial(match.entities);
      return {
        content: `I'm not sure how to help with that. Try asking about:\n• *"show low stock"*\n• *"order status ORD-9984"*\n• *"warehouse pressure"*\n• *"putaway queue"*\n• *"optimize pick path"*\n• *"go to batch pick"*`,
        actions: [{ label: 'Dashboard', path: '/', type: 'navigate' }],
      };
  }
}

export const SUGGESTED_PROMPTS = [
  'What is the warehouse pressure?',
  'Show low stock items',
  'Putaway queue status',
  'Optimize pick path',
  'Dock schedule today',
  'Order pipeline summary',
];