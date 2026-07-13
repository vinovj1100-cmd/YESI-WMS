import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { db } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import {
  Barcode, Download, Printer, Box, Tag, Smartphone, FileImage,
  Settings, Wand2, Copy, Trash2, RotateCcw, LayoutGrid, ScanBarcode, Split
} from 'lucide-react';

/* ─── types ─── */
type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC' | 'ITF14' | 'QR';
type SerialType = 'imei' | 'imei2' | 'iccid' | 'sim' | 'custom';
type TabKey = 'location' | 'product' | 'serial' | 'multi' | 'batch' | 'sheet';

interface BarcodeConfig {
  text: string;
  format: BarcodeFormat;
  label: string;
  width: number;
  height: number;
  showText: boolean;
  fontSize: number;
  bgColor: string;
  lineColor: string;
  margin: number;
}

interface BatchItem extends BarcodeConfig {
  id: string;
  previewUrl?: string;
  generated: boolean;
}

interface MultiLabelRow {
  id: string;
  col1: BatchItem;
  col2: BatchItem;
  col3: BatchItem;
  col1Label: string;
  col2Label: string;
  col3Label: string;
}

const FORMATS: { value: BarcodeFormat; label: string; desc: string }[] = [
  { value: 'CODE128', label: 'Code 128', desc: 'General alphanumeric — best for SKUs' },
  { value: 'CODE39', label: 'Code 39', desc: 'Legacy alphanumeric — uppercase only' },
  { value: 'EAN13', label: 'EAN-13', desc: '13-digit retail product code' },
  { value: 'EAN8', label: 'EAN-8', desc: 'Short 8-digit retail code' },
  { value: 'UPC', label: 'UPC-A', desc: '12-digit North American retail' },
  { value: 'ITF14', label: 'ITF-14', desc: '14-digit shipping container' },
  { value: 'QR', label: 'QR Code', desc: '2D matrix — scan with phone' },
];

const PRESETS = [
  { name: 'Small Shelf', width: 120, height: 60, fontSize: 12, margin: 4 },
  { name: 'Standard Bin', width: 200, height: 80, fontSize: 14, margin: 6 },
  { name: 'Large Pallet', width: 300, height: 120, fontSize: 18, margin: 8 },
  { name: 'QR Compact', width: 200, height: 200, fontSize: 12, margin: 8 },
  { name: 'QR Large', width: 400, height: 400, fontSize: 16, margin: 12 },
  { name: 'UPC Retail', width: 300, height: 100, fontSize: 14, margin: 6 },
  { name: 'EAN Label', width: 280, height: 90, fontSize: 14, margin: 6 },
  { name: 'Serial Slim', width: 400, height: 60, fontSize: 11, margin: 4 },
];

/* ─── Luhn / EAN / UPC helpers ─── */
function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.substring(i, i + 1), 10);
    if (alternate) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alternate = !alternate;
  }
  return (10 - (sum % 10)) % 10;
}

function generateEAN13(prefix: string): string {
  let base = prefix.replace(/\D/g, '').slice(0, 12);
  while (base.length < 12) base += Math.floor(Math.random() * 10).toString();
  return base + luhnCheckDigit(base);
}

function generateIMEI(tacPrefix: string): string {
  let tac = tacPrefix.replace(/\D/g, '').slice(0, 8);
  if (tac.length < 8) tac = tac.padEnd(8, '0');
  let serial = '';
  for (let i = 0; i < 6; i++) serial += Math.floor(Math.random() * 10).toString();
  const body = tac + serial;
  return body + luhnCheckDigit(body);
}

function generateICCID(): string {
  // 89 (country) + 01 (telecom) + 2-digit issuer + 10-digit serial + luhn
  let body = '89' + '01';
  for (let i = 0; i < 2; i++) body += Math.floor(Math.random() * 10).toString();
  for (let i = 0; i < 10; i++) body += Math.floor(Math.random() * 10).toString();
  return body + luhnCheckDigit(body);
}

function generateSIMSerial(): string {
  let s = '';
  for (let i = 0; i < 19; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

/* ─── render helper ─── */
async function renderBarcode(
  text: string, format: BarcodeFormat, width: number, height: number,
  showText: boolean, fontSize: number, bgColor: string, lineColor: string, margin: number
): Promise<string> {
  if (!text.trim()) return '';
  const canvas = document.createElement('canvas');
  if (format === 'QR') {
    try {
      return await QRCode.toDataURL(text, {
        width: Math.min(width, height), margin: Math.max(1, Math.floor(margin / 10)),
        color: { dark: lineColor, light: bgColor },
      });
    } catch { return ''; }
  }
  canvas.width = width; canvas.height = height;
  try {
    JsBarcode(canvas, text, {
      format, width: 2, height: height - (showText ? fontSize + 12 : 8),
      displayValue: showText, font: 'monospace', textMargin: 4, fontSize,
      background: bgColor, lineColor, margin,
      marginTop: margin, marginBottom: margin, marginLeft: margin, marginRight: margin,
    });
    return canvas.toDataURL('image/png');
  } catch { return ''; }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click();
}

function generateId() { return Math.random().toString(36).slice(2, 10); }

/* ─── component ─── */
export default function LocationBarcodeGenerator() {
  const addNotification = useAppStore((s) => s.addNotification);
  const [activeTab, setActiveTab] = useState<TabKey>('location');

  /* ── location ── */
  const [loc, setLoc] = useState<BarcodeConfig>({ text: 'SHELF-D-01-01', format: 'CODE128', label: 'SHELF D-01-01', width: 200, height: 80, showText: true, fontSize: 14, bgColor: '#ffffff', lineColor: '#1a1c1e', margin: 6 });
  const [locPreview, setLocPreview] = useState('');
  const [locHistory, setLocHistory] = useState<BarcodeConfig[]>([]);
  const [showLocHistory, setShowLocHistory] = useState(false);

  /* ── product ── */
  const [prod, setProd] = useState<BarcodeConfig>({ text: '8809576261127', format: 'EAN13', label: 'Galaxy S24 512GB', width: 300, height: 100, showText: true, fontSize: 14, bgColor: '#ffffff', lineColor: '#1a1c1e', margin: 6 });
  const [prodPreview, setProdPreview] = useState('');
  const [prodPrefix, setProdPrefix] = useState('880');
  const [prodCount, setProdCount] = useState(10);
  const [prodItems, setProdItems] = useState<BatchItem[]>([]);
  const [productName, setProductName] = useState('Galaxy S24');

  /* ── serial ── */
  const [serialType, setSerialType] = useState<SerialType>('imei');
  const [serialTac, setSerialTac] = useState('35567890');
  const [serialCount, setSerialCount] = useState(10);
  const [serialItems, setSerialItems] = useState<BatchItem[]>([]);
  const [serialPreview, setSerialPreview] = useState('');
  const [serialCfg, setSerialCfg] = useState<BarcodeConfig>({ text: '355678900123456', format: 'CODE128', label: 'IMEI', width: 400, height: 60, showText: true, fontSize: 11, bgColor: '#ffffff', lineColor: '#1a1c1e', margin: 4 });
  const [tacDb, setTacDb] = useState<any[]>([]);

  /* ── batch (shared) ── */
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  /* ── multi label ── */
  const [multiRows, setMultiRows] = useState<MultiLabelRow[]>([]);
  const [multiCfg, setMultiCfg] = useState({ width: 240, height: 90, fontSize: 12, margin: 4, bgColor: '#ffffff', lineColor: '#1a1c1e' });
  const [multiPreview, setMultiPreview] = useState('');
  const [multiLabel1, setMultiLabel1] = useState('SHELF');
  const [multiLabel2, setMultiLabel2] = useState('UPC');
  const [multiLabel3, setMultiLabel3] = useState('SERIAL');
  const [multiPrefix1, setMultiPrefix1] = useState('D-01-');
  const [multiPrefix2, setMultiPrefix2] = useState('880');
  const [multiPrefix3, setMultiPrefix3] = useState('35567890');
  const [multiStart, setMultiStart] = useState(1);
  const [multiCount, setMultiCount] = useState(7);
  const [multiFormat, setMultiFormat] = useState<BarcodeFormat>('CODE128');

  /* ── sheet ── */
  const [sheetItems, setSheetItems] = useState<BatchItem[]>([]);
  const [sheetPreview, setSheetPreview] = useState('');
  const [sheetCols, setSheetCols] = useState(3);
  const [sheetRows, setSheetRows] = useState(7);
  const [sheetW, setSheetW] = useState(900);
  const [sheetH, setSheetH] = useState(302);
  const [sheetGap, setSheetGap] = useState(8);

  /* ─── effects ─── */
  useEffect(() => { generateLocPreview(); }, [loc.text, loc.format, loc.width, loc.height, loc.showText, loc.fontSize, loc.bgColor, loc.lineColor, loc.margin]);
  useEffect(() => { generateProdPreview(); }, [prod.text, prod.format, prod.width, prod.height, prod.showText, prod.fontSize, prod.bgColor, prod.lineColor, prod.margin]);
  useEffect(() => { generateSerialPreview(); }, [serialCfg.text, serialCfg.format, serialCfg.width, serialCfg.height, serialCfg.showText, serialCfg.fontSize, serialCfg.bgColor, serialCfg.lineColor, serialCfg.margin]);
  useEffect(() => { loadTacDb(); }, []);

  async function generateLocPreview() {
    const url = await renderBarcode(loc.text, loc.format, loc.width, loc.height, loc.showText, loc.fontSize, loc.bgColor, loc.lineColor, loc.margin);
    setLocPreview(url);
  }
  async function generateProdPreview() {
    const url = await renderBarcode(prod.text, prod.format, prod.width, prod.height, prod.showText, prod.fontSize, prod.bgColor, prod.lineColor, prod.margin);
    setProdPreview(url);
  }
  async function generateSerialPreview() {
    const url = await renderBarcode(serialCfg.text, serialCfg.format, serialCfg.width, serialCfg.height, serialCfg.showText, serialCfg.fontSize, serialCfg.bgColor, serialCfg.lineColor, serialCfg.margin);
    setSerialPreview(url);
  }
  async function loadTacDb() {
    const data = await db.simDb.toArray();
    setTacDb(data);
  }

  function saveLocHistory(cfg: BarcodeConfig) { setLocHistory((p) => [cfg, ...p.slice(0, 19)]); }

  function applyPreset(idx: number, target: 'loc' | 'prod' | 'serial') {
    const p = PRESETS[idx];
    if (target === 'loc') setLoc((s) => ({ ...s, width: p.width, height: p.height, fontSize: p.fontSize, margin: p.margin }));
    if (target === 'prod') setProd((s) => ({ ...s, width: p.width, height: p.height, fontSize: p.fontSize, margin: p.margin }));
    if (target === 'serial') setSerialCfg((s) => ({ ...s, width: p.width, height: p.height, fontSize: p.fontSize, margin: p.margin }));
  }

  function downloadSingle(cfg: BarcodeConfig, preview: string, prefix: string) {
    if (!preview) return;
    downloadDataUrl(preview, `${prefix}-${cfg.text.replace(/[^a-zA-Z0-9-]/g, '_')}.png`);
    if (prefix === 'loc') saveLocHistory(cfg);
    addNotification({ title: `${prefix.toUpperCase()} Barcode Downloaded`, message: `${cfg.text}.png`, type: 'success' });
  }

  /* ─── product batch ─── */
  function generateProductBatch() {
    const items: BatchItem[] = [];
    for (let i = 0; i < prodCount; i++) {
      const ean = generateEAN13(prodPrefix + i.toString().padStart(2, '0'));
      items.push({
        id: generateId(), text: ean, format: 'EAN13', label: `${productName} #${i + 1}`,
        width: prod.width, height: prod.height, showText: prod.showText, fontSize: prod.fontSize,
        bgColor: prod.bgColor, lineColor: prod.lineColor, margin: prod.margin, generated: false,
      });
    }
    setProdItems(items);
    addNotification({ title: 'Product Batch Created', message: `${items.length} EAN-13 codes`, type: 'info' });
  }
  async function renderProductBatch() {
    const updated: BatchItem[] = [];
    for (const item of prodItems) {
      const url = await renderBarcode(item.text, item.format, item.width, item.height, item.showText, item.fontSize, item.bgColor, item.lineColor, item.margin);
      updated.push({ ...item, previewUrl: url, generated: true });
    }
    setProdItems(updated);
  }
  async function downloadProductZip() {
    if (!prodItems.length) return;
    const zip = new JSZip(); const folder = zip.folder('product-barcodes');
    if (!folder) return;
    for (const item of prodItems) {
      const url = item.previewUrl || await renderBarcode(item.text, item.format, item.width, item.height, item.showText, item.fontSize, item.bgColor, item.lineColor, item.margin);
      if (!url) continue; const b64 = url.split(',')[1]; if (b64) folder.file(`${item.text}.png`, b64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob); downloadDataUrl(url, 'product-barcodes.zip'); URL.revokeObjectURL(url);
    addNotification({ title: 'Product ZIP Downloaded', message: `${prodItems.length} labels`, type: 'success' });
  }

  /* ─── serial batch ─── */
  function generateSerialBatch() {
    const items: BatchItem[] = [];
    for (let i = 0; i < serialCount; i++) {
      let text = '';
      let label = '';
      switch (serialType) {
        case 'imei': text = generateIMEI(serialTac); label = 'IMEI'; break;
        case 'imei2': text = generateIMEI(serialTac); label = 'IMEI2'; break;
        case 'iccid': text = generateICCID(); label = 'ICCID'; break;
        case 'sim': text = generateSIMSerial(); label = 'SIM Serial'; break;
        case 'custom': text = serialCfg.text + '-' + (i + 1).toString().padStart(3, '0'); label = 'Custom'; break;
      }
      items.push({
        id: generateId(), text, format: serialCfg.format, label: `${label} #${i + 1}`,
        width: serialCfg.width, height: serialCfg.height, showText: serialCfg.showText, fontSize: serialCfg.fontSize,
        bgColor: serialCfg.bgColor, lineColor: serialCfg.lineColor, margin: serialCfg.margin, generated: false,
      });
    }
    setSerialItems(items);
    addNotification({ title: 'Serial Batch Created', message: `${items.length} ${serialType.toUpperCase()} codes`, type: 'info' });
  }
  async function renderSerialBatch() {
    const updated: BatchItem[] = [];
    for (const item of serialItems) {
      const url = await renderBarcode(item.text, item.format, item.width, item.height, item.showText, item.fontSize, item.bgColor, item.lineColor, item.margin);
      updated.push({ ...item, previewUrl: url, generated: true });
    }
    setSerialItems(updated);
  }
  async function downloadSerialZip() {
    if (!serialItems.length) return;
    const zip = new JSZip(); const folder = zip.folder(`${serialType}-barcodes`);
    if (!folder) return;
    for (const item of serialItems) {
      const url = item.previewUrl || await renderBarcode(item.text, item.format, item.width, item.height, item.showText, item.fontSize, item.bgColor, item.lineColor, item.margin);
      if (!url) continue; const b64 = url.split(',')[1]; if (b64) folder.file(`${item.text}.png`, b64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob); downloadDataUrl(url, `${serialType}-barcodes.zip`); URL.revokeObjectURL(url);
    addNotification({ title: 'Serial ZIP Downloaded', message: `${serialItems.length} labels`, type: 'success' });
  }

  /* ─── multi label ─── */
  async function generateMultiRows() {
    const rows: MultiLabelRow[] = [];
    for (let i = 0; i < multiCount; i++) {
      const num = (multiStart + i).toString().padStart(2, '0');
      const locText = `${multiPrefix1}${num}`;
      const prodText = generateEAN13(multiPrefix2 + i.toString());
      const serialText = generateIMEI(multiPrefix3);
      const makeItem = (text: string, label: string): BatchItem => ({
        id: generateId(), text, format: multiFormat, label,
        width: multiCfg.width, height: multiCfg.height, showText: true, fontSize: multiCfg.fontSize,
        bgColor: multiCfg.bgColor, lineColor: multiCfg.lineColor, margin: multiCfg.margin, generated: false,
      });
      rows.push({
        id: generateId(),
        col1: makeItem(locText, `${multiLabel1} ${locText}`),
        col2: makeItem(prodText, `${multiLabel2} ${prodText.slice(-4)}`),
        col3: makeItem(serialText, `${multiLabel3} ${serialText.slice(-4)}`),
        col1Label: `${multiLabel1} ${locText}`,
        col2Label: `${multiLabel2} ${prodText.slice(-4)}`,
        col3Label: `${multiLabel3} ${serialText.slice(-4)}`,
      });
    }
    // generate previews
    for (const row of rows) {
      for (const col of [row.col1, row.col2, row.col3]) {
        col.previewUrl = await renderBarcode(col.text, col.format, col.width, col.height, col.showText, col.fontSize, col.bgColor, col.lineColor, col.margin);
        col.generated = true;
      }
    }
    setMultiRows(rows);
    addNotification({ title: 'Multi-Label Sheet Created', message: `${rows.length} rows × 3 columns`, type: 'info' });
  }

  async function downloadMultiSheet() {
    if (!multiRows.length) return;
    const canvas = document.createElement('canvas');
    canvas.width = sheetW; canvas.height = sheetH;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gapX = (sheetW - sheetCols * multiCfg.width) / (sheetCols + 1);
    const gapY = (sheetH - multiRows.length * multiCfg.height) / (multiRows.length + 1);

    for (let rowIdx = 0; rowIdx < multiRows.length; rowIdx++) {
      const row = multiRows[rowIdx];
      const cols = [row.col1, row.col2, row.col3];
      for (let colIdx = 0; colIdx < 3; colIdx++) {
        const item = cols[colIdx];
        if (!item.previewUrl) continue;
        const x = gapX + colIdx * (multiCfg.width + gapX);
        const y = gapY + rowIdx * (multiCfg.height + gapY);

        ctx.fillStyle = item.bgColor;
        ctx.fillRect(x, y, multiCfg.width, multiCfg.height);
        ctx.strokeStyle = '#e2e2e2'; ctx.lineWidth = 1; ctx.strokeRect(x, y, multiCfg.width, multiCfg.height);

        const img = new Image(); img.src = item.previewUrl;
        await new Promise<void>((res) => { img.onload = () => res(); });
        const scale = Math.min((multiCfg.width - 16) / item.width, (multiCfg.height - 24) / item.height) * 0.9;
        const dw = item.width * scale; const dh = item.height * scale;
        const dx = x + (multiCfg.width - dw) / 2; const dy = y + (multiCfg.height - dh) / 2 - 6;
        ctx.drawImage(img, dx, dy, dw, dh);

        ctx.fillStyle = item.lineColor; ctx.font = `${Math.max(10, multiCfg.fontSize)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(item.label, x + multiCfg.width / 2, y + multiCfg.height - 6);
      }
    }
    const url = canvas.toDataURL('image/png');
    downloadDataUrl(url, `multi-label-sheet-${multiRows.length}x3.png`);
    addNotification({ title: 'Multi-Label Sheet Downloaded', message: `${multiRows.length} rows × 3`, type: 'success' });
  }

  /* ─── shared sheet render ─── */
  async function renderToSheet(items: BatchItem[]) {
    if (!items.length) return;
    setSheetItems(items);
    const canvas = document.createElement('canvas');
    canvas.width = sheetW; canvas.height = sheetH;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    const labelW = (sheetW - (sheetCols + 1) * sheetGap) / sheetCols;
    const labelH = (sheetH - (sheetRows + 1) * sheetGap) / sheetRows;

    let idx = 0;
    for (let r = 0; r < sheetRows; r++) {
      for (let c = 0; c < sheetCols; c++) {
        if (idx >= items.length) break;
        const item = items[idx];
        const x = sheetGap + c * (labelW + sheetGap);
        const y = sheetGap + r * (labelH + sheetGap);

        ctx.fillStyle = item.bgColor; ctx.fillRect(x, y, labelW, labelH);
        ctx.strokeStyle = '#e2e2e2'; ctx.lineWidth = 1; ctx.strokeRect(x, y, labelW, labelH);

        const url = item.previewUrl || await renderBarcode(item.text, item.format, item.width, item.height, item.showText, item.fontSize, item.bgColor, item.lineColor, item.margin);
        if (!url) { idx++; continue; }
        const img = new Image(); img.src = url;
        await new Promise<void>((res) => { img.onload = () => res(); });
        const scale = Math.min((labelW - 12) / item.width, (labelH - 20) / item.height) * 0.9;
        const dw = item.width * scale; const dh = item.height * scale;
        const dx = x + (labelW - dw) / 2; const dy = y + (labelH - dh) / 2 - 4;
        ctx.drawImage(img, dx, dy, dw, dh);
        ctx.fillStyle = item.lineColor; ctx.font = `${Math.max(9, Math.floor(labelH * 0.1))}px monospace`; ctx.textAlign = 'center';
        ctx.fillText(item.label || item.text, x + labelW / 2, y + labelH - 4);
        idx++;
      }
    }
    const url = canvas.toDataURL('image/png'); setSheetPreview(url);
    addNotification({ title: 'Sheet Rendered', message: `${Math.min(items.length, sheetCols * sheetRows)} labels on sheet`, type: 'success' });
  }

  function downloadSheet() { if (!sheetPreview) return; downloadDataUrl(sheetPreview, `label-sheet-${sheetCols}x${sheetRows}.png`); }

  /* ─── tab buttons ─── */
  const tabs: { key: TabKey; label: string; icon: React.ComponentType<any> }[] = [
    { key: 'location', label: 'Location', icon: Box },
    { key: 'product', label: 'Product UPC', icon: Tag },
    { key: 'serial', label: 'Serials', icon: Smartphone },
    { key: 'multi', label: 'Multi-Label', icon: Split },
    { key: 'sheet', label: 'Sheet Layout', icon: LayoutGrid },
  ];

  /* ─── common controls component ─── */
  const StyleControls = ({ cfg, setCfg, target }: { cfg: BarcodeConfig; setCfg: (v: BarcodeConfig | ((p: BarcodeConfig) => BarcodeConfig)) => void; target: 'loc' | 'prod' | 'serial' }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Width (px)</label>
          <input type="number" value={cfg.width} onChange={(e) => setCfg((s) => ({ ...s, width: parseInt(e.target.value) || 100 }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Height (px)</label>
          <input type="number" value={cfg.height} onChange={(e) => setCfg((s) => ({ ...s, height: parseInt(e.target.value) || 50 }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Font Size</label>
          <input type="number" value={cfg.fontSize} onChange={(e) => setCfg((s) => ({ ...s, fontSize: parseInt(e.target.value) || 12 }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
        </div>
        <div>
          <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Margin</label>
          <input type="number" value={cfg.margin} onChange={(e) => setCfg((s) => ({ ...s, margin: parseInt(e.target.value) || 0 }))}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={cfg.showText} onChange={(e) => setCfg((s) => ({ ...s, showText: e.target.checked }))} className="w-4 h-4 accent-accent-sky rounded" />
          <span className="text-xs text-text-secondary">Show Text</span>
        </label>
        <div className="flex items-center gap-2">
          <input type="color" value={cfg.bgColor} onChange={(e) => setCfg((s) => ({ ...s, bgColor: e.target.value }))} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
          <input type="color" value={cfg.lineColor} onChange={(e) => setCfg((s) => ({ ...s, lineColor: e.target.value }))} className="w-6 h-6 rounded cursor-pointer border-0 p-0" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PRESETS.map((p, i) => (
          <button key={p.name} onClick={() => applyPreset(i, target)}
            className="px-2 py-1.5 rounded-lg text-[10px] bg-white/[0.04] border border-white/[0.06] text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-all text-left">
            <div className="font-semibold text-text-primary">{p.name}</div>
            <div className="mt-0.5">{p.width}×{p.height}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const FormatSelector = ({ value, onChange }: { value: BarcodeFormat; onChange: (v: BarcodeFormat) => void }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {FORMATS.map((f) => (
        <button key={f.value} onClick={() => onChange(f.value)}
          className={`px-3 py-2 rounded-lg text-xs text-left border transition-all ${
            value === f.value ? 'border-accent-sky/50 bg-accent-sky/10 text-accent-sky' : 'border-white/[0.06] text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
          }`}>
          <div className="font-semibold">{f.label}</div>
          <div className="text-[10px] opacity-60 mt-0.5 leading-tight">{f.desc}</div>
        </button>
      ))}
    </div>
  );

  const PreviewPanel = ({ preview, label, onDownload, prefix }: { preview: string; label?: string; onDownload: () => void; prefix: string }) => (
    <div className="space-y-4">
      <div className="glass-panel rounded-xl p-5 flex flex-col items-center min-h-[300px]">
        <div className="flex items-center gap-2 mb-4 self-start">
          <FileImage className="w-4 h-4 text-accent-sky" />
          <h3 className="text-sm font-semibold text-text-primary">Preview</h3>
        </div>
        {preview ? (
          <div className="flex flex-col items-center gap-3">
            <img src={preview} alt="Barcode" className="rounded-lg border border-white/[0.08]" style={{ maxWidth: '100%', imageRendering: 'pixelated' }} />
            {label && <p className="text-xs text-text-secondary text-center">{label}</p>}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-sm">Enter text to generate preview</div>
        )}
      </div>
      <button onClick={onDownload} disabled={!preview}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-sky text-void rounded-lg text-sm font-semibold hover:bg-accent-sky/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
        <Download className="w-4 h-4" /> Download PNG
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary flex items-center gap-3">
          <Barcode className="w-7 h-7 text-accent-sky" />
          Barcode Generator
        </h1>
        <p className="text-text-secondary mt-1">Generate location, product UPC/EAN, and serial number barcodes for warehouse labeling.</p>
      </motion.div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon; const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active ? 'bg-accent-sky text-void' : 'bg-white/[0.04] text-text-secondary hover:text-text-primary hover:bg-white/[0.08]'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* ═══════ LOCATION ═══════ */}
        {activeTab === 'location' && (
          <motion.div key="location" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="glass-panel rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2"><Box className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">Location Code</h3></div>
                <input type="text" value={loc.text} onChange={(e) => setLoc((s) => ({ ...s, text: e.target.value }))}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder="e.g., SHELF-D-01-01, A1-01, PALLET-003" />
                <input type="text" value={loc.label} onChange={(e) => setLoc((s) => ({ ...s, label: e.target.value }))}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50" placeholder="Optional label description" />
              </div>
              <div className="glass-panel rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2"><ScanBarcode className="w-4 h-4 text-accent-green" /><h3 className="text-sm font-semibold text-text-primary">Format</h3></div>
                <FormatSelector value={loc.format} onChange={(f) => setLoc((s) => ({ ...s, format: f }))} />
              </div>
              <div className="glass-panel rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2"><Settings className="w-4 h-4 text-accent-yellow" /><h3 className="text-sm font-semibold text-text-primary">Style</h3></div>
                <StyleControls cfg={loc} setCfg={setLoc} target="loc" />
              </div>
              {showLocHistory && locHistory.length > 0 && (
                <div className="glass-panel rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Recent</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {locHistory.map((h, i) => (
                      <button key={i} onClick={() => setLoc(h)} className="w-full flex items-center justify-between p-2.5 bg-white/[0.02] rounded-md text-left hover:bg-white/[0.06] transition-all">
                        <div>
                          <p className="text-xs font-mono text-text-primary">{h.text}</p>
                          <p className="text-[10px] text-text-secondary">{h.format} · {h.width}×{h.height}</p>
                        </div>
                        <Copy className="w-3 h-3 text-text-secondary" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <PreviewPanel preview={locPreview} label={loc.label} onDownload={() => downloadSingle(loc, locPreview, 'loc')} prefix="loc" />
              <button onClick={() => setShowLocHistory((s) => !s)} className="w-full px-4 py-2.5 bg-white/[0.04] text-text-primary rounded-lg text-sm hover:bg-white/[0.08] transition-all">
                <RotateCcw className="w-4 h-4 inline mr-2" /> {showLocHistory ? 'Hide' : 'Show'} History
              </button>
            </div>
          </motion.div>
        )}

        {/* ═══════ PRODUCT ═══════ */}
        {activeTab === 'product' && (
          <motion.div key="product" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="glass-panel rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-2"><Tag className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">Product Barcode</h3></div>
                  <input type="text" value={prod.text} onChange={(e) => setProd((s) => ({ ...s, text: e.target.value }))}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder="EAN-13, UPC-A, or SKU" />
                  <input type="text" value={prod.label} onChange={(e) => setProd((s) => ({ ...s, label: e.target.value }))}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50" placeholder="Product name / description" />
                  <FormatSelector value={prod.format} onChange={(f) => setProd((s) => ({ ...s, format: f }))} />
                  <StyleControls cfg={prod} setCfg={setProd} target="prod" />
                </div>
                <div className="glass-panel rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-2"><Wand2 className="w-4 h-4 text-accent-yellow" /><h3 className="text-sm font-semibold text-text-primary">EAN-13 Batch Generator</h3></div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Prefix</label>
                      <input type="text" value={prodPrefix} onChange={(e) => setProdPrefix(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder="880" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Count</label>
                      <input type="number" min={1} max={100} value={prodCount} onChange={(e) => setProdCount(Math.min(100, parseInt(e.target.value) || 1))}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Product Name</label>
                      <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50" placeholder="Galaxy S24" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={generateProductBatch} className="flex items-center gap-2 px-4 py-2.5 bg-accent-sky text-void rounded-lg text-sm font-semibold hover:bg-accent-sky/90 transition-all"><Wand2 className="w-4 h-4" /> Generate EANs</button>
                    <button onClick={renderProductBatch} disabled={!prodItems.length} className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] text-text-primary rounded-lg text-sm hover:bg-white/[0.08] transition-all disabled:opacity-40"><FileImage className="w-4 h-4" /> Render</button>
                    <button onClick={downloadProductZip} disabled={!prodItems.length} className="flex items-center gap-2 px-4 py-2.5 bg-accent-green text-void rounded-lg text-sm font-semibold hover:bg-accent-green/90 transition-all disabled:opacity-40"><Download className="w-4 h-4" /> ZIP</button>
                    <button onClick={() => renderToSheet(prodItems)} disabled={!prodItems.length} className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] text-text-primary rounded-lg text-sm hover:bg-white/[0.08] transition-all disabled:opacity-40"><LayoutGrid className="w-4 h-4" /> Sheet</button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <PreviewPanel preview={prodPreview} label={prod.label} onDownload={() => downloadSingle(prod, prodPreview, 'product')} prefix="product" />
              </div>
            </div>

            {prodItems.length > 0 && (
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-text-primary">{prodItems.length} Product Barcodes</h3>
                  <button onClick={() => setProdItems([])} className="text-xs text-accent-red hover:underline flex items-center gap-1"><Trash2 className="w-3 h-3" /> Clear</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {prodItems.map((item) => (
                    <div key={item.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 flex flex-col items-center gap-2">
                      <div className="h-[80px] flex items-center justify-center w-full">
                        {item.previewUrl ? <img src={item.previewUrl} alt={item.text} className="max-h-full max-w-full rounded" style={{ imageRendering: 'pixelated' }} /> : <span className="text-[10px] text-text-secondary">Not rendered</span>}
                      </div>
                      <p className="text-xs font-mono text-text-primary">{item.text}</p>
                      <p className="text-[10px] text-text-secondary text-center truncate w-full">{item.label}</p>
                      {item.previewUrl && (
                        <button onClick={() => downloadDataUrl(item.previewUrl!, `product-${item.text}.png`)} className="text-[10px] text-accent-sky hover:underline flex items-center gap-1"><Download className="w-3 h-3" /> Download</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════ SERIAL ═══════ */}
        {activeTab === 'serial' && (
          <motion.div key="serial" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="glass-panel rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-2"><Smartphone className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">Serial Number Barcode</h3></div>
                  <div className="flex gap-2 flex-wrap">
                    {(['imei', 'imei2', 'iccid', 'sim', 'custom'] as SerialType[]).map((t) => (
                      <button key={t} onClick={() => setSerialType(t)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          serialType === t ? 'border-accent-sky/50 bg-accent-sky/10 text-accent-sky' : 'border-white/[0.06] text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
                        }`}>
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <input type="text" value={serialCfg.text} onChange={(e) => setSerialCfg((s) => ({ ...s, text: e.target.value }))}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder={`Enter ${serialType.toUpperCase()} or use batch generator`} />
                  <FormatSelector value={serialCfg.format} onChange={(f) => setSerialCfg((s) => ({ ...s, format: f }))} />
                  <StyleControls cfg={serialCfg} setCfg={setSerialCfg} target="serial" />
                </div>

                <div className="glass-panel rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-2"><Wand2 className="w-4 h-4 text-accent-yellow" /><h3 className="text-sm font-semibold text-text-primary">{serialType.toUpperCase()} Batch Generator</h3></div>
                  {(serialType === 'imei' || serialType === 'imei2') && (
                    <div>
                      <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">TAC Prefix (8 digits)</label>
                      <div className="flex gap-2">
                        <input type="text" value={serialTac} onChange={(e) => setSerialTac(e.target.value.replace(/\D/g, '').slice(0, 8))}
                          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder="35567890" />
                        <select onChange={(e) => { if (e.target.value) setSerialTac(e.target.value); }}
                          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50">
                          <option value="">TAC DB…</option>
                          {tacDb.map((t) => (
                            <option key={t.tacPrefix} value={t.tacPrefix}>{t.tacPrefix} — {t.modelSeries}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Count</label>
                      <input type="number" min={1} max={100} value={serialCount} onChange={(e) => setSerialCount(Math.min(100, parseInt(e.target.value) || 1))}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Format</label>
                      <select value={serialCfg.format} onChange={(e) => setSerialCfg((s) => ({ ...s, format: e.target.value as BarcodeFormat }))}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50">
                        {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={generateSerialBatch} className="flex items-center gap-2 px-4 py-2.5 bg-accent-sky text-void rounded-lg text-sm font-semibold hover:bg-accent-sky/90 transition-all"><Wand2 className="w-4 h-4" /> Generate {serialType.toUpperCase()}s</button>
                    <button onClick={renderSerialBatch} disabled={!serialItems.length} className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] text-text-primary rounded-lg text-sm hover:bg-white/[0.08] transition-all disabled:opacity-40"><FileImage className="w-4 h-4" /> Render</button>
                    <button onClick={downloadSerialZip} disabled={!serialItems.length} className="flex items-center gap-2 px-4 py-2.5 bg-accent-green text-void rounded-lg text-sm font-semibold hover:bg-accent-green/90 transition-all disabled:opacity-40"><Download className="w-4 h-4" /> ZIP</button>
                    <button onClick={() => renderToSheet(serialItems)} disabled={!serialItems.length} className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] text-text-primary rounded-lg text-sm hover:bg-white/[0.08] transition-all disabled:opacity-40"><LayoutGrid className="w-4 h-4" /> Sheet</button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <PreviewPanel preview={serialPreview} label={serialCfg.label} onDownload={() => downloadSingle(serialCfg, serialPreview, 'serial')} prefix="serial" />
              </div>
            </div>

            {serialItems.length > 0 && (
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-text-primary">{serialItems.length} {serialType.toUpperCase()} Barcodes</h3>
                  <button onClick={() => setSerialItems([])} className="text-xs text-accent-red hover:underline flex items-center gap-1"><Trash2 className="w-3 h-3" /> Clear</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {serialItems.map((item) => (
                    <div key={item.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 flex flex-col items-center gap-2">
                      <div className="h-[60px] flex items-center justify-center w-full">
                        {item.previewUrl ? <img src={item.previewUrl} alt={item.text} className="max-h-full max-w-full rounded" style={{ imageRendering: 'pixelated' }} /> : <span className="text-[10px] text-text-secondary">Not rendered</span>}
                      </div>
                      <p className="text-[10px] font-mono text-text-primary break-all text-center">{item.text}</p>
                      <p className="text-[10px] text-text-secondary text-center">{item.label}</p>
                      {item.previewUrl && (
                        <button onClick={() => downloadDataUrl(item.previewUrl!, `serial-${item.text}.png`)} className="text-[10px] text-accent-sky hover:underline flex items-center gap-1"><Download className="w-3 h-3" /> Download</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════ MULTI-LABEL ═══════ */}
        {activeTab === 'multi' && (
          <motion.div key="multi" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-4">
            <div className="glass-panel rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2"><Split className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">Multi-Label Sheet — 3 Columns per Row</h3></div>
              <p className="text-xs text-text-secondary">Generate rows like the reference image: Location · Product UPC · Serial Number</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Column 1 Label</label>
                  <input type="text" value={multiLabel1} onChange={(e) => setMultiLabel1(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Column 2 Label</label>
                  <input type="text" value={multiLabel2} onChange={(e) => setMultiLabel2(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Column 3 Label</label>
                  <input type="text" value={multiLabel3} onChange={(e) => setMultiLabel3(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Prefix 1 (Location)</label>
                  <input type="text" value={multiPrefix1} onChange={(e) => setMultiPrefix1(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder="SHELF-D-01-" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Prefix 2 (UPC)</label>
                  <input type="text" value={multiPrefix2} onChange={(e) => setMultiPrefix2(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder="880" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Prefix 3 (Serial)</label>
                  <input type="text" value={multiPrefix3} onChange={(e) => setMultiPrefix3(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" placeholder="TAC prefix" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Start #</label>
                  <input type="number" value={multiStart} onChange={(e) => setMultiStart(parseInt(e.target.value) || 1)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Row Count</label>
                  <input type="number" min={1} max={50} value={multiCount} onChange={(e) => setMultiCount(Math.min(50, parseInt(e.target.value) || 1))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50" />
                </div>
                <div>
                  <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Barcode Format</label>
                  <select value={multiFormat} onChange={(e) => setMultiFormat(e.target.value as BarcodeFormat)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky/50">
                    {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Label Width</label><input type="number" value={multiCfg.width} onChange={(e) => setMultiCfg((s) => ({ ...s, width: parseInt(e.target.value) || 100 }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Label Height</label><input type="number" value={multiCfg.height} onChange={(e) => setMultiCfg((s) => ({ ...s, height: parseInt(e.target.value) || 50 }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Font Size</label><input type="number" value={multiCfg.fontSize} onChange={(e) => setMultiCfg((s) => ({ ...s, fontSize: parseInt(e.target.value) || 12 }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Margin</label><input type="number" value={multiCfg.margin} onChange={(e) => setMultiCfg((s) => ({ ...s, margin: parseInt(e.target.value) || 0 }))} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={generateMultiRows} className="flex items-center gap-2 px-4 py-2.5 bg-accent-sky text-void rounded-lg text-sm font-semibold hover:bg-accent-sky/90 transition-all"><Wand2 className="w-4 h-4" /> Generate Sheet</button>
                <button onClick={downloadMultiSheet} disabled={!multiRows.length} className="flex items-center gap-2 px-4 py-2.5 bg-accent-green text-void rounded-lg text-sm font-semibold hover:bg-accent-green/90 transition-all disabled:opacity-40"><Download className="w-4 h-4" /> Download Sheet</button>
              </div>
            </div>

            {multiRows.length > 0 && (
              <div className="glass-panel rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">{multiRows.length} Rows × 3 Columns</h3>
                <div className="space-y-3">
                  {multiRows.map((row) => (
                    <div key={row.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                      <div className="grid grid-cols-3 gap-3">
                        {[row.col1, row.col2, row.col3].map((col, ci) => (
                          <div key={ci} className="flex flex-col items-center gap-1">
                            <div className="h-[70px] flex items-center justify-center w-full">
                              {col.previewUrl ? <img src={col.previewUrl} alt={col.text} className="max-h-full max-w-full rounded" style={{ imageRendering: 'pixelated' }} /> : <span className="text-[10px] text-text-secondary">Loading</span>}
                            </div>
                            <p className="text-[10px] font-mono text-text-primary text-center break-all">{col.text}</p>
                            <p className="text-[9px] text-text-secondary">{ci === 0 ? row.col1Label : ci === 1 ? row.col2Label : row.col3Label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════ SHEET ═══════ */}
        {activeTab === 'sheet' && (
          <motion.div key="sheet" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }} className="space-y-4">
            <div className="glass-panel rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2"><LayoutGrid className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">Sheet Layout Settings</h3></div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Columns</label><input type="number" min={1} max={10} value={sheetCols} onChange={(e) => setSheetCols(parseInt(e.target.value) || 3)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Rows</label><input type="number" min={1} max={20} value={sheetRows} onChange={(e) => setSheetRows(parseInt(e.target.value) || 7)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Sheet Width</label><input type="number" value={sheetW} onChange={(e) => setSheetW(parseInt(e.target.value) || 900)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Sheet Height</label><input type="number" value={sheetH} onChange={(e) => setSheetH(parseInt(e.target.value) || 302)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div><label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Gap (px)</label><input type="number" value={sheetGap} onChange={(e) => setSheetGap(parseInt(e.target.value) || 8)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono" /></div>
                <div className="flex items-end"><p className="text-xs text-text-secondary">Capacity: {sheetCols * sheetRows} labels</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={downloadSheet} disabled={!sheetPreview} className="flex items-center gap-2 px-4 py-2.5 bg-accent-green text-void rounded-lg text-sm font-semibold hover:bg-accent-green/90 transition-all disabled:opacity-40"><Download className="w-4 h-4" /> Download Sheet</button>
              </div>
            </div>
            {sheetPreview && (
              <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4"><Printer className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">Sheet Preview</h3></div>
                <div className="overflow-x-auto"><img src={sheetPreview} alt="Sheet" className="rounded-lg border border-white/[0.08] mx-auto" style={{ maxWidth: '100%', imageRendering: 'pixelated' }} /></div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
