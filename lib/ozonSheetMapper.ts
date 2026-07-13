import type { Order, InventoryItem } from './db';

export interface MappedOzonOrder {
  orderId: string;
  postingId?: string;
  skus: string[];
  skuQty: Record<string, number>;
  product?: string;
  status: string;
  trackingNumber?: string;
  city?: string;
  priority: 'normal' | 'high' | 'urgent';
  raw: Record<string, string>;
  sheetRowHash: string;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  orderId: ['order id', 'orderid', 'order', 'ord', 'posting id', 'posting', 'номер отправления', 'отправление', 'shipment', 'id'],
  sku: ['sku', 'артикул', 'article', 'product sku', 'item sku', 'код товара'],
  product: ['product', 'name', 'title', 'товар', 'наименование', 'description', 'item'],
  quantity: ['qty', 'quantity', 'количество', 'кол-во', 'count', 'amount'],
  status: ['status', 'статус', 'state', 'warehouse status', 'fulfillment'],
  tracking: ['tracking', 'tracking number', 'трек', 'трекинг', 'track id', 'ozon id'],
  city: ['city', 'город', 'location', 'warehouse', 'склад'],
  priority: ['priority', 'приоритет', 'urgent'],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-./]+/g, ' ').trim();
}

function findColumn(headers: string[], field: keyof typeof COLUMN_ALIASES): string | null {
  const aliases = COLUMN_ALIASES[field];
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (aliases.some((a) => norm === a || norm.includes(a))) return h;
  }
  return null;
}

function rowHash(row: Record<string, string>): string {
  return Object.entries(row).sort().map(([k, v]) => `${k}:${v}`).join('|');
}

function mapStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (/ship|отправ|deliver|готов/.test(s)) return 'ReadyToShip';
  if (/pick|сбор|pack|упак/.test(s)) return 'Picking';
  if (/cancel|отмен/.test(s)) return 'Cancelled';
  if (/return|возврат/.test(s)) return 'Returned';
  if (/qc|hold|блок/.test(s)) return 'QCHold';
  return 'Pending';
}

function mapPriority(raw: string, status: string): 'normal' | 'high' | 'urgent' {
  const p = raw.toLowerCase();
  if (/urgent|сроч|express/.test(p)) return 'urgent';
  if (/high|высок/.test(p) || status === 'Picking') return 'high';
  return 'normal';
}

export function detectColumnMapping(headers: string[]): Record<string, string | null> {
  return {
    orderId: findColumn(headers, 'orderId'),
    sku: findColumn(headers, 'sku'),
    product: findColumn(headers, 'product'),
    quantity: findColumn(headers, 'quantity'),
    status: findColumn(headers, 'status'),
    tracking: findColumn(headers, 'tracking'),
    city: findColumn(headers, 'city'),
    priority: findColumn(headers, 'priority'),
  };
}

export function mapRowsToOzonOrders(
  rows: Record<string, string>[],
  headers: string[],
  customMapping?: Partial<Record<string, string>>
): MappedOzonOrder[] {
  const mapping = { ...detectColumnMapping(headers), ...customMapping };
  const orderCol = mapping.orderId;
  const skuCol = mapping.sku;

  if (!orderCol && !skuCol) {
    throw new Error('Could not detect Order ID or SKU columns. Map columns manually or check sheet headers.');
  }

  const grouped = new Map<string, MappedOzonOrder>();

  for (const row of rows) {
    const orderId = (orderCol ? row[orderCol] : '') || (skuCol ? `OZON-${row[skuCol]}` : '');
    if (!orderId?.trim()) continue;

    const key = orderId.trim().toUpperCase();
    const sku = skuCol ? row[skuCol]?.trim() : '';
    const qty = mapping.quantity ? parseInt(row[mapping.quantity] || '1', 10) || 1 : 1;
    const statusRaw = mapping.status ? row[mapping.status] : '';
    const status = mapStatus(statusRaw);
    const priority = mapPriority(mapping.priority ? row[mapping.priority] || '' : '', status);

    if (!grouped.has(key)) {
      grouped.set(key, {
        orderId: key,
        postingId: key,
        skus: [],
        skuQty: {},
        product: mapping.product ? row[mapping.product] : undefined,
        status,
        trackingNumber: mapping.tracking ? row[mapping.tracking] : undefined,
        city: mapping.city ? row[mapping.city] : undefined,
        priority,
        raw: row,
        sheetRowHash: rowHash(row),
      });
    }

    const order = grouped.get(key)!;
    if (sku) {
      order.skus.push(sku);
      order.skuQty[sku] = (order.skuQty[sku] || 0) + qty;
    }
    if (mapping.tracking && row[mapping.tracking]) order.trackingNumber = row[mapping.tracking];
    if (mapping.status) order.status = mapStatus(row[mapping.status] || statusRaw);
  }

  return Array.from(grouped.values()).map((o) => ({
    ...o,
    skus: [...new Set(o.skus)],
  }));
}

export function toDbOrder(mapped: MappedOzonOrder): Omit<Order, 'id'> {
  const skuList = Object.entries(mapped.skuQty)
    .flatMap(([sku, qty]) => Array(qty).fill(sku))
    .join(', ');

  return {
    orderId: mapped.orderId,
    status: mapped.status as Order['status'],
    requiredSkus: skuList || mapped.skus.join(', '),
    priority: mapped.priority,
    carrier: 'Ozon',
    trackingNumber: mapped.trackingNumber,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function toInventoryUpdates(mapped: MappedOzonOrder[]): Partial<InventoryItem>[] {
  const skuProducts = new Map<string, string>();
  for (const o of mapped) {
    if (o.product && o.skus[0]) skuProducts.set(o.skus[0], o.product);
  }
  return Array.from(skuProducts.entries()).map(([sku, product]) => ({
    sku,
    product,
    stock: 0,
    location: 'SHEET-IMPORT',
    updatedAt: new Date().toISOString(),
  }));
}