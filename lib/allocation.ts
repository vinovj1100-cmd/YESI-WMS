import { db, logAction, logInventoryMovement } from './db';
import type { InventoryReservation, Order } from './db';

export type { InventoryReservation };

export interface AllocationResult {
  success: boolean;
  reservations: InventoryReservation[];
  conflicts: string[];
  message: string;
}

export async function allocateOrder(
  order: Order,
  operator: string
): Promise<AllocationResult> {
  const skus = order.requiredSkus.split(',').map(s => s.trim()).filter(Boolean);
  const counts: Record<string, number> = {};
  for (const sku of skus) counts[sku] = (counts[sku] || 0) + 1;

  const reservations: InventoryReservation[] = [];
  const conflicts: string[] = [];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 4 * 3600000).toISOString();

  for (const [sku, qty] of Object.entries(counts)) {
    const items = await db.inventory.where('sku').equals(sku).toArray();
    const item = items[0];
    if (!item) {
      conflicts.push(`${sku}: SKU not found`);
      continue;
    }

    const existingReserved = await db.inventoryReservations
      .where('sku').equals(sku)
      .filter(r => r.status === 'reserved' || r.status === 'allocated')
      .toArray();
    const reservedQty = existingReserved.reduce((s, r) => s + r.quantity, 0);
    const available = (item.stock || 0) - reservedQty;

    if (available < qty) {
      conflicts.push(`${sku}: need ${qty}, only ${available} available (${reservedQty} reserved)`);
      continue;
    }

    const serials = (await db.serialNumbers
      .where('sku').equals(sku)
      .filter(s => s.status === 'in_stock')
      .toArray())
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

    const reservation: InventoryReservation = {
      reservationId: `RES-${order.orderId}-${sku}-${Date.now()}`,
      orderId: order.orderId,
      sku,
      quantity: qty,
      lotNumber: item.lotNumber,
      status: 'reserved',
      fefoPriority: item.fefoPriority || 99,
      reservedAt: now.toISOString(),
      expiresAt,
      operator,
    };

    if (item.serializable || serials.length > 0) {
      const selectedSerials = serials.slice(0, qty);
      reservation.serialNumbers = selectedSerials.map(s => s.serialNumber).join(',');
      for (const sn of selectedSerials) {
        await db.serialNumbers.update(sn.id!, { status: 'reserved', orderId: order.orderId, updatedAt: now.toISOString() });
      }
    }

    await db.inventoryReservations.add(reservation);
    reservations.push(reservation);
  }

  const success = conflicts.length === 0;
  if (success) {
    await logAction('ALLOCATE_ORDER', `Reserved inventory for ${order.orderId}: ${reservations.map(r => `${r.sku}×${r.quantity}`).join(', ')}`, operator);
  }

  return {
    success,
    reservations,
    conflicts,
    message: success
      ? `Allocated ${reservations.length} SKU lines for ${order.orderId}`
      : `Allocation failed: ${conflicts.join('; ')}`,
  };
}

export async function releaseReservation(reservationId: string, operator: string): Promise<boolean> {
  const res = await db.inventoryReservations.where('reservationId').equals(reservationId).first();
  if (!res || res.status === 'picked' || res.status === 'released') return false;

  if (res.serialNumbers) {
    for (const sn of res.serialNumbers.split(',')) {
      const serial = await db.serialNumbers.where('serialNumber').equals(sn.trim()).first();
      if (serial) {
        await db.serialNumbers.update(serial.id!, { status: 'in_stock', orderId: undefined, updatedAt: new Date().toISOString() });
      }
    }
  }

  await db.inventoryReservations.update(res.id!, { status: 'released' });
  await logAction('RELEASE_RESERVATION', `Released ${reservationId}`, operator);
  return true;
}

export async function fulfillReservation(reservationId: string, operator: string): Promise<boolean> {
  const res = await db.inventoryReservations.where('reservationId').equals(reservationId).first();
  if (!res || res.status !== 'reserved') return false;

  const item = await db.inventory.where('sku').equals(res.sku).first();
  if (!item || (item.stock || 0) < res.quantity) return false;

  await db.inventory.update(item.id!, { stock: (item.stock || 0) - res.quantity, updatedAt: new Date().toISOString() });
  await db.inventoryReservations.update(res.id!, { status: 'picked' });
  await logInventoryMovement(res.sku, 'pick', res.quantity, operator, { orderId: res.orderId, lotNumber: res.lotNumber, note: `FEFO allocation ${reservationId}` });

  if (res.serialNumbers) {
    for (const sn of res.serialNumbers.split(',')) {
      const serial = await db.serialNumbers.where('serialNumber').equals(sn.trim()).first();
      if (serial) {
        await db.serialNumbers.update(serial.id!, { status: 'shipped', orderId: res.orderId, shippedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
    }
  }

  return true;
}

export async function getAllocationSummary() {
  const [reservations, orders, inventory] = await Promise.all([
    db.inventoryReservations.toArray(),
    db.orders.where('status').equals('Pending').toArray(),
    db.inventory.toArray(),
  ]);

  const active = reservations.filter(r => r.status === 'reserved' || r.status === 'allocated');
  const reservedBySku: Record<string, number> = {};
  for (const r of active) reservedBySku[r.sku] = (reservedBySku[r.sku] || 0) + r.quantity;

  const allocatedOrderIds = new Set(active.map(r => r.orderId));
  const pendingAllocations = orders.filter(o => !allocatedOrderIds.has(o.orderId)).length;

  const conflicts = orders.filter(o => {
    const skus = o.requiredSkus.split(',').map(s => s.trim());
    return skus.some(sku => {
      const item = inventory.find(i => i.sku === sku);
      const reserved = reservedBySku[sku] || 0;
      return !item || (item.stock || 0) - reserved < skus.filter(s => s === sku).length;
    });
  }).length;

  const topReserved = Object.entries(reservedBySku)
    .map(([sku, reserved]) => {
      const item = inventory.find(i => i.sku === sku);
      return { sku, reserved, available: (item?.stock || 0) - reserved };
    })
    .sort((a, b) => b.reserved - a.reserved)
    .slice(0, 5);

  return {
    totalReservations: active.length,
    pendingAllocations,
    conflicts,
    fefoEligible: inventory.filter(i => i.expiryDate || i.fefoPriority).length,
    topReserved,
  };
}

export async function autoAllocatePendingOrders(operator: string): Promise<{ allocated: number; failed: number }> {
  const orders = await db.orders.where('status').equals('Pending').toArray();
  const existing = await db.inventoryReservations.toArray();
  const allocatedIds = new Set(existing.map(r => r.orderId));

  let allocated = 0;
  let failed = 0;

  const sorted = [...orders]
    .filter(o => !allocatedIds.has(o.orderId))
    .sort((a, b) => {
      const prio = { urgent: 0, high: 1, normal: 2 };
      return prio[a.priority] - prio[b.priority];
    });

  for (const order of sorted) {
    const result = await allocateOrder(order, operator);
    if (result.success) allocated++;
    else failed++;
  }

  return { allocated, failed };
}