import { db } from './db';
import type { PickPath } from './db';

interface PickStop {
  location: string;
  sku: string;
  qty: number;
  zone: string;
  distance: number;
}

export interface OptimizedPath {
  pathId: string;
  stops: PickStop[];
  totalDistance: number;
  estimatedTime: number;
  orderIds: string[];
}

const ZONE_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1', 'D2', 'E1'];

const ZONE_DISTANCES: Record<string, Record<string, number>> = {
  A1: { A1: 0, A2: 15, B1: 30, B2: 45, C1: 60, C2: 75, C3: 90, D1: 105, D2: 120, E1: 135 },
  A2: { A1: 15, A2: 0, B1: 30, B2: 30, C1: 45, C2: 60, C3: 75, D1: 90, D2: 105, E1: 120 },
  B1: { A1: 30, A2: 30, B1: 0, B2: 15, C1: 30, C2: 45, C3: 60, D1: 75, D2: 90, E1: 105 },
  B2: { A1: 45, A2: 30, B1: 15, B2: 0, C1: 30, C2: 30, C3: 45, D1: 60, D2: 75, E1: 90 },
  C1: { A1: 60, A2: 45, B1: 30, B2: 30, C1: 0, C2: 15, C3: 30, D1: 45, D2: 60, E1: 75 },
  C2: { A1: 75, A2: 60, B1: 45, B2: 30, C1: 15, C2: 0, C3: 15, D1: 30, D2: 45, E1: 60 },
  C3: { A1: 90, A2: 75, B1: 60, B2: 45, C1: 30, C2: 15, C3: 0, D1: 30, D2: 30, E1: 45 },
  D1: { A1: 105, A2: 90, B1: 75, B2: 60, C1: 45, C2: 30, C3: 30, D1: 0, D2: 15, E1: 30 },
  D2: { A1: 120, A2: 105, B1: 90, B2: 75, C1: 60, C2: 45, C3: 30, D1: 15, D2: 0, E1: 30 },
  E1: { A1: 135, A2: 120, B1: 105, B2: 90, C1: 75, C2: 60, C3: 45, D1: 30, D2: 30, E1: 0 },
};

function getZone(location: string): string {
  return location.split('-')[0] || location;
}

function nearestNeighborTSP(stops: PickStop[]): PickStop[] {
  if (stops.length <= 1) return stops;

  const remaining = [...stops];
  const route: PickStop[] = [];
  let currentZone = 'A1';

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = ZONE_DISTANCES[currentZone]?.[remaining[i].zone] ?? 100;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    next.distance = bestDist;
    route.push(next);
    currentZone = next.zone;
  }

  return route;
}

export async function optimizePickPath(skus: string[], orderIds: string[]): Promise<OptimizedPath> {
  const inventory = await db.inventory.toArray();
  const skuCounts: Record<string, number> = {};
  for (const sku of skus) skuCounts[sku] = (skuCounts[sku] || 0) + 1;

  const stops: PickStop[] = [];
  for (const [sku, qty] of Object.entries(skuCounts)) {
    const item = inventory.find(i => i.sku === sku);
    if (item) {
      stops.push({
        location: item.location,
        sku,
        qty,
        zone: getZone(item.location),
        distance: 0,
      });
    }
  }

  stops.sort((a, b) => {
    const zoneA = ZONE_ORDER.indexOf(a.zone);
    const zoneB = ZONE_ORDER.indexOf(b.zone);
    if (zoneA !== zoneB) return zoneA - zoneB;
    return a.location.localeCompare(b.location);
  });

  const optimized = nearestNeighborTSP(stops);
  const totalDistance = optimized.reduce((s, stop) => s + stop.distance, 0);
  const estimatedTime = Math.ceil(optimized.length * 2.5 + totalDistance / 30);

  return {
    pathId: `PATH-${Date.now()}`,
    stops: optimized,
    totalDistance,
    estimatedTime,
    orderIds,
  };
}

export async function createPickPath(
  orderIds: string[],
  pickerId?: string
): Promise<PickPath> {
  const orders = await db.orders.where('orderId').anyOf(orderIds).toArray();
  const skus = orders.flatMap(o => o.requiredSkus.split(',').map(s => s.trim()));
  const optimized = await optimizePickPath(skus, orderIds);

  const path: PickPath = {
    pathId: optimized.pathId,
    orderIds: orderIds.join(','),
    route: JSON.stringify(optimized.stops),
    totalDistance: optimized.totalDistance,
    estimatedTime: optimized.estimatedTime,
    pickerId,
    status: 'planned',
    createdAt: new Date().toISOString(),
  };

  await db.pickPaths.add(path);
  return path;
}

export async function createBatchGroup(
  orderIds: string[],
  method: 'batch' | 'zone' | 'wave',
  pickerId?: string
): Promise<string> {
  const orders = await db.orders.where('orderId').anyOf(orderIds).toArray();
  const skus = orders.flatMap(o => o.requiredSkus.split(',').map(s => s.trim()));
  const optimized = await optimizePickPath(skus, orderIds);

  const batchId = `BATCH-${Date.now()}`;
  const totalItems = skus.length;
  const inventory = await db.inventory.toArray();
  const totalWeight = skus.reduce((w, sku) => {
    const item = inventory.find(i => i.sku === sku);
    return w + (item?.weight || 0.2);
  }, 0);

  const zones = [...new Set(optimized.stops.map(s => s.zone))];

  await db.batchGroups.add({
    batchId,
    orderIds: orderIds.join(','),
    status: 'open',
    pickerId,
    pickPath: JSON.stringify(optimized.stops),
    estimatedTime: optimized.estimatedTime,
    totalItems,
    totalWeight,
    createdAt: new Date().toISOString(),
    zoneProfile: zones.join(','),
    pickingMethod: method,
  });

  for (const order of orders) {
    await db.orders.update(order.id!, { batchId, status: 'Picking', updatedAt: new Date().toISOString() });
  }

  await createPickPath(orderIds, pickerId);
  return batchId;
}