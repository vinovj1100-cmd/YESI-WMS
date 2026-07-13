import { db, logAction, type Order } from './db';
import { fetchSheet, parseUploadedFile, type SheetFetchOptions } from './googleSheets';
import { mapRowsToOzonOrders, toDbOrder, detectColumnMapping } from './ozonSheetMapper';
import type { SheetSyncConfig, SheetSyncLog } from './db';
import { autoAllocatePendingOrders } from './allocation';
import { registerDeviceHeartbeat } from './deviceRegistry';

export interface SyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  orders: string[];
}

export async function runSheetSync(
  config: SheetSyncConfig,
  operator: string,
  file?: File
): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, updated: 0, skipped: 0, errors: [], orders: [] };
  const start = Date.now();

  await registerDeviceHeartbeat(operator);

  let parsed;
  try {
    if (file) {
      parsed = await parseUploadedFile(file);
    } else {
      const opts: SheetFetchOptions = {
        spreadsheetId: config.spreadsheetId,
        gid: config.gid,
        apiKey: config.apiKey || undefined,
        range: config.sheetRange || undefined,
      };
      parsed = await fetchSheet(opts, config.fetchMethod as 'gviz' | 'api' | 'auto');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Fetch failed';
    result.errors.push(msg);
    await logSync(config.id!, 'error', msg, 0, 0, operator, Date.now() - start);
    throw e;
  }

  const customMapping = config.columnMapping ? JSON.parse(config.columnMapping) : undefined;
  const mapped = mapRowsToOzonOrders(parsed.rows, parsed.headers, customMapping);

  const existingOrders = await db.orders.toArray();
  const existingIds = new Set(existingOrders.map((o) => o.orderId.toUpperCase()));
  const seenHashes = new Set(
    (await db.sheetSyncRows.toArray()).map((r) => r.rowHash)
  );

  for (const m of mapped) {
    try {
      if (config.skipDuplicates && seenHashes.has(m.sheetRowHash)) {
        result.skipped++;
        continue;
      }

      const orderData = toDbOrder(m);
      const existing = existingOrders.find((o) => o.orderId.toUpperCase() === m.orderId);

      if (existing?.id) {
        await db.orders.update(existing.id, {
          ...orderData,
          id: undefined,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        } as Partial<Order>);
        result.updated++;
      } else if (!existingIds.has(m.orderId)) {
        await db.orders.add(orderData as Order);
        result.imported++;
        existingIds.add(m.orderId);
      } else {
        result.skipped++;
      }

      result.orders.push(m.orderId);

      await db.sheetSyncRows.put({
        rowHash: m.sheetRowHash,
        orderId: m.orderId,
        sheetId: config.spreadsheetId,
        syncedAt: new Date().toISOString(),
        status: orderData.status,
      });

      for (const sku of m.skus) {
        const inv = await db.inventory.where('sku').equals(sku).first();
        if (!inv && m.product) {
          await db.inventory.add({
            sku,
            product: m.product,
            stock: 0,
            location: 'OZON-PENDING',
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      result.errors.push(`${m.orderId}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  if (config.autoAllocate) {
    await autoAllocatePendingOrders(operator).catch(() => undefined);
  }

  await db.sheetSyncConfigs.update(config.id!, {
    lastSync: new Date().toISOString(),
    lastRowCount: parsed.rawRowCount,
    lastError: result.errors.length ? result.errors[0] : undefined,
    syncCount: (config.syncCount || 0) + 1,
  });

  await logSync(
    config.id!,
    result.errors.length ? 'partial' : 'success',
    `Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}`,
    result.imported + result.updated,
    parsed.rawRowCount,
    operator,
    Date.now() - start
  );

  await logAction(
    'SHEET_SYNC',
    `${config.name}: +${result.imported} new, ~${result.updated} updated from Google Sheets`,
    operator
  );

  return result;
}

async function logSync(
  configId: number,
  status: SheetSyncLog['status'],
  message: string,
  recordsProcessed: number,
  totalRows: number,
  operator: string,
  durationMs: number
) {
  await db.sheetSyncLogs.add({
    configId,
    status,
    message,
    recordsProcessed,
    totalRows,
    operator,
    deviceId: localStorage.getItem('vortex_device_id') || 'unknown',
    durationMs,
    createdAt: new Date().toISOString(),
  });
}

export async function writeBackOrderStatus(
  orderId: string,
  status: string,
  trackingNumber?: string
): Promise<string> {
  return JSON.stringify({
    orderId,
    status,
    trackingNumber,
    updatedAt: new Date().toISOString(),
    warehouse: 'YESI-FULFILLMENT',
  });
}

export function getDetectedMappingPreview(headers: string[]) {
  return detectColumnMapping(headers);
}