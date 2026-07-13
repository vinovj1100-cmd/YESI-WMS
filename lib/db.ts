import Dexie, { type Table } from 'dexie';

// ─── Existing interfaces (enhanced) ─────────────────────────────────────
export interface InventoryItem {
  id?: number;
  sku: string;
  product: string;
  stock: number;
  location: string;
  category?: string;
  velocity?: 'high' | 'medium' | 'low';
  weight?: number;
  reorderPoint?: number;
  reorderQty?: number;
  updatedAt: string;
  // NEW: Traceability & barcode
  barcode?: string;
  rfidTag?: string;
  length?: number;
  width?: number;
  height?: number;
  costPerUnit?: number;
  // NEW: Lot / Batch / Expiry
  lotNumber?: string;
  batchNumber?: string;
  expiryDate?: string;
  manufacturingDate?: string;
  serializable?: boolean;
  // NEW: FEFO/FIFO control
  fefoPriority?: number; // higher = ship first
}

export interface Order {
  id?: number;
  orderId: string;
  status: 'Pending' | 'Shipped' | 'Returned' | 'Cancelled' | 'QCHold' | 'CrossDock' | 'Packed' | 'Picking' | 'ReadyToShip';
  requiredSkus: string;
  priority: 'normal' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  waveId?: string;
  batchId?: string;
  // NEW: Shipping
  carrier?: string;
  service?: string;
  trackingNumber?: string;
  shippingCost?: number;
  weightTotal?: number;
  dimensionsTotal?: string; // JSON of dims
  // NEW: Box sizing
  suggestedBoxSize?: string;
  actualBoxSize?: string;
  packingMaterials?: string;
}

export interface ReturnRecord {
  id?: number;
  orderId: string;
  sku: string;
  reason: string;
  restocked: boolean;
  quantity: number;
  processedAt: string;
}

export interface InboundRecord {
  id?: number;
  sku: string;
  qty: number;
  bin: string;
  description: string;
  lotNumber?: string;
  serialNumbers?: string;
  expiryDate?: string;
  receivedAt: string;
  crossDockOrderId?: string;
  qcStatus: 'pending' | 'passed' | 'failed';
  // NEW: PO reconciliation
  poNumber?: string;
  supplier?: string;
  expectedQty?: number;
  variance?: number;
  putawayLocation?: string;
  putawayReason?: string;
}

export interface AuditLog {
  id?: number;
  action: string;
  details: string;
  operator: string;
  timestamp: string;
}

export interface User {
  id?: number;
  username: string;
  password: string;
  role: 'admin' | 'operator' | 'supervisor';
  displayName: string;
  createdAt: string;
  // NEW: Labor
  skillLevel?: number; // 1-5
  preferredTaskTypes?: string; // JSON
  currentZone?: string;
}

export interface InventoryMovement {
  id?: number;
  sku: string;
  type: 'inbound' | 'outbound' | 'return' | 'adjustment' | 'transfer' | 'cycle_count' | 'qc_adjustment' | 'putaway' | 'pick' | 'pack';
  quantity: number;
  fromLocation?: string;
  toLocation?: string;
  orderId?: string;
  operator: string;
  lotNumber?: string;
  note?: string;
  timestamp: string;
}

export interface CycleCount {
  id?: number;
  sku: string;
  location: string;
  expectedQty: number;
  actualQty: number;
  variance: number;
  status: 'pending' | 'completed' | 'rejected' | 'approved';
  operator: string;
  countedAt: string;
  note?: string;
  // NEW: ABC classification
  abcClass?: 'A' | 'B' | 'C';
  countFrequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  nextScheduled?: string;
}

export interface ZoneCapacity {
  id?: number;
  zone: string;
  maxCapacity: number;
  currentUtilization: number;
  category?: string;
  velocityTarget?: 'high' | 'medium' | 'low';
  // NEW: Bin details
  aisle?: string;
  rack?: string;
  shelf?: string;
  binType?: 'pallet' | 'carton' | 'shelf' | 'floor' | 'cold';
  maxWeight?: number;
  // NEW: Putaway rules
  putawayRules?: string; // JSON of rules
}

export interface WorkerTask {
  id?: number;
  type: 'pick' | 'pack' | 'receive' | 'putaway' | 'cycle_count' | 'replenish' | 'ship' | 'label' | 'audit';
  orderId?: string;
  sku?: string;
  fromLocation?: string;
  toLocation?: string;
  quantity: number;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo: string;
  priority: 'normal' | 'high' | 'urgent';
  createdAt: string;
  completedAt?: string;
  note?: string;
  // NEW: Performance
  estimatedTime?: number; // minutes
  actualTime?: number; // minutes
  distance?: number; // meters walked
  pickPath?: string; // JSON array of locations
}

export interface ReplenishmentTask {
  id?: number;
  sku: string;
  fromLocation: string;
  toLocation: string;
  quantity: number;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'normal' | 'high';
  createdAt: string;
  completedAt?: string;
  triggeredBy?: 'auto' | 'manual' | 'low_stock' | 'wave_demand';
}

export interface QCHold {
  id?: number;
  sku: string;
  lotNumber?: string;
  quantity: number;
  reason: string;
  status: 'hold' | 'released' | 'rejected';
  operator: string;
  createdAt: string;
  releasedAt?: string;
}

export interface WaveBatch {
  id?: number;
  waveId: string;
  name: string;
  status: 'open' | 'picking' | 'completed' | 'cancelled';
  orderIds: string;
  zoneProfile: string;
  createdAt: string;
  completedAt?: string;
  // NEW: Optimization
  pickPath?: string; // JSON
  estimatedTime?: number;
  actualTime?: number;
  pickerId?: string;
}

export interface Template {
  id?: number;
  raw: string;
  standard: string;
  createdAt: string;
}

export interface Alias {
  id?: number;
  source: string;
  target: string;
  createdAt: string;
}

export interface Preference {
  id?: number;
  key: string;
  value: string;
  createdAt: string;
}

export interface PostingRecord {
  id?: number;
  postingId: string;
  trackingId?: string;
  orderId?: string;
  status: 'received' | 'in_transit' | 'delivered' | 'posted' | 'exception';
  carrier?: string;
  photoData?: string;
  videoData?: string;
  geolocation?: string;
  city?: string;
  note?: string;
  operator: string;
  createdAt: string;
  folder?: string;
}

export interface SimDbEntry {
  id?: number;
  tacPrefix: string;
  expectedOffset: number;
  modelSeries: string;
  type: string;
}

// ─── NEW: Purchase Order ────────────────────────────────────────────────
export interface PurchaseOrder {
  id?: number;
  poNumber: string;
  supplier: string;
  status: 'open' | 'partial' | 'received' | 'closed' | 'cancelled';
  expectedDelivery: string;
  items: string; // JSON: [{sku, qty, expected, received}]
  totalValue: number;
  currency: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── NEW: Shipping Label ───────────────────────────────────────────────
export interface ShippingLabel {
  id?: number;
  orderId: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  labelData: string; // base64 PNG or URL
  weight: number;
  dimensions: string; // JSON
  cost: number;
  status: 'draft' | 'printed' | 'void';
  printedAt?: string;
  createdAt: string;
}

// ─── NEW: Carrier Rate ────────────────────────────────────────────────
export interface CarrierRate {
  id?: number;
  carrier: string;
  service: string;
  weightFrom: number;
  weightTo: number;
  zone: string;
  rate: number;
  currency: string;
  estimatedDays: number;
  active: boolean;
}

// ─── NEW: Worker Performance ──────────────────────────────────────────
export interface WorkerPerformance {
  id?: number;
  workerId: string;
  workerName: string;
  date: string;
  picksCompleted: number;
  picksPerHour: number;
  accuracy: number; // percentage 0-100
  distanceWalked: number; // meters
  tasksCompleted: number;
  avgTaskTime: number; // minutes
  uph: number; // units per hour
  // NEW: Breakdown by task type
  pickCount: number;
  packCount: number;
  receiveCount: number;
  putawayCount: number;
  // NEW: Quality metrics
  errors: number;
  returnsCaused: number;
  notes?: string;
}

// ─── NEW: Integration Endpoint ──────────────────────────────────────────
export interface IntegrationEndpoint {
  id?: number;
  name: string;
  type: 'erp' | 'oms' | 'tms' | 'wms' | 'marketplace' | 'carrier' | 'custom';
  provider: string;
  config: string; // JSON: {apiKey, endpoint, webhook, etc}
  status: 'active' | 'inactive' | 'error' | 'syncing';
  lastSync?: string;
  nextSync?: string;
  syncInterval: number; // minutes
  recordsSynced: number;
  errorCount: number;
  lastError?: string;
  createdAt: string;
}

// ─── NEW: Batch Group ───────────────────────────────────────────────────
export interface BatchGroup {
  id?: number;
  batchId: string;
  orderIds: string; // comma separated
  status: 'open' | 'picking' | 'packed' | 'shipped' | 'cancelled';
  pickerId?: string;
  packerId?: string;
  pickPath?: string; // JSON
  estimatedTime?: number;
  actualTime?: number;
  totalItems: number;
  totalWeight: number;
  createdAt: string;
  completedAt?: string;
  zoneProfile: string;
  pickingMethod: 'single' | 'batch' | 'zone' | 'wave';
}

// ─── NEW: Pick Path ─────────────────────────────────────────────────────
export interface PickPath {
  id?: number;
  pathId: string;
  orderIds: string; // comma separated
  route: string; // JSON: [{location, sku, qty, zone, distance}]
  totalDistance: number;
  estimatedTime: number;
  actualTime?: number;
  pickerId?: string;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
}

// ─── NEW: Box Size ──────────────────────────────────────────────────────
export interface BoxSize {
  id?: number;
  name: string;
  length: number;
  width: number;
  height: number;
  maxWeight: number;
  cost: number;
  material: string;
  active: boolean;
}

// ─── NEW v6: Serial Number ──────────────────────────────────────────────
export interface SerialNumber {
  id?: number;
  serialNumber: string;
  sku: string;
  product: string;
  lotNumber?: string;
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  status: 'in_stock' | 'reserved' | 'shipped' | 'returned' | 'defective' | 'quarantine';
  location: string;
  orderId?: string;
  inboundId?: number;
  operator: string;
  createdAt: string;
  updatedAt: string;
  // Full traceability chain
  receivedAt?: string;
  shippedAt?: string;
  returnedAt?: string;
  inspectedAt?: string;
  // Warranty info
  warrantyStart?: string;
  warrantyEnd?: string;
  // Device-specific (for phones)
  imei1?: string;
  imei2?: string;
  tacPrefix?: string;
  color?: string;
  storage?: string;
}

// ─── NEW v6: Putaway Task ───────────────────────────────────────────────
export interface PutawayTask {
  id?: number;
  taskId: string;
  sku: string;
  product: string;
  quantity: number;
  lotNumber?: string;
  // Source
  sourceLocation: string;
  sourceType: 'receiving' | 'returns' | 'transfer' | 'qc_release' | 'cross_dock';
  inboundId?: number;
  poNumber?: string;
  // Destination
  suggestedLocation: string;
  actualLocation?: string;
  destinationZone: string;
  destinationAisle?: string;
  destinationRack?: string;
  destinationShelf?: string;
  // Status & assignment
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  assignedTo?: string;
  priority: 'normal' | 'high' | 'urgent';
  // Timestamps
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  completedAt?: string;
  // Performance
  estimatedTime?: number; // minutes
  actualTime?: number; // minutes
  distance?: number; // meters
  // Quality
  qcStatus: 'pending' | 'passed' | 'failed';
  putawayMethod: 'direct' | 'zone' | 'cross_dock' | 'consolidation';
  notes?: string;
  operator: string;
}

// ─── NEW v7: Dock Appointment ───────────────────────────────────────────
export interface DockAppointment {
  id?: number;
  appointmentId: string;
  supplier: string;
  poNumber?: string;
  dockNumber: string;
  scheduledDate: string;
  scheduledTime: string;
  estimatedDuration: number; // minutes
  status: 'scheduled' | 'checked_in' | 'unloading' | 'completed' | 'no_show' | 'cancelled';
  carrier?: string;
  trailerNumber?: string;
  palletCount?: number;
  asnNumber?: string;
  items?: string; // JSON
  notes?: string;
  operator: string;
  checkedInAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ─── NEW v7: Inventory Reservation (re-exported from allocation) ────────
export interface InventoryReservation {
  id?: number;
  reservationId: string;
  orderId: string;
  sku: string;
  quantity: number;
  lotNumber?: string;
  serialNumbers?: string;
  status: 'reserved' | 'allocated' | 'picked' | 'released' | 'expired';
  fefoPriority: number;
  reservedAt: string;
  expiresAt: string;
  operator: string;
}

// ─── NEW v8: Google Sheets Ozon Sync ────────────────────────────────────
export interface SheetSyncConfig {
  id?: number;
  name: string;
  spreadsheetId: string;
  gid: string;
  sheetUrl: string;
  sheetRange?: string;
  apiKey?: string;
  fetchMethod: 'gviz' | 'api' | 'auto' | 'upload';
  columnMapping?: string;
  autoSync: number;
  syncIntervalMinutes: number;
  autoAllocate: number;
  skipDuplicates: number;
  writeBackEnabled: number;
  lastSync?: string;
  lastRowCount?: number;
  lastError?: string;
  syncCount?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface SheetSyncLog {
  id?: number;
  configId: number;
  status: 'success' | 'partial' | 'error';
  message: string;
  recordsProcessed: number;
  totalRows: number;
  operator: string;
  deviceId: string;
  durationMs: number;
  createdAt: string;
}

export interface SheetSyncRow {
  id?: number;
  rowHash: string;
  orderId: string;
  sheetId: string;
  syncedAt: string;
  status: string;
}

export interface ConnectedDevice {
  id?: number;
  deviceId: string;
  deviceName: string;
  platform: string;
  userAgent: string;
  operator: string;
  lastSeen: string;
  isOnline: boolean;
  activeWorkflows: number;
  registeredAt: string;
}

// ─── Database Class ────────────────────────────────────────────────────
class VortexDB extends Dexie {
  inventory!: Table<InventoryItem>;
  orders!: Table<Order>;
  returns!: Table<ReturnRecord>;
  inbound!: Table<InboundRecord>;
  auditLogs!: Table<AuditLog>;
  users!: Table<User>;
  inventoryMovements!: Table<InventoryMovement>;
  cycleCounts!: Table<CycleCount>;
  zoneCapacities!: Table<ZoneCapacity>;
  workerTasks!: Table<WorkerTask>;
  replenishmentTasks!: Table<ReplenishmentTask>;
  qcHolds!: Table<QCHold>;
  waveBatches!: Table<WaveBatch>;
  templates!: Table<Template>;
  aliases!: Table<Alias>;
  preferences!: Table<Preference>;
  simDb!: Table<SimDbEntry>;
  postingRecords!: Table<PostingRecord>;
  // v5 tables
  purchaseOrders!: Table<PurchaseOrder>;
  shippingLabels!: Table<ShippingLabel>;
  carrierRates!: Table<CarrierRate>;
  workerPerformance!: Table<WorkerPerformance>;
  integrationEndpoints!: Table<IntegrationEndpoint>;
  batchGroups!: Table<BatchGroup>;
  pickPaths!: Table<PickPath>;
  boxSizes!: Table<BoxSize>;
  // v6 tables
  serialNumbers!: Table<SerialNumber>;
  putawayTasks!: Table<PutawayTask>;
  // v7 tables
  dockAppointments!: Table<DockAppointment>;
  inventoryReservations!: Table<InventoryReservation>;
  // v8 tables
  sheetSyncConfigs!: Table<SheetSyncConfig>;
  sheetSyncLogs!: Table<SheetSyncLog>;
  sheetSyncRows!: Table<SheetSyncRow>;
  connectedDevices!: Table<ConnectedDevice>;

  constructor() {
    super('VortexWMS');
    this.version(7).stores({
      inventory: '++id, sku, location, category, velocity, barcode, rfidTag, lotNumber, batchNumber, expiryDate',
      orders: '++id, orderId, status, priority, waveId, assignedTo, batchId, carrier',
      returns: '++id, orderId, sku',
      inbound: '++id, sku, receivedAt, crossDockOrderId, qcStatus, poNumber, supplier',
      auditLogs: '++id, timestamp',
      users: '++id, username, currentZone',
      inventoryMovements: '++id, sku, type, timestamp, orderId, operator',
      cycleCounts: '++id, sku, location, status, abcClass, nextScheduled',
      zoneCapacities: '++id, zone, category, velocityTarget, binType',
      workerTasks: '++id, type, status, assignedTo, priority, createdAt, orderId',
      replenishmentTasks: '++id, sku, status',
      qcHolds: '++id, sku, status',
      waveBatches: '++id, waveId, status',
      templates: '++id, raw',
      aliases: '++id, source',
      preferences: '++id, key',
      simDb: '++id, tacPrefix',
      postingRecords: '++id, postingId, status, createdAt, folder',
      // v5 indexes
      purchaseOrders: '++id, poNumber, supplier, status, expectedDelivery',
      shippingLabels: '++id, orderId, carrier, trackingNumber, status',
      carrierRates: '++id, carrier, service, weightFrom, weightTo, zone, active',
      workerPerformance: '++id, workerId, date, uph',
      integrationEndpoints: '++id, name, type, status, lastSync',
      batchGroups: '++id, batchId, status, pickerId, pickingMethod',
      pickPaths: '++id, pathId, status, pickerId',
      boxSizes: '++id, name, active',
      // v6 indexes
      serialNumbers: '++id, serialNumber, sku, status, location, orderId',
      putawayTasks: '++id, taskId, sku, status, assignedTo, destinationZone, sourceType',
      // v7 indexes
      dockAppointments: '++id, appointmentId, supplier, dockNumber, status, scheduledDate',
      inventoryReservations: '++id, reservationId, orderId, sku, status, reservedAt',
    });
    this.version(8).stores({
      inventory: '++id, sku, location, category, velocity, barcode, rfidTag, lotNumber, batchNumber, expiryDate',
      orders: '++id, orderId, status, priority, waveId, assignedTo, batchId, carrier',
      returns: '++id, orderId, sku',
      inbound: '++id, sku, receivedAt, crossDockOrderId, qcStatus, poNumber, supplier',
      auditLogs: '++id, timestamp',
      users: '++id, username, currentZone',
      inventoryMovements: '++id, sku, type, timestamp, orderId, operator',
      cycleCounts: '++id, sku, location, status, abcClass, nextScheduled',
      zoneCapacities: '++id, zone, category, velocityTarget, binType',
      workerTasks: '++id, type, status, assignedTo, priority, createdAt, orderId',
      replenishmentTasks: '++id, sku, status',
      qcHolds: '++id, sku, status',
      waveBatches: '++id, waveId, status',
      templates: '++id, raw',
      aliases: '++id, source',
      preferences: '++id, key',
      simDb: '++id, tacPrefix',
      postingRecords: '++id, postingId, status, createdAt, folder',
      purchaseOrders: '++id, poNumber, supplier, status, expectedDelivery',
      shippingLabels: '++id, orderId, carrier, trackingNumber, status',
      carrierRates: '++id, carrier, service, weightFrom, weightTo, zone, active',
      workerPerformance: '++id, workerId, date, uph',
      integrationEndpoints: '++id, name, type, status, lastSync',
      batchGroups: '++id, batchId, status, pickerId, pickingMethod',
      pickPaths: '++id, pathId, status, pickerId',
      boxSizes: '++id, name, active',
      serialNumbers: '++id, serialNumber, sku, status, location, orderId',
      putawayTasks: '++id, taskId, sku, status, assignedTo, destinationZone, sourceType',
      dockAppointments: '++id, appointmentId, supplier, dockNumber, status, scheduledDate',
      inventoryReservations: '++id, reservationId, orderId, sku, status, reservedAt',
      sheetSyncConfigs: '++id, spreadsheetId, autoSync, lastSync, name',
      sheetSyncLogs: '++id, configId, status, createdAt, deviceId',
      sheetSyncRows: '++id, rowHash, orderId, sheetId, syncedAt',
      connectedDevices: '++id, deviceId, operator, lastSeen',
    });
  }
}

export const db = new VortexDB();

// Audit log helper
export async function logAction(action: string, details: string, operator: string) {
  await db.auditLogs.add({
    action,
    details,
    operator,
    timestamp: new Date().toISOString(),
  });
}

// Inventory movement logger
export async function logInventoryMovement(
  sku: string,
  type: InventoryMovement['type'],
  quantity: number,
  operator: string,
  opts?: { fromLocation?: string; toLocation?: string; orderId?: string; lotNumber?: string; note?: string }
) {
  await db.inventoryMovements.add({
    sku,
    type,
    quantity,
    operator,
    fromLocation: opts?.fromLocation,
    toLocation: opts?.toLocation,
    orderId: opts?.orderId,
    lotNumber: opts?.lotNumber,
    note: opts?.note,
    timestamp: new Date().toISOString(),
  });
}

// Export all data as JSON
export async function exportAllData() {
  const inventory = await db.inventory.toArray();
  const orders = await db.orders.toArray();
  const returns = await db.returns.toArray();
  const inbound = await db.inbound.toArray();
  const auditLogs = await db.auditLogs.toArray();
  const inventoryMovements = await db.inventoryMovements.toArray();
  const cycleCounts = await db.cycleCounts.toArray();
  const zoneCapacities = await db.zoneCapacities.toArray();
  const workerTasks = await db.workerTasks.toArray();
  const replenishmentTasks = await db.replenishmentTasks.toArray();
  const qcHolds = await db.qcHolds.toArray();
  const waveBatches = await db.waveBatches.toArray();
  const templates = await db.templates.toArray();
  const aliases = await db.aliases.toArray();
  const preferences = await db.preferences.toArray();
  const simDb = await db.simDb.toArray();
  const postingRecords = await db.postingRecords.toArray();
  const purchaseOrders = await db.purchaseOrders.toArray();
  const shippingLabels = await db.shippingLabels.toArray();
  const carrierRates = await db.carrierRates.toArray();
  const workerPerformance = await db.workerPerformance.toArray();
  const integrationEndpoints = await db.integrationEndpoints.toArray();
  const batchGroups = await db.batchGroups.toArray();
  const pickPaths = await db.pickPaths.toArray();
  const boxSizes = await db.boxSizes.toArray();
  const serialNumbers = await db.serialNumbers.toArray();
  const putawayTasks = await db.putawayTasks.toArray();
  const dockAppointments = await db.dockAppointments.toArray();
  const inventoryReservations = await db.inventoryReservations.toArray();
  const sheetSyncConfigs = await db.sheetSyncConfigs.toArray();
  const sheetSyncLogs = await db.sheetSyncLogs.toArray();
  const sheetSyncRows = await db.sheetSyncRows.toArray();
  const connectedDevices = await db.connectedDevices.toArray();
  return {
    inventory, orders, returns, inbound, auditLogs,
    inventoryMovements, cycleCounts, zoneCapacities,
    workerTasks, replenishmentTasks, qcHolds, waveBatches,
    templates, aliases, preferences, simDb, postingRecords,
    purchaseOrders, shippingLabels, carrierRates, workerPerformance,
    integrationEndpoints, batchGroups, pickPaths, boxSizes,
    serialNumbers, putawayTasks, dockAppointments, inventoryReservations,
    sheetSyncConfigs, sheetSyncLogs, sheetSyncRows, connectedDevices,
    exportDate: new Date().toISOString(),
  };
}

// Seed data function
export async function seedDatabase() {
  const inventoryCount = await db.inventory.count();
  const ordersCount = await db.orders.count();
  const usersCount = await db.users.count();
  const zoneCount = await db.zoneCapacities.count();
  const simCount = await db.simDb.count();
  const postingCount = await db.postingRecords.count();
  const poCount = await db.purchaseOrders.count();
  const carrierRateCount = await db.carrierRates.count();
  const workerPerfCount = await db.workerPerformance.count();
  const integrationCount = await db.integrationEndpoints.count();
  const boxSizeCount = await db.boxSizes.count();
  const serialNumberCount = await db.serialNumbers.count();
  const putawayTaskCount = await db.putawayTasks.count();
  const dockCount = await db.dockAppointments.count();
  const batchCount = await db.batchGroups.count();
  const pickPathCount = await db.pickPaths.count();
  const sheetConfigCount = await db.sheetSyncConfigs.count();

  if (inventoryCount === 0) {
    await db.inventory.bulkAdd([
      { sku: 'APP-IP15-256-BLK', product: 'APPLE IPHONE 15 256GB BLACK', stock: 45, location: 'A1-01', category: 'Electronics', velocity: 'high', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 899, reorderPoint: 10, reorderQty: 20, updatedAt: new Date().toISOString(), barcode: '888888888801', lotNumber: 'LOT-APP-2024-001', expiryDate: '2026-12-31', fefoPriority: 1 },
      { sku: 'APP-IP15P-256-ORG', product: 'APPLE IPHONE 15 PRO COSMIC ORANGE 256GB', stock: 8, location: 'A1-02', category: 'Electronics', velocity: 'high', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 1199, reorderPoint: 5, reorderQty: 15, updatedAt: new Date().toISOString(), barcode: '888888888802', lotNumber: 'LOT-APP-2024-002', expiryDate: '2026-12-31', fefoPriority: 1 },
      { sku: 'SAM-S24-512-GRY', product: 'SAMSUNG GALAXY S24 TITAN GRAY 512GB', stock: 12, location: 'B2-15', category: 'Electronics', velocity: 'medium', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 1099, reorderPoint: 8, reorderQty: 12, updatedAt: new Date().toISOString(), barcode: '880888888801', lotNumber: 'LOT-SAM-2024-001', expiryDate: '2026-12-31', fefoPriority: 2 },
      { sku: 'APP-IP15P-512-BLU', product: 'APPLE IPHONE 15 PRO DEEP BLUE 512GB', stock: 23, location: 'A1-03', category: 'Electronics', velocity: 'high', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 1399, reorderPoint: 10, reorderQty: 20, updatedAt: new Date().toISOString(), barcode: '888888888803', lotNumber: 'LOT-APP-2024-003', expiryDate: '2026-12-31', fefoPriority: 1 },
      { sku: 'SAM-ZFL-256-PRP', product: 'SAMSUNG Z FLIP SANDY PURPLE 256GB', stock: 6, location: 'B2-16', category: 'Electronics', velocity: 'low', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 999, reorderPoint: 5, reorderQty: 10, updatedAt: new Date().toISOString(), barcode: '880888888802', lotNumber: 'LOT-SAM-2024-002', expiryDate: '2026-12-31', fefoPriority: 3 },
      { sku: 'PIX-8-128-BLK', product: 'GOOGLE PIXEL 8 128GB BLACK', stock: 34, location: 'C3-01', category: 'Electronics', velocity: 'medium', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 699, reorderPoint: 10, reorderQty: 15, updatedAt: new Date().toISOString(), barcode: '811888888801', lotNumber: 'LOT-PIX-2024-001', expiryDate: '2026-12-31', fefoPriority: 2 },
      { sku: 'APP-IP14-128-RED', product: 'APPLE IPHONE 14 128GB RED', stock: 3, location: 'A1-04', category: 'Electronics', velocity: 'low', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 799, reorderPoint: 5, reorderQty: 10, updatedAt: new Date().toISOString(), barcode: '888888888804', lotNumber: 'LOT-APP-2023-001', expiryDate: '2025-12-31', fefoPriority: 5 },
      { sku: 'SAM-A54-256-WHT', product: 'SAMSUNG A54 256GB WHITE', stock: 56, location: 'B2-17', category: 'Electronics', velocity: 'medium', weight: 0.2, length: 15, width: 7, height: 0.8, costPerUnit: 449, reorderPoint: 15, reorderQty: 25, updatedAt: new Date().toISOString(), barcode: '880888888803', lotNumber: 'LOT-SAM-2024-003', expiryDate: '2026-12-31', fefoPriority: 2 },
      { sku: 'SAC-USB-C-2M', product: 'USB-C CABLE 2M', stock: 120, location: 'D1-01', category: 'Accessories', velocity: 'high', weight: 0.05, length: 200, width: 2, height: 1, costPerUnit: 15, reorderPoint: 30, reorderQty: 50, updatedAt: new Date().toISOString(), barcode: '999888888801', lotNumber: 'LOT-SAC-2024-001', expiryDate: '2027-12-31', fefoPriority: 1 },
      { sku: 'CASE-IP15-CLR', product: 'IPHONE 15 CLEAR CASE', stock: 85, location: 'D1-02', category: 'Accessories', velocity: 'high', weight: 0.05, length: 16, width: 8, height: 1, costPerUnit: 25, reorderPoint: 20, reorderQty: 40, updatedAt: new Date().toISOString(), barcode: '999888888802', lotNumber: 'LOT-CAS-2024-001', expiryDate: '2027-12-31', fefoPriority: 1 },
      { sku: 'CHRG-WL-15W', product: 'WIRELESS CHARGER 15W', stock: 42, location: 'D1-03', category: 'Accessories', velocity: 'medium', weight: 0.15, length: 10, width: 10, height: 1, costPerUnit: 35, reorderPoint: 10, reorderQty: 20, updatedAt: new Date().toISOString(), barcode: '999888888803', lotNumber: 'LOT-CHG-2024-001', expiryDate: '2027-12-31', fefoPriority: 2 },
      { sku: 'BUDS-WH-ANC', product: 'WIRELESS ANC EARBUDS WHITE', stock: 18, location: 'D2-01', category: 'Audio', velocity: 'medium', weight: 0.05, length: 6, width: 6, height: 3, costPerUnit: 199, reorderPoint: 8, reorderQty: 15, updatedAt: new Date().toISOString(), barcode: '777888888801', lotNumber: 'LOT-BUD-2024-001', expiryDate: '2027-12-31', fefoPriority: 2 },
    ]);
  }

  if (ordersCount === 0) {
    await db.orders.bulkAdd([
      { orderId: 'ORD-9981', status: 'Pending', requiredSkus: 'APP-IP15P-256-ORG, SAM-S24-512-GRY', priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9982', status: 'Pending', requiredSkus: 'SAM-S24-512-GRY', priority: 'high', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9983', status: 'Shipped', requiredSkus: 'APP-IP15-256-BLK', priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9984', status: 'Pending', requiredSkus: 'APP-IP15P-512-BLU, PIX-8-128-BLK', priority: 'urgent', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9985', status: 'Pending', requiredSkus: 'SAM-A54-256-WHT, SAM-A54-256-WHT', priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9986', status: 'Shipped', requiredSkus: 'APP-IP14-128-RED', priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9987', status: 'Pending', requiredSkus: 'SAM-ZFL-256-PRP', priority: 'high', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9988', status: 'Pending', requiredSkus: 'SAC-USB-C-2M, CASE-IP15-CLR', priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { orderId: 'ORD-9989', status: 'Pending', requiredSkus: 'CHRG-WL-15W, BUDS-WH-ANC', priority: 'normal', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);
  }

  if (usersCount === 0) {
    await db.users.bulkAdd([
      { username: 'VINOVJ', password: 'VINOVJ', role: 'admin', displayName: 'Administrator', createdAt: new Date().toISOString(), skillLevel: 5 },
      { username: 'operator', password: 'operator', role: 'operator', displayName: 'Staff_01', createdAt: new Date().toISOString(), skillLevel: 3, currentZone: 'A1' },
      { username: 'supervisor', password: 'supervisor', role: 'supervisor', displayName: 'Supervisor', createdAt: new Date().toISOString(), skillLevel: 4, currentZone: 'B2' },
    ]);
  }

  if (zoneCount === 0) {
    await db.zoneCapacities.bulkAdd([
      { zone: 'A1', maxCapacity: 500, currentUtilization: 0, category: 'Electronics', velocityTarget: 'high', aisle: 'A', rack: '1', shelf: '1-5', binType: 'shelf', maxWeight: 50, putawayRules: JSON.stringify({ velocity: 'high', category: 'Electronics', maxWeight: 50 }) },
      { zone: 'A2', maxCapacity: 400, currentUtilization: 0, category: 'Electronics', velocityTarget: 'high', aisle: 'A', rack: '2', shelf: '1-5', binType: 'shelf', maxWeight: 50, putawayRules: JSON.stringify({ velocity: 'high', category: 'Electronics', maxWeight: 50 }) },
      { zone: 'B1', maxCapacity: 300, currentUtilization: 0, category: 'Electronics', velocityTarget: 'medium', aisle: 'B', rack: '1', shelf: '1-4', binType: 'shelf', maxWeight: 50, putawayRules: JSON.stringify({ velocity: 'medium', category: 'Electronics', maxWeight: 50 }) },
      { zone: 'B2', maxCapacity: 300, currentUtilization: 0, category: 'Electronics', velocityTarget: 'medium', aisle: 'B', rack: '2', shelf: '1-4', binType: 'shelf', maxWeight: 50, putawayRules: JSON.stringify({ velocity: 'medium', category: 'Electronics', maxWeight: 50 }) },
      { zone: 'C1', maxCapacity: 200, currentUtilization: 0, category: 'Audio', velocityTarget: 'low', aisle: 'C', rack: '1', shelf: '1-3', binType: 'shelf', maxWeight: 30, putawayRules: JSON.stringify({ velocity: 'low', category: 'Audio', maxWeight: 30 }) },
      { zone: 'C2', maxCapacity: 200, currentUtilization: 0, category: 'Audio', velocityTarget: 'low', aisle: 'C', rack: '2', shelf: '1-3', binType: 'shelf', maxWeight: 30, putawayRules: JSON.stringify({ velocity: 'low', category: 'Audio', maxWeight: 30 }) },
      { zone: 'C3', maxCapacity: 200, currentUtilization: 0, category: 'Electronics', velocityTarget: 'medium', aisle: 'C', rack: '3', shelf: '1-3', binType: 'shelf', maxWeight: 50, putawayRules: JSON.stringify({ velocity: 'medium', category: 'Electronics', maxWeight: 50 }) },
      { zone: 'D1', maxCapacity: 400, currentUtilization: 0, category: 'Accessories', velocityTarget: 'high', aisle: 'D', rack: '1', shelf: '1-4', binType: 'carton', maxWeight: 20, putawayRules: JSON.stringify({ velocity: 'high', category: 'Accessories', maxWeight: 20 }) },
      { zone: 'D2', maxCapacity: 300, currentUtilization: 0, category: 'Accessories', velocityTarget: 'medium', aisle: 'D', rack: '2', shelf: '1-4', binType: 'carton', maxWeight: 20, putawayRules: JSON.stringify({ velocity: 'medium', category: 'Accessories', maxWeight: 20 }) },
      { zone: 'E1', maxCapacity: 250, currentUtilization: 0, category: 'Returns', velocityTarget: 'low', aisle: 'E', rack: '1', shelf: '1-3', binType: 'floor', maxWeight: 100, putawayRules: JSON.stringify({ velocity: 'low', category: 'Returns', maxWeight: 100 }) },
    ]);
  }

  if (simCount === 0) {
    await db.simDb.bulkAdd([
      { tacPrefix: '35123456', expectedOffset: 8, modelSeries: 'Galaxy S20', type: 'Smartphone' },
      { tacPrefix: '35234567', expectedOffset: 8, modelSeries: 'Galaxy S21', type: 'Smartphone' },
      { tacPrefix: '35345678', expectedOffset: 8, modelSeries: 'Galaxy S22', type: 'Smartphone' },
      { tacPrefix: '35456789', expectedOffset: 8, modelSeries: 'Galaxy S23', type: 'Smartphone' },
      { tacPrefix: '35567890', expectedOffset: 8, modelSeries: 'Galaxy S24', type: 'Smartphone' },
      { tacPrefix: '35678901', expectedOffset: 8, modelSeries: 'Galaxy Z Flip', type: 'Smartphone' },
      { tacPrefix: '35789012', expectedOffset: 8, modelSeries: 'Galaxy Z Fold', type: 'Smartphone' },
      { tacPrefix: '35890123', expectedOffset: 8, modelSeries: 'Galaxy A54', type: 'Smartphone' },
      { tacPrefix: '35901234', expectedOffset: 8, modelSeries: 'iPhone 15', type: 'Smartphone' },
      { tacPrefix: '35012345', expectedOffset: 8, modelSeries: 'iPhone 15 Pro', type: 'Smartphone' },
    ]);
  }

  if (postingCount === 0) {
    await db.postingRecords.bulkAdd([
      { postingId: 'PST-001-MSK', trackingId: 'TRK-9981-001', status: 'posted', carrier: 'Ozon', city: 'Moscow', operator: 'VINOVJ', createdAt: new Date().toISOString(), folder: 'June 2024' },
      { postingId: 'PST-002-SPB', trackingId: 'TRK-9982-002', status: 'in_transit', carrier: 'Ozon', city: 'St. Petersburg', operator: 'VINOVJ', createdAt: new Date().toISOString(), folder: 'June 2024' },
      { postingId: 'PST-003-KZN', trackingId: 'TRK-9983-003', status: 'received', carrier: 'Ozon', city: 'Kazan', operator: 'operator', createdAt: new Date().toISOString(), folder: 'June 2024' },
    ]);
  }

  // NEW: Purchase Orders
  if (poCount === 0) {
    await db.purchaseOrders.bulkAdd([
      { poNumber: 'PO-2024-001', supplier: 'Apple Inc.', status: 'received', expectedDelivery: '2024-06-15', items: JSON.stringify([{ sku: 'APP-IP15-256-BLK', qty: 50, expected: 50, received: 50 }, { sku: 'APP-IP15P-256-ORG', qty: 20, expected: 20, received: 20 }]), totalValue: 68950, currency: 'USD', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { poNumber: 'PO-2024-002', supplier: 'Samsung Electronics', status: 'partial', expectedDelivery: '2024-06-20', items: JSON.stringify([{ sku: 'SAM-S24-512-GRY', qty: 30, expected: 30, received: 12 }, { sku: 'SAM-A54-256-WHT', qty: 60, expected: 60, received: 56 }]), totalValue: 55950, currency: 'USD', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { poNumber: 'PO-2024-003', supplier: 'Google LLC', status: 'open', expectedDelivery: '2024-07-01', items: JSON.stringify([{ sku: 'PIX-8-128-BLK', qty: 40, expected: 40, received: 0 }]), totalValue: 27960, currency: 'USD', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ]);
  }

  // NEW: Carrier Rates
  if (carrierRateCount === 0) {
    await db.carrierRates.bulkAdd([
      { carrier: 'FedEx', service: 'Ground', weightFrom: 0, weightTo: 1, zone: '1', rate: 8.50, currency: 'USD', estimatedDays: 3, active: true },
      { carrier: 'FedEx', service: 'Ground', weightFrom: 0, weightTo: 1, zone: '2', rate: 9.25, currency: 'USD', estimatedDays: 3, active: true },
      { carrier: 'FedEx', service: '2Day', weightFrom: 0, weightTo: 1, zone: '1', rate: 12.50, currency: 'USD', estimatedDays: 2, active: true },
      { carrier: 'UPS', service: 'Ground', weightFrom: 0, weightTo: 1, zone: '1', rate: 8.75, currency: 'USD', estimatedDays: 3, active: true },
      { carrier: 'UPS', service: 'Next Day Air', weightFrom: 0, weightTo: 1, zone: '1', rate: 24.50, currency: 'USD', estimatedDays: 1, active: true },
      { carrier: 'USPS', service: 'Priority', weightFrom: 0, weightTo: 1, zone: '1', rate: 7.50, currency: 'USD', estimatedDays: 2, active: true },
      { carrier: 'DHL', service: 'Express', weightFrom: 0, weightTo: 1, zone: '1', rate: 15.00, currency: 'USD', estimatedDays: 2, active: true },
      { carrier: 'Ozon', service: 'Standard', weightFrom: 0, weightTo: 1, zone: '1', rate: 5.00, currency: 'USD', estimatedDays: 5, active: true },
    ]);
  }

  // NEW: Worker Performance (last 7 days)
  if (workerPerfCount === 0) {
    const workers = ['VINOVJ', 'Staff_01', 'Supervisor'];
    const today = new Date();
    for (let d = 0; d < 7; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      for (const w of workers) {
        const picks = Math.floor(Math.random() * 80 + 40);
        const accuracy = Math.floor(Math.random() * 10 + 90);
        const uph = Math.floor(Math.random() * 30 + 50);
        await db.workerPerformance.add({
          workerId: w.toLowerCase().replace(/\s/g, ''),
          workerName: w,
          date: dateStr,
          picksCompleted: picks,
          picksPerHour: uph,
          accuracy,
          distanceWalked: Math.floor(picks * 15 + Math.random() * 500),
          tasksCompleted: Math.floor(picks * 0.8 + Math.random() * 10),
          avgTaskTime: Math.floor(Math.random() * 5 + 3),
          uph,
          pickCount: Math.floor(picks * 0.6),
          packCount: Math.floor(picks * 0.2),
          receiveCount: Math.floor(picks * 0.1),
          putawayCount: Math.floor(picks * 0.1),
          errors: Math.floor((100 - accuracy) / 10),
          returnsCaused: Math.floor(Math.random() * 3),
        });
      }
    }
  }

  // NEW: Integration Endpoints
  if (integrationCount === 0) {
    await db.integrationEndpoints.bulkAdd([
      { name: 'SAP ERP', type: 'erp', provider: 'SAP', config: JSON.stringify({ endpoint: 'https://sap.yesifzco.com/api', authType: 'oauth2' }), status: 'active', lastSync: new Date().toISOString(), syncInterval: 60, recordsSynced: 15420, errorCount: 0, createdAt: new Date().toISOString() },
      { name: 'Shopify OMS', type: 'oms', provider: 'Shopify', config: JSON.stringify({ endpoint: 'https://yesifzco.myshopify.com/admin/api', authType: 'api_key' }), status: 'active', lastSync: new Date().toISOString(), syncInterval: 15, recordsSynced: 8934, errorCount: 2, createdAt: new Date().toISOString() },
      { name: 'FedEx TMS', type: 'tms', provider: 'FedEx', config: JSON.stringify({ endpoint: 'https://apis.fedex.com/ship', authType: 'api_key' }), status: 'active', lastSync: new Date().toISOString(), syncInterval: 30, recordsSynced: 4521, errorCount: 0, createdAt: new Date().toISOString() },
      { name: 'Amazon Marketplace', type: 'marketplace', provider: 'Amazon', config: JSON.stringify({ endpoint: 'https://sellingpartnerapi.amazon.com', authType: 'oauth2' }), status: 'error', lastSync: new Date(Date.now() - 86400000).toISOString(), syncInterval: 60, recordsSynced: 3200, errorCount: 12, lastError: 'Token expired', createdAt: new Date().toISOString() },
      { name: 'Ozon Marketplace', type: 'marketplace', provider: 'Ozon', config: JSON.stringify({ endpoint: 'https://api-seller.ozon.ru', authType: 'api_key' }), status: 'active', lastSync: new Date().toISOString(), syncInterval: 30, recordsSynced: 6780, errorCount: 0, createdAt: new Date().toISOString() },
    ]);
  }

  // NEW: Box Sizes
  if (boxSizeCount === 0) {
    await db.boxSizes.bulkAdd([
      { name: 'Small Padded Envelope', length: 15, width: 10, height: 2, maxWeight: 0.5, cost: 0.50, material: 'padded_paper', active: true },
      { name: 'Small Box (15x10x5)', length: 15, width: 10, height: 5, maxWeight: 2, cost: 1.20, material: 'cardboard', active: true },
      { name: 'Medium Box (25x20x15)', length: 25, width: 20, height: 15, maxWeight: 5, cost: 2.50, material: 'cardboard', active: true },
      { name: 'Large Box (40x30x20)', length: 40, width: 30, height: 20, maxWeight: 15, cost: 4.00, material: 'cardboard', active: true },
      { name: 'Extra Large Box (60x40x30)', length: 60, width: 40, height: 30, maxWeight: 30, cost: 6.50, material: 'cardboard', active: true },
      { name: 'Fragile Box (30x25x20)', length: 30, width: 25, height: 20, maxWeight: 8, cost: 3.50, material: 'double_wall', active: true },
    ]);
  }

  // NEW v6: Serial Numbers (for high-value serialized items)
  if (serialNumberCount === 0) {
    const serials: SerialNumber[] = [];
    const skus = [
      { sku: 'APP-IP15-256-BLK', product: 'APPLE IPHONE 15 256GB BLACK', location: 'A1-01' },
      { sku: 'APP-IP15P-256-ORG', product: 'APPLE IPHONE 15 PRO COSMIC ORANGE 256GB', location: 'A1-02' },
      { sku: 'SAM-S24-512-GRY', product: 'SAMSUNG GALAXY S24 TITAN GRAY 512GB', location: 'B2-15' },
    ];
    let seq = 10001;
    for (const { sku, product, location } of skus) {
      for (let i = 0; i < 5; i++) {
        const sn = `SN-${sku.replace(/-/g, '')}-${seq++}`;
        const imei = `35${Math.floor(Math.random() * 89999999 + 10000000)}${Math.floor(Math.random() * 899999 + 100000)}`;
        serials.push({
          serialNumber: sn,
          sku,
          product,
          location,
          status: 'in_stock',
          operator: 'VINOVJ',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imei1: imei,
          tacPrefix: imei.slice(0, 8),
          lotNumber: `LOT-${sku.split('-')[0]}-2024-001`,
          warrantyStart: new Date().toISOString(),
          warrantyEnd: new Date(Date.now() + 31536000000).toISOString(),
        });
      }
    }
    await db.serialNumbers.bulkAdd(serials);
  }

  // NEW v6: Putaway Tasks
  if (putawayTaskCount === 0) {
    await db.putawayTasks.bulkAdd([
      { taskId: 'PUT-2024-001', sku: 'APP-IP15-256-BLK', product: 'APPLE IPHONE 15 256GB BLACK', quantity: 50, sourceLocation: 'RECV-DOCK-01', sourceType: 'receiving', suggestedLocation: 'A1-01', destinationZone: 'A1', destinationAisle: 'A', destinationRack: '1', destinationShelf: '01', status: 'completed', priority: 'high', createdAt: new Date().toISOString(), assignedAt: new Date().toISOString(), startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), actualLocation: 'A1-01', qcStatus: 'passed', putawayMethod: 'direct', operator: 'VINOVJ', estimatedTime: 15, actualTime: 12, distance: 45 },
      { taskId: 'PUT-2024-002', sku: 'APP-IP15P-256-ORG', product: 'APPLE IPHONE 15 PRO COSMIC ORANGE 256GB', quantity: 20, sourceLocation: 'RECV-DOCK-01', sourceType: 'receiving', suggestedLocation: 'A1-02', destinationZone: 'A1', destinationAisle: 'A', destinationRack: '1', destinationShelf: '02', status: 'completed', priority: 'high', createdAt: new Date().toISOString(), assignedAt: new Date().toISOString(), startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), actualLocation: 'A1-02', qcStatus: 'passed', putawayMethod: 'zone', operator: 'VINOVJ', estimatedTime: 15, actualTime: 14, distance: 45 },
      { taskId: 'PUT-2024-003', sku: 'SAM-S24-512-GRY', product: 'SAMSUNG GALAXY S24 TITAN GRAY 512GB', quantity: 12, sourceLocation: 'RECV-DOCK-02', sourceType: 'receiving', suggestedLocation: 'B2-15', destinationZone: 'B2', destinationAisle: 'B', destinationRack: '2', destinationShelf: '15', status: 'in_progress', priority: 'normal', createdAt: new Date().toISOString(), assignedAt: new Date().toISOString(), startedAt: new Date().toISOString(), actualLocation: 'B2-15', qcStatus: 'passed', putawayMethod: 'direct', operator: 'operator', estimatedTime: 20, actualTime: 8, distance: 120 },
      { taskId: 'PUT-2024-004', sku: 'SAM-A54-256-WHT', product: 'SAMSUNG A54 256GB WHITE', quantity: 56, sourceLocation: 'RECV-DOCK-02', sourceType: 'receiving', suggestedLocation: 'B2-17', destinationZone: 'B2', destinationAisle: 'B', destinationRack: '2', destinationShelf: '17', status: 'pending', priority: 'normal', createdAt: new Date().toISOString(), qcStatus: 'pending', putawayMethod: 'zone', operator: 'VINOVJ', estimatedTime: 25, distance: 120 },
      { taskId: 'PUT-2024-005', sku: 'SAC-USB-C-2M', product: 'USB-C CABLE 2M', quantity: 100, sourceLocation: 'RECV-DOCK-03', sourceType: 'receiving', suggestedLocation: 'D1-01', destinationZone: 'D1', destinationAisle: 'D', destinationRack: '1', destinationShelf: '01', status: 'pending', priority: 'normal', createdAt: new Date().toISOString(), qcStatus: 'pending', putawayMethod: 'consolidation', operator: 'VINOVJ', estimatedTime: 18, distance: 200 },
    ]);
  }

  // NEW v7: Dock Appointments
  if (dockCount === 0) {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await db.dockAppointments.bulkAdd([
      { appointmentId: 'DOCK-001', supplier: 'Apple Inc.', poNumber: 'PO-2024-001', dockNumber: 'DOCK-01', scheduledDate: today, scheduledTime: '08:00', estimatedDuration: 90, status: 'completed', carrier: 'FedEx Freight', palletCount: 12, asnNumber: 'ASN-APP-001', operator: 'VINOVJ', checkedInAt: new Date().toISOString(), completedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
      { appointmentId: 'DOCK-002', supplier: 'Samsung Electronics', poNumber: 'PO-2024-002', dockNumber: 'DOCK-02', scheduledDate: today, scheduledTime: '10:30', estimatedDuration: 120, status: 'unloading', carrier: 'UPS Freight', trailerNumber: 'TRL-4521', palletCount: 18, asnNumber: 'ASN-SAM-002', operator: 'operator', checkedInAt: new Date().toISOString(), createdAt: new Date().toISOString() },
      { appointmentId: 'DOCK-003', supplier: 'Google LLC', poNumber: 'PO-2024-003', dockNumber: 'DOCK-01', scheduledDate: today, scheduledTime: '14:00', estimatedDuration: 60, status: 'scheduled', carrier: 'DHL', palletCount: 8, asnNumber: 'ASN-GOO-003', operator: 'VINOVJ', createdAt: new Date().toISOString() },
      { appointmentId: 'DOCK-004', supplier: 'Accessory Wholesale Co.', dockNumber: 'DOCK-03', scheduledDate: tomorrow, scheduledTime: '09:00', estimatedDuration: 45, status: 'scheduled', palletCount: 6, operator: 'supervisor', createdAt: new Date().toISOString() },
    ]);
  }

  // NEW v7: Batch Groups & Pick Paths
  if (batchCount === 0) {
    await db.batchGroups.bulkAdd([
      { batchId: 'BATCH-001', orderIds: 'ORD-9981,ORD-9982', status: 'picking', pickerId: 'operator', pickPath: JSON.stringify([{ location: 'A1-02', sku: 'APP-IP15P-256-ORG', qty: 1, zone: 'A1' }, { location: 'B2-15', sku: 'SAM-S24-512-GRY', qty: 2, zone: 'B2' }]), estimatedTime: 12, totalItems: 3, totalWeight: 0.6, createdAt: new Date().toISOString(), zoneProfile: 'A1,B2', pickingMethod: 'batch' },
    ]);
  }

  if (pickPathCount === 0) {
    await db.pickPaths.bulkAdd([
      { pathId: 'PATH-001', orderIds: 'ORD-9981,ORD-9982', route: JSON.stringify([{ location: 'A1-02', sku: 'APP-IP15P-256-ORG', qty: 1, zone: 'A1', distance: 0 }, { location: 'B2-15', sku: 'SAM-S24-512-GRY', qty: 2, zone: 'B2', distance: 30 }]), totalDistance: 30, estimatedTime: 12, pickerId: 'operator', status: 'active', createdAt: new Date().toISOString() },
    ]);
  }

  if (sheetConfigCount === 0) {
    const now = new Date().toISOString();
    await db.sheetSyncConfigs.add({
      name: 'Ozon Fulfillment Orders',
      spreadsheetId: '1NNSAHZ8A7l2nDbWZ-9tLE6K5lmDWo7V6MBizbhH875o',
      gid: '1858822101',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/1NNSAHZ8A7l2nDbWZ-9tLE6K5lmDWo7V6MBizbhH875o/edit?gid=1858822101',
      fetchMethod: 'auto',
      autoSync: 1,
      syncIntervalMinutes: 15,
      autoAllocate: 1,
      skipDuplicates: 1,
      writeBackEnabled: 0,
      syncCount: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: 'VINOVJ',
    });
  }
}
