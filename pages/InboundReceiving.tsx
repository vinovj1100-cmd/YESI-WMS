import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction, logInventoryMovement } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import BarcodeReader from '@/components/BarcodeReader';
import { Package, Plus, History, ArrowRight, AlertTriangle, ShieldCheck, FileSpreadsheet, Upload, CheckCircle, ClipboardList, Sheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { InboundRecord, PurchaseOrder } from '@/lib/db';

type ReceivingTab = 'manual' | 'excel' | 'po';

interface ExcelPreviewRow {
  sku: string;
  product: string;
  quantity: number;
  location: string;
}

interface POItem {
  sku: string;
  qty: number;
  expected: number;
  received: number;
}

export default function InboundReceiving() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ReceivingTab>('manual');

  // Manual scan state
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState(1);
  const [bin, setBin] = useState('');
  const [description, setDescription] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [crossDockOrderId, setCrossDockOrderId] = useState('');
  const [qcMode, setQcMode] = useState(false);
  const [qcStatus, setQcStatus] = useState<'pending' | 'passed' | 'failed'>('pending');
  const [scanMode, setScanMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Excel upload state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [excelData, setExcelData] = useState<Record<string, any>[]>([]);
  const [skuCol, setSkuCol] = useState('');
  const [productCol, setProductCol] = useState('');
  const [qtyCol, setQtyCol] = useState('');
  const [locCol, setLocCol] = useState('');
  const [previewRows, setPreviewRows] = useState<ExcelPreviewRow[]>([]);
  const [committed, setCommitted] = useState(false);

  // PO reconcile state
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [expandedPOId, setExpandedPOId] = useState<number | null>(null);
  const [poReceiveInputs, setPoReceiveInputs] = useState<Record<string, number>>({});
  const [poPutawaySuggestions, setPoPutawaySuggestions] = useState<Record<string, string>>({});

  const loadPOs = useCallback(async () => {
    const pos = await db.purchaseOrders.toArray();
    setPurchaseOrders(pos);
  }, []);

  useEffect(() => {
    loadPOs();
  }, [loadPOs]);

  // Fetch putaway suggestions when a PO is expanded
  useEffect(() => {
    if (expandedPOId == null) {
      setPoPutawaySuggestions({});
      return;
    }
    const po = purchaseOrders.find(p => p.id === expandedPOId);
    if (!po) return;
    const items = getPOItems(po);
    const fetchSuggestions = async () => {
      const suggs: Record<string, string> = {};
      for (const item of items) {
        suggs[item.sku] = await suggestPutaway(item.sku);
      }
      setPoPutawaySuggestions(suggs);
    };
    fetchSuggestions();
  }, [expandedPOId, purchaseOrders]);

  // Directed Putaway: suggest best zone based on velocity, category, weight
  const suggestPutaway = useCallback(async (itemSku: string) => {
    const item = await db.inventory.where({ sku: itemSku.trim() }).first();
    if (!item) return 'UNASSIGNED';
    const zones = await db.zoneCapacities.toArray();
    const velocity = item.velocity || 'medium';
    const category = item.category || 'General';
    const weight = item.weight || 0;
    // Score zones: prefer matching velocity + category, then capacity
    const scored = zones.map(z => {
      let score = 0;
      if (z.velocityTarget === velocity) score += 3;
      if (z.category === category) score += 2;
      if ((z.maxWeight || 999) >= weight) score += 1;
      const utilization = z.currentUtilization / (z.maxCapacity || 1);
      score += (1 - utilization) * 2;
      return { zone: z.zone, score, capacity: z.maxCapacity };
    }).sort((a, b) => b.score - a.score);
    return scored.length > 0 ? scored[0].zone : 'UNASSIGNED';
  }, []);

  const getPOItems = (po: PurchaseOrder): POItem[] => {
    try { return JSON.parse(po.items); } catch { return []; }
  };

  const handlePOReceive = async (po: PurchaseOrder, itemSku: string, qty: number) => {
    const items = getPOItems(po);
    const item = items.find((i: POItem) => i.sku === itemSku);
    if (!item) return;
    const suggested = await suggestPutaway(itemSku);
    await processReceive(itemSku, qty, item.sku, suggested);
    // Update PO
    const updated = items.map((i: POItem) => i.sku === itemSku ? { ...i, received: (i.received || 0) + qty } : i);
    const allReceived = updated.every((i: POItem) => (i.received || 0) >= i.expected);
    await db.purchaseOrders.update(po.id!, {
      items: JSON.stringify(updated),
      status: allReceived ? 'received' : 'partial',
      updatedAt: new Date().toISOString(),
    });
    loadPOs();
    loadRecent();
    setMessage({ type: 'success', text: `Received ${qty}× ${itemSku} → ${suggested}` });
  };

  const [gSheetLinks, setGSheetLinks] = useState<{ clientName: string; url: string; addedAt: string }[]>(() => {
    try {
      const saved = localStorage.getItem('vortex_g_sheet_links');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [gSheetClient, setGSheetClient] = useState('');
  const [gSheetUrl, setGSheetUrl] = useState('');
  const [gSheetMsg, setGSheetMsg] = useState<string | null>(null);

  const [recentInbound, setRecentInbound] = useState<InboundRecord[]>([]);

  const loadRecent = useCallback(async () => {
    const items = await db.inbound.reverse().limit(10).toArray();
    setRecentInbound(items);
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    localStorage.setItem('vortex_g_sheet_links', JSON.stringify(gSheetLinks));
  }, [gSheetLinks]);

  const handleAddGSheet = () => {
    if (!gSheetClient.trim() || !gSheetUrl.trim()) {
      setGSheetMsg('Enter both client name and Google Sheet link');
      return;
    }
    if (!gSheetUrl.includes('docs.google.com/spreadsheets')) {
      setGSheetMsg('Please enter a valid Google Sheets URL');
      return;
    }
    setGSheetLinks(prev => [...prev, { clientName: gSheetClient.trim(), url: gSheetUrl.trim(), addedAt: new Date().toISOString() }]);
    setGSheetClient('');
    setGSheetUrl('');
    setGSheetMsg('Link added successfully');
    setTimeout(() => setGSheetMsg(null), 3000);
  };

  const handleRemoveGSheet = (index: number) => {
    setGSheetLinks(prev => prev.filter((_, i) => i !== index));
  };

  const handleScan = (code: string) => {
    setSku(code);
    setScanMode(false);
  };

  const processReceive = async (rSku: string, rQty: number, rDesc: string, rBin: string, opts?: { lot?: string; expiry?: string; crossDock?: string; qc?: 'pending' | 'passed' | 'failed' }) => {
    const existing = await db.inventory.where({ sku: rSku.trim() }).first();
    const finalBin = rBin.trim() || (existing?.location) || 'UNASSIGNED';

    if (opts?.crossDock?.trim()) {
      const existingOrder = await db.orders.where({ orderId: opts.crossDock.trim() }).first();
      if (!existingOrder) {
        await db.orders.add({
          orderId: opts.crossDock.trim(),
          status: 'CrossDock',
          requiredSkus: rSku.trim(),
          priority: 'high',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (existing) {
      await db.inventory.update(existing.id!, {
        stock: (existing.stock || 0) + rQty,
        location: finalBin,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await db.inventory.add({
        sku: rSku.trim(),
        product: rDesc || 'Unknown Product',
        stock: rQty,
        location: finalBin,
        updatedAt: new Date().toISOString(),
      });
    }

    await db.inbound.add({
      sku: rSku.trim(),
      qty: rQty,
      bin: finalBin,
      description: rDesc || 'Unknown Product',
      lotNumber: opts?.lot?.trim() || undefined,
      expiryDate: opts?.expiry || undefined,
      receivedAt: new Date().toISOString(),
      crossDockOrderId: opts?.crossDock?.trim() || undefined,
      qcStatus: opts?.qc || 'passed',
    });

    await logInventoryMovement(rSku.trim(), 'inbound', rQty, user?.displayName || 'Unknown', {
      toLocation: finalBin,
      lotNumber: opts?.lot?.trim() || undefined,
      note: opts?.crossDock?.trim() ? `Cross-dock for ${opts.crossDock}` : `Inbound receipt`,
    });
  };

  const handleReceive = async () => {
    if (!sku.trim()) {
      setMessage({ type: 'error', text: 'Please enter a SKU' });
      return;
    }
    try {
      await processReceive(sku.trim(), qty, description, bin, {
        lot: lotNumber, expiry: expiryDate, crossDock: crossDockOrderId, qc: qcMode ? qcStatus : 'passed',
      });
      await logAction('INBOUND_RECEIVE', `Received ${qty}x ${sku} to ${bin || 'UNASSIGNED'}`, user?.displayName || 'Unknown');
      setMessage({ type: 'success', text: `Updated ${sku}: +${qty} units` });
      setSku(''); setQty(1); setBin(''); setDescription(''); setLotNumber(''); setExpiryDate(''); setCrossDockOrderId(''); setQcStatus('pending');
      loadRecent();
    } catch {
      setMessage({ type: 'error', text: 'Failed to receive inventory' });
    }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);
    setCommitted(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (json.length > 0) {
          const headers = json[0].map((h: any) => String(h).trim());
          setExcelColumns(headers);
          const rows = json.slice(1).map((row: any[]) => {
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          }).filter(r => Object.values(r).some(v => v !== undefined && v !== ''));
          setExcelData(rows);
          // Auto-guess columns
          const guess = (keywords: string[]) => headers.find(h => keywords.some(k => h.toLowerCase().includes(k)));
          setSkuCol(guess(['sku', 'item', 'code', 'product code']) || headers[0] || '');
          setProductCol(guess(['product', 'desc', 'name', 'title']) || headers[1] || '');
          setQtyCol(guess(['qty', 'quantity', 'count', 'amount']) || headers[2] || '');
          setLocCol(guess(['loc', 'bin', 'location', 'zone']) || '');
          setMessage({ type: 'success', text: `Loaded ${rows.length} rows from ${file.name}` });
        }
      } catch {
        setMessage({ type: 'error', text: 'Failed to parse Excel file' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    if (excelData.length > 0 && skuCol) {
      const preview: ExcelPreviewRow[] = excelData.slice(0, 10).map((row) => ({
        sku: String(row[skuCol] || '').trim().toUpperCase(),
        product: productCol ? String(row[productCol] || '').trim() : '',
        quantity: qtyCol ? parseInt(row[qtyCol]) || 1 : 1,
        location: locCol ? String(row[locCol] || '').trim().toUpperCase() : 'UNASSIGNED',
      }));
      setPreviewRows(preview);
    } else {
      setPreviewRows([]);
    }
  }, [excelData, skuCol, productCol, qtyCol, locCol]);

  const handleExcelCommit = async () => {
    if (!skuCol || previewRows.length === 0) return;
    const allRows = excelData.map((row) => ({
      sku: String(row[skuCol] || '').trim().toUpperCase(),
      product: productCol ? String(row[productCol] || '').trim() : '',
      quantity: qtyCol ? parseInt(row[qtyCol]) || 1 : 1,
      location: locCol ? String(row[locCol] || '').trim().toUpperCase() : 'UNASSIGNED',
    })).filter(r => r.sku);

    let count = 0;
    for (const item of allRows) {
      await processReceive(item.sku, item.quantity, item.product, item.location);
      count++;
    }
    await logAction('INBOUND_BULK', `Excel bulk receive: ${count} items`, user?.displayName || 'Unknown');
    setCommitted(true);
    setMessage({ type: 'success', text: `Committed ${count} items successfully!` });
    loadRecent();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Inbound Receiving</h1>
        <p className="text-sm text-text-secondary mt-1">Log new deliveries with lot tracking, expiry, and cross-docking</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${activeTab === 'manual' ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30' : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'}`}
        >
          Manual Scan
        </button>
        <button
          onClick={() => setActiveTab('excel')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'excel' ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30' : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'}`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Excel Upload
        </button>
        <button
          onClick={() => setActiveTab('po')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'po' ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30' : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'}`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          PO Reconcile
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Manual Tab */}
          {activeTab === 'manual' && (
            <div className="glass-panel rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <Package className="w-5 h-5 text-accent-sky" />
                <h2 className="text-sm font-semibold text-text-primary">Receive Inventory</h2>
                <button
                  onClick={() => setScanMode(!scanMode)}
                  className="ml-auto text-[10px] bg-accent-sky/20 text-accent-sky px-3 py-1 rounded-full hover:bg-accent-sky/30 transition-colors"
                >
                  {scanMode ? 'Manual Entry' : 'Scan Mode'}
                </button>
              </div>

              <AnimatePresence mode="wait">
                {scanMode ? (
                  <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4">
                    <BarcodeReader onScan={handleScan} placeholder="Scan barcode or type SKU and press Enter..." />
                  </motion.div>
                ) : (
                  <motion.div key="manual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">SKU</label>
                        <input type="text" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono" placeholder="APP-IP15-256-BLK" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Quantity</label>
                        <input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Bin Location</label>
                        <input type="text" value={bin} onChange={(e) => setBin(e.target.value.toUpperCase())} className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono" placeholder="C4-10" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!scanMode && (
                <div className="mb-4">
                  <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Product Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors" placeholder="For new SKUs only" />
                </div>
              )}

              <div className="mb-4">
                <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-[10px] text-accent-sky hover:text-accent-sky/80 uppercase tracking-widest flex items-center gap-1">
                  <ArrowRight className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                  Advanced Options (Lot, Expiry, Cross-Dock, QC)
                </button>
              </div>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-white/[0.02] rounded-md border border-white/[0.06]">
                      <div>
                        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Lot Number</label>
                        <input type="text" value={lotNumber} onChange={(e) => setLotNumber(e.target.value.toUpperCase())} className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono" placeholder="LOT-2024-001" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Expiry Date</label>
                        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Cross-Dock Order ID</label>
                        <input type="text" value={crossDockOrderId} onChange={(e) => setCrossDockOrderId(e.target.value.toUpperCase())} className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono" placeholder="ORD-XXXX" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">QC Status</label>
                        <div className="flex gap-2">
                          {(['passed', 'pending', 'failed'] as const).map(s => (
                            <button key={s} onClick={() => { setQcMode(true); setQcStatus(s); }} className={`flex-1 py-1.5 text-[10px] rounded-md border transition-all uppercase ${qcMode && qcStatus === s ? s === 'passed' ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : s === 'failed' ? 'bg-accent-red/20 border-accent-red/40 text-accent-red' : 'bg-accent-yellow/20 border-accent-yellow/40 text-accent-yellow' : 'bg-white/[0.02] border-white/[0.06] text-text-secondary'}`}>{s}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {crossDockOrderId.trim() && (
                      <div className="mb-4 p-3 bg-accent-sky/10 border border-accent-sky/20 rounded-md flex items-start gap-2">
                        <ArrowRight className="w-4 h-4 text-accent-sky flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-accent-sky">Cross-dock mode enabled. Item will be received and immediately assigned to order {crossDockOrderId}.</p>
                      </div>
                    )}
                    {qcStatus === 'failed' && (
                      <div className="mb-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-md flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-accent-red flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-accent-red">QC Failed: Item will be placed on QC Hold and NOT added to active inventory.</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {message && activeTab === 'manual' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`mb-4 p-3 rounded-md text-xs ${message.type === 'success' ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green' : message.type === 'warning' ? 'bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow' : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'}`}>
                    {message.text}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button onClick={handleReceive} whileTap={{ scale: 0.98 }} className="flex items-center gap-2 px-5 py-2.5 bg-accent-sky text-void font-semibold text-sm rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]">
                <Plus className="w-4 h-4" />
                Receive Inventory
              </motion.button>
            </div>
          )}

          {/* Excel Tab */}
          {activeTab === 'excel' && (
            <div className="glass-panel rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <FileSpreadsheet className="w-5 h-5 text-accent-sky" />
                <h2 className="text-sm font-semibold text-text-primary">Excel Bulk Upload</h2>
              </div>

              <div className="mb-4">
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Upload Excel / CSV</label>
                <div
                  onClick={() => document.getElementById('excel-upload')?.click()}
                  className="h-24 border-2 border-dashed border-white/[0.08] rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-accent-sky/30 transition-colors"
                >
                  <Upload className="w-6 h-6 text-text-secondary mb-1" />
                  <p className="text-xs text-text-secondary">{excelFile ? excelFile.name : 'Click to upload .xlsx or .csv'}</p>
                </div>
                <input id="excel-upload" type="file" accept=".xlsx,.csv" onChange={handleExcelUpload} className="hidden" />
              </div>

              {excelColumns.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
                  <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Column Mapping</p>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[9px] text-text-secondary mb-1">SKU</label>
                      <select value={skuCol} onChange={(e) => setSkuCol(e.target.value)} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-sky">
                        {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-text-secondary mb-1">Product</label>
                      <select value={productCol} onChange={(e) => setProductCol(e.target.value)} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-sky">
                        <option value="">—</option>
                        {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-text-secondary mb-1">Quantity</label>
                      <select value={qtyCol} onChange={(e) => setQtyCol(e.target.value)} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-sky">
                        <option value="">—</option>
                        {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-text-secondary mb-1">Location</label>
                      <select value={locCol} onChange={(e) => setLocCol(e.target.value)} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-sky">
                        <option value="">—</option>
                        {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}

              {previewRows.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
                  <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Preview ({excelData.length} rows)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                          <th className="text-left py-1.5 px-2">SKU</th>
                          <th className="text-left py-1.5 px-2">Product</th>
                          <th className="text-center py-1.5 px-2">Qty</th>
                          <th className="text-center py-1.5 px-2">Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-white/[0.04]">
                            <td className="py-1.5 px-2 font-mono text-text-primary">{row.sku}</td>
                            <td className="py-1.5 px-2 text-text-secondary">{row.product}</td>
                            <td className="py-1.5 px-2 text-center text-accent-sky">{row.quantity}</td>
                            <td className="py-1.5 px-2 text-center font-mono text-text-secondary">{row.location}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {excelData.length > 10 && (
                    <p className="text-[9px] text-text-secondary mt-1 text-center">... and {excelData.length - 10} more rows</p>
                  )}
                </motion.div>
              )}

              <AnimatePresence>
                {message && activeTab === 'excel' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`mb-4 p-3 rounded-md text-xs ${message.type === 'success' ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green' : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'}`}>
                    {message.text}
                  </motion.div>
                )}
              </AnimatePresence>

              {previewRows.length > 0 && !committed && (
                <motion.button onClick={handleExcelCommit} whileTap={{ scale: 0.98 }} className="w-full flex items-center justify-center gap-2 py-2.5 bg-accent-green text-void font-semibold text-xs rounded-md hover:bg-accent-green/90 transition-colors active:translate-y-[1px]">
                  <CheckCircle className="w-4 h-4" />
                  Receive All ({excelData.length} items)
                </motion.button>
              )}
              {committed && (
                <div className="flex items-center gap-2 p-3 bg-accent-green/10 border border-accent-green/20 rounded-md text-xs text-accent-green">
                  <CheckCircle className="w-4 h-4" />
                  Committed successfully!
                </div>
              )}
            </div>
          )}

          {/* PO Reconcile Tab */}
          {activeTab === 'po' && (
            <div className="glass-panel rounded-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <ClipboardList className="w-5 h-5 text-accent-sky" />
                <h2 className="text-sm font-semibold text-text-primary">PO Reconcile</h2>
              </div>

              {purchaseOrders.length === 0 ? (
                <p className="text-xs text-text-secondary text-center py-8">No purchase orders found</p>
              ) : (
                <div className="space-y-3">
                  {purchaseOrders.map((po) => {
                    const items = getPOItems(po);
                    const isExpanded = expandedPOId === po.id;
                    return (
                      <div key={po.id} className="bg-white/[0.02] border border-white/[0.06] rounded-md overflow-hidden">
                        <button
                          onClick={() => setExpandedPOId(isExpanded ? null : po.id!)}
                          className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-semibold text-text-primary">{po.poNumber}</span>
                            <span className="text-xs text-text-secondary">{po.supplier}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              po.status === 'received' ? 'bg-accent-green/20 text-accent-green' :
                              po.status === 'partial' ? 'bg-accent-yellow/20 text-accent-yellow' :
                              po.status === 'open' ? 'bg-accent-sky/20 text-accent-sky' :
                              'bg-white/[0.05] text-text-secondary'
                            }`}>
                              {po.status}
                            </span>
                            <span className="text-[10px] text-text-secondary">Expected: {po.expectedDelivery}</span>
                            <ArrowRight className={`w-3 h-3 text-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-4 space-y-2">
                                {items.map((item) => {
                                  const received = item.received || 0;
                                  const variance = item.expected - received;
                                  const inputKey = `${po.id}-${item.sku}`;
                                  const currentInput = poReceiveInputs[inputKey] ?? Math.max(1, variance);
                                  return (
                                    <div key={item.sku} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-md border border-white/[0.04]">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-mono text-text-primary">{item.sku}</span>
                                          {variance <= 0 && (
                                            <CheckCircle className="w-3 h-3 text-accent-green flex-shrink-0" />
                                          )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1">
                                          <span className="text-[10px] text-text-secondary">Expected: <span className="text-text-primary">{item.expected}</span></span>
                                          <span className="text-[10px] text-text-secondary">Received: <span className="text-text-primary">{received}</span></span>
                                          <span className="text-[10px]">Variance: <span className={variance > 0 ? 'text-accent-red font-semibold' : 'text-accent-green font-semibold'}>{variance}</span></span>
                                        </div>
                                        {poPutawaySuggestions[item.sku] && (
                                          <div className="text-[10px] text-accent-sky mt-1 flex items-center gap-1">
                                            <ArrowRight className="w-3 h-3" />
                                            Putaway: {poPutawaySuggestions[item.sku]}
                                          </div>
                                        )}
                                      </div>
                                      {variance > 0 && (
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <input
                                            type="number"
                                            min={1}
                                            max={variance}
                                            value={currentInput}
                                            onChange={(e) => setPoReceiveInputs(prev => ({ ...prev, [inputKey]: parseInt(e.target.value) || 1 }))}
                                            className="w-14 bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                                          />
                                          <motion.button
                                            onClick={() => handlePOReceive(po, item.sku, Math.min(currentInput, variance))}
                                            whileTap={{ scale: 0.98 }}
                                            className="px-3 py-1.5 bg-accent-sky/20 text-accent-sky text-[10px] font-semibold rounded-md hover:bg-accent-sky/30 transition-colors border border-accent-sky/30"
                                          >
                                            Receive
                                          </motion.button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}

              <AnimatePresence>
                {message && activeTab === 'po' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`mt-4 p-3 rounded-md text-xs ${message.type === 'success' ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green' : message.type === 'warning' ? 'bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow' : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'}`}>
                    {message.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Recent Receipts</h3>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {recentInbound.length === 0 ? (
              <p className="text-xs text-text-secondary text-center py-4">No receipts yet</p>
            ) : (
              recentInbound.map((item) => (
                <div key={item.id} className="p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-medium text-text-primary truncate">{item.sku}</span>
                    <span className="text-[10px] text-accent-sky font-semibold">+{item.qty}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-text-secondary font-mono">{item.bin}</span>
                    <span className="text-[10px] text-text-secondary">{new Date(item.receivedAt).toLocaleTimeString()}</span>
                  </div>
                  {item.lotNumber && <div className="text-[10px] text-accent-yellow font-mono mt-1">Lot: {item.lotNumber}</div>}
                  {item.crossDockOrderId && <div className="text-[10px] text-accent-sky mt-1 flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Cross-dock: {item.crossDockOrderId}</div>}
                  <div className="flex items-center gap-1 mt-1">
                    {item.qcStatus === 'passed' ? <ShieldCheck className="w-3 h-3 text-accent-green" /> : item.qcStatus === 'failed' ? <AlertTriangle className="w-3 h-3 text-accent-red" /> : <span className="w-3 h-3 rounded-full bg-accent-yellow/50" />}
                    <span className={`text-[9px] ${item.qcStatus === 'passed' ? 'text-accent-green' : item.qcStatus === 'failed' ? 'text-accent-red' : 'text-accent-yellow'}`}>QC: {item.qcStatus}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* G-Sheets Link Rack */}
      <div className="mt-6 glass-panel rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sheet className="w-5 h-5 text-accent-green" />
          <h2 className="text-sm font-semibold text-text-primary">G-Sheets Link Rack</h2>
          <span className="text-[10px] text-text-secondary ml-2">Store client Google Sheet links for quick access</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Client Name</label>
            <input
              type="text"
              value={gSheetClient}
              onChange={(e) => setGSheetClient(e.target.value)}
              placeholder="e.g. ACME Corp"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md text-text-primary text-sm py-2 px-3 focus:outline-none focus:border-accent-green transition-colors"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1.5">Google Sheet URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={gSheetUrl}
                onChange={(e) => setGSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-md text-text-primary text-sm py-2 px-3 focus:outline-none focus:border-accent-green transition-colors"
              />
              <button
                onClick={handleAddGSheet}
                className="px-4 py-2 bg-accent-green text-void font-semibold text-xs rounded-md hover:bg-accent-green/90 transition-colors active:translate-y-[1px]"
              >
                Add Link
              </button>
            </div>
          </div>
        </div>
        {gSheetMsg && (
          <div className={`mb-4 p-2.5 rounded-md text-xs ${gSheetMsg.includes('success') ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green' : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'}`}>
            {gSheetMsg}
          </div>
        )}
        <div className="space-y-2">
          {gSheetLinks.length === 0 ? (
            <p className="text-xs text-text-secondary text-center py-4">No Google Sheet links stored yet</p>
          ) : (
            gSheetLinks.map((link, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-md hover:border-white/[0.12] transition-colors">
                <div className="w-8 h-8 rounded-md bg-accent-green/20 flex items-center justify-center flex-shrink-0">
                  <Sheet className="w-4 h-4 text-accent-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{link.clientName}</p>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-accent-sky hover:underline truncate block"
                  >
                    {link.url}
                  </a>
                </div>
                <span className="text-[10px] text-text-secondary flex-shrink-0">{new Date(link.addedAt).toLocaleDateString()}</span>
                <button
                  onClick={() => handleRemoveGSheet(idx)}
                  className="px-2 py-1 text-[10px] text-accent-red hover:bg-accent-red/10 rounded-md transition-colors flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
