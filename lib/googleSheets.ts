import Papa from 'papaparse';

export const DEFAULT_OZON_SHEET = {
  url: 'https://docs.google.com/spreadsheets/d/1NNSAHZ8A7l2nDbWZ-9tLE6K5lmDWo7V6MBizbhH875o/edit?gid=1858822101',
  spreadsheetId: '1NNSAHZ8A7l2nDbWZ-9tLE6K5lmDWo7V6MBizbhH875o',
  gid: '1858822101',
  name: 'Ozon Fulfillment Orders',
};

export interface SheetParseResult {
  headers: string[];
  rows: Record<string, string>[];
  rawRowCount: number;
}

export interface SheetFetchOptions {
  spreadsheetId: string;
  gid?: string;
  sheetName?: string;
  apiKey?: string;
  range?: string;
}

export function parseSheetUrl(url: string): { spreadsheetId: string; gid: string } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  return {
    spreadsheetId: idMatch[1],
    gid: gidMatch?.[1] || '0',
  };
}

function buildGvizCsvUrl(spreadsheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function buildApiUrl(spreadsheetId: string, range: string, apiKey: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
}

export function parseCsvText(csv: string): SheetParseResult {
  const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: true });
  if (!parsed.data.length) return { headers: [], rows: [], rawRowCount: 0 };

  const headers = (parsed.data[0] || []).map((h) => String(h).trim());
  const rows = parsed.data.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = String(cells[i] ?? '').trim();
    });
    return row;
  }).filter((r) => Object.values(r).some((v) => v));

  return { headers, rows, rawRowCount: rows.length };
}

export async function fetchSheetViaGviz(opts: SheetFetchOptions): Promise<SheetParseResult> {
  const url = buildGvizCsvUrl(opts.spreadsheetId, opts.gid || '0');
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status}). Publish sheet: File → Share → Anyone with link → Viewer`);
  const csv = await res.text();
  if (csv.includes('signin') || csv.includes('login') || csv.includes('<!DOCTYPE html')) {
    throw new Error('Sheet is private. Publish it (Anyone with link can view) or use API key / CSV upload.');
  }
  return parseCsvText(csv);
}

export async function fetchSheetViaApi(opts: SheetFetchOptions): Promise<SheetParseResult> {
  if (!opts.apiKey) throw new Error('Google API key required');
  const range = opts.range || 'Sheet1!A:Z';
  const url = buildApiUrl(opts.spreadsheetId, range, opts.apiKey);
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message || `API error ${res.status}`);
  }
  const data = await res.json() as { values?: string[][] };
  if (!data.values?.length) return { headers: [], rows: [], rawRowCount: 0 };
  const headers = data.values[0].map((h) => String(h).trim());
  const rows = data.values.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = String(cells[i] ?? '').trim(); });
    return row;
  });
  return { headers, rows, rawRowCount: rows.length };
}

export async function fetchSheet(opts: SheetFetchOptions, method: 'gviz' | 'api' | 'auto' = 'auto'): Promise<SheetParseResult> {
  if (method === 'api' || (method === 'auto' && opts.apiKey)) {
    try {
      return await fetchSheetViaApi(opts);
    } catch (e) {
      if (method === 'api') throw e;
    }
  }
  return fetchSheetViaGviz(opts);
}

export function parseUploadedFile(file: File): Promise<SheetParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as Record<string, string>[]).filter((r) =>
          Object.values(r).some((v) => v && String(v).trim())
        );
        resolve({
          headers: results.meta.fields || [],
          rows,
          rawRowCount: rows.length,
        });
      },
      error: (err) => reject(err),
    });
  });
}