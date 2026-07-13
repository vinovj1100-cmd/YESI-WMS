import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Html5Qrcode } from 'html5-qrcode';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import {
  ScanBarcode, Camera, Upload, Copy, Package, ClipboardList,
  Truck, Zap, X, ChevronDown, RotateCcw, History, BarChart3,
  CheckCircle, AlertCircle
} from 'lucide-react';
import type { InventoryItem, Order, AuditLog } from '@/lib/db';

export default function BarcodeScanner() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const addNotification = useAppStore((s) => s.addNotification);
  const operator = user?.displayName || user?.username || 'Unknown';

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileScannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isScanningRef = useRef(false);
  const lastScanRef = useRef('');
  const lastScanTimeRef = useRef(0);

  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lastResult, setLastResult] = useState('');
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [todayCount, setTodayCount] = useState(0);
  const [successRate, setSuccessRate] = useState(100);
  const [fileLoading, setFileLoading] = useState(false);
  const [inventoryResult, setInventoryResult] = useState<InventoryItem | null | undefined>(undefined);
  const [orderResult, setOrderResult] = useState<Order | null | undefined>(undefined);

  const playBeep = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 1200; o.type = 'sine'; g.gain.value = 0.1;
      o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 150);
    } catch { /* ignore */ }
  }, []);

  const loadHistory = useCallback(async () => {
    const logs = await db.auditLogs.reverse().toArray();
    const scans = logs.filter((l) => l.action === 'barcode_scan').slice(0, 20);
    setHistory(scans);
    const today = new Date().toISOString().slice(0, 10);
    setTodayCount(scans.filter((l) => l.timestamp?.startsWith(today)).length);
  }, []);

  const onScanSuccess = useCallback(async (decodedText: string) => {
    const now = Date.now();
    if (decodedText === lastScanRef.current && now - lastScanTimeRef.current < 2000) return;
    lastScanRef.current = decodedText; lastScanTimeRef.current = now;
    playBeep(); setLastResult(decodedText); setInventoryResult(undefined); setOrderResult(undefined);
    await logAction('barcode_scan', decodedText, operator);
    await loadHistory();
    addNotification({ title: 'Barcode Scanned', message: decodedText, type: 'success' });
  }, [operator, loadHistory, addNotification, playBeep]);

  const startScan = async () => {
    if (!scannerRef.current || isScanningRef.current) return;
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const cameraId = selectedCamera || { facingMode: 'environment' };
      await scannerRef.current.start(cameraId, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, () => {});
      isScanningRef.current = true; setScanning(true);
      addNotification({ title: 'Scanner Active', message: 'Camera scanning started.', type: 'success' });
    } catch (err) {
      addNotification({ title: 'Camera Error', message: String(err), type: 'error' });
    }
  };

  const stopScan = async () => {
    if (!scannerRef.current || !isScanningRef.current) return;
    try { await scannerRef.current.stop(); } catch { /* ignore */ }
    try { await scannerRef.current.clear(); } catch { /* ignore */ }
    isScanningRef.current = false; setScanning(false); setTorchOn(false);
  };

  const handleCameraChange = async (cameraId: string) => {
    setSelectedCamera(cameraId);
    if (isScanningRef.current) {
      await stopScan();
      addNotification({ title: 'Camera Changed', message: 'Press Start to begin scanning.', type: 'info' });
    }
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !isScanningRef.current) return;
    try {
      await scannerRef.current.applyVideoConstraints({ advanced: [{ torch: !torchOn }] } as any);
      setTorchOn((p) => !p);
    } catch {
      addNotification({ title: 'Torch', message: 'Flashlight not supported.', type: 'warning' });
    }
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fileScannerRef.current) return;
    setFileLoading(true);
    try {
      const result = await fileScannerRef.current.scanFile(file, false);
      setLastResult(result); playBeep();
      await logAction('barcode_scan', `File: ${result}`, operator);
      await loadHistory(); setInventoryResult(undefined); setOrderResult(undefined);
      addNotification({ title: 'File Scanned', message: result, type: 'success' });
    } catch {
      addNotification({ title: 'Scan Failed', message: 'Could not decode barcode from image.', type: 'error' });
      setSuccessRate((p) => Math.max(0, p - 10));
    } finally { setFileLoading(false); e.target.value = ''; }
  };

  const copyResult = async () => {
    try { await navigator.clipboard.writeText(lastResult); addNotification({ title: 'Copied', message: 'Barcode text copied.', type: 'success' }); }
    catch { addNotification({ title: 'Copy Failed', message: 'Could not copy text.', type: 'error' }); }
  };

  const searchInventory = async () => {
    const item = await db.inventory.where('sku').equals(lastResult).first();
    setInventoryResult(item || null);
    addNotification({ title: item ? 'Inventory Found' : 'Not Found', message: item ? `${item.product} — ${item.stock} in stock` : 'No inventory match.', type: item ? 'success' : 'warning' });
  };

  const searchOrders = async () => {
    const order = await db.orders.where('orderId').equals(lastResult).first();
    setOrderResult(order || null);
    addNotification({ title: order ? 'Order Found' : 'Not Found', message: order ? `${order.orderId} — ${order.status}` : 'No order match.', type: order ? 'success' : 'warning' });
  };

  const goToPosting = () => navigate('/posting-tracker', { state: { postingId: lastResult } });
  const resetResult = () => { setLastResult(''); setInventoryResult(undefined); setOrderResult(undefined); };

  useEffect(() => {
    scannerRef.current = new Html5Qrcode('reader', false);
    fileScannerRef.current = new Html5Qrcode('file-reader', false);
    Html5Qrcode.getCameras().then((devices) => { if (devices?.length) { setCameras(devices); setSelectedCamera(devices[0].id); } }).catch(() => addNotification({ title: 'Camera', message: 'Could not enumerate cameras.', type: 'warning' }));
    loadHistory();
    return () => { scannerRef.current?.stop().then(() => scannerRef.current?.clear()).catch(() => scannerRef.current?.clear()); fileScannerRef.current?.clear(); };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Barcode Scanner</h1>
        <p className="text-sm text-text-secondary mt-1">Scan barcodes and QR codes via camera or image upload</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3"><ScanBarcode className="w-5 h-5 text-accent-sky" /><h2 className="text-sm font-semibold text-text-primary">Camera Scanner</h2></div>
            <div className="relative w-full aspect-[4/3] bg-black/40 rounded-md overflow-hidden border border-white/[0.08]">
              <div id="reader" className="w-full h-full" />
              {!scanning && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40"><ScanBarcode className="w-8 h-8 text-text-secondary mb-2" /><p className="text-xs text-text-secondary">Camera inactive</p></div>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button onClick={scanning ? stopScan : startScan} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors ${scanning ? 'bg-accent-red/10 text-accent-red border-accent-red/20 hover:bg-accent-red/20' : 'bg-accent-green/10 text-accent-green border-accent-green/20 hover:bg-accent-green/20'}`}>{scanning ? <X className="w-4 h-4" /> : <Camera className="w-4 h-4" />}{scanning ? 'Stop' : 'Start'}</button>
              {cameras.length > 0 && <div className="relative"><select value={selectedCamera} onChange={(e) => handleCameraChange(e.target.value)} className="appearance-none bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 pr-7 text-xs text-text-primary focus:outline-none focus:border-accent-sky">{cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select><ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" /></div>}
              <button onClick={toggleTorch} disabled={!scanning} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors ${torchOn ? 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20' : 'bg-white/[0.03] text-text-secondary border-white/[0.08] hover:text-text-primary'} ${!scanning ? 'opacity-50 cursor-not-allowed' : ''}`}><Zap className="w-4 h-4" />{torchOn ? 'On' : 'Torch'}</button>
              <button onClick={resetResult} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-text-primary transition-colors ml-auto"><RotateCcw className="w-4 h-4" />Reset</button>
            </div>
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2"><Upload className="w-4 h-4 text-accent-sky" /><h3 className="text-xs font-semibold text-text-primary">File Upload</h3></div>
              <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileScan} />
              <button onClick={() => fileInputRef.current?.click()} disabled={fileLoading} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"><Upload className="w-4 h-4" />{fileLoading ? 'Scanning...' : 'Upload Image'}</button>
              <p className="text-[10px] text-text-secondary mt-1.5">Supports barcodes and QR codes from images</p>
            </div>
            <AnimatePresence>
              {lastResult && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-4 overflow-hidden">
                  <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-md">
                    <div className="flex items-center justify-between mb-2"><span className="text-[10px] text-text-secondary uppercase tracking-widest">Last Scan</span><span className="text-[10px] text-accent-green">{new Date().toLocaleTimeString()}</span></div>
                    <p className="text-sm font-mono text-text-primary break-all">{lastResult}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button onClick={copyResult} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-text-primary transition-colors"><Copy className="w-3.5 h-3.5" />Copy</button>
                      <button onClick={searchInventory} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-accent-green transition-colors"><Package className="w-3.5 h-3.5" />Inventory</button>
                      <button onClick={searchOrders} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-accent-sky transition-colors"><ClipboardList className="w-3.5 h-3.5" />Orders</button>
                      <button onClick={goToPosting} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold rounded border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-accent-yellow transition-colors"><Truck className="w-3.5 h-3.5" />Posting</button>
                    </div>
                    {inventoryResult !== undefined && <div className="mt-2 p-2 bg-white/[0.02] rounded border border-white/[0.06]">{inventoryResult ? <div className="flex items-center gap-2 text-xs"><CheckCircle className="w-3.5 h-3.5 text-accent-green" /><span className="text-text-primary"><span className="font-mono text-accent-green">{inventoryResult.sku}</span> — {inventoryResult.product} ({inventoryResult.stock} in stock)</span></div> : <div className="flex items-center gap-2 text-xs text-accent-red"><AlertCircle className="w-3.5 h-3.5" /><span>No inventory match</span></div>}</div>}
                    {orderResult !== undefined && <div className="mt-2 p-2 bg-white/[0.02] rounded border border-white/[0.06]">{orderResult ? <div className="flex items-center gap-2 text-xs"><CheckCircle className="w-3.5 h-3.5 text-accent-sky" /><span className="text-text-primary"><span className="font-mono text-accent-sky">{orderResult.orderId}</span> — {orderResult.status} ({orderResult.priority})</span></div> : <div className="flex items-center gap-2 text-xs text-accent-red"><AlertCircle className="w-3.5 h-3.5" /><span>No order match</span></div>}</div>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">Today Stats</h3></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white/[0.02] rounded-md border border-white/[0.06]"><p className="text-[10px] text-text-secondary uppercase tracking-widest mb-1">Scans</p><p className="text-2xl font-bold text-text-primary">{todayCount}</p></div>
              <div className="p-3 bg-white/[0.02] rounded-md border border-white/[0.06]"><p className="text-[10px] text-text-secondary uppercase tracking-widest mb-1">Success</p><p className="text-2xl font-bold text-accent-green">{successRate}%</p></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-lg p-4 max-h-[500px] overflow-y-auto">
            <div className="flex items-center gap-2 mb-3"><History className="w-4 h-4 text-accent-sky" /><h3 className="text-sm font-semibold text-text-primary">History</h3><span className="text-[10px] text-text-secondary ml-auto">{history.length} recent</span></div>
            <div className="space-y-2">
              <AnimatePresence>{history.map((log) => <motion.div key={log.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-md"><p className="text-xs font-mono text-text-primary break-all">{log.details}</p><div className="flex items-center gap-2 mt-1 text-[10px] text-text-secondary"><span>{log.operator}</span><span>•</span><span>{new Date(log.timestamp).toLocaleTimeString()}</span></div></motion.div>)}</AnimatePresence>
              {history.length === 0 && <p className="text-xs text-text-secondary text-center py-4">No scans yet</p>}
            </div>
          </motion.div>
        </div>
      </div>
      <div id="file-reader" style={{ display: 'none' }} />
    </div>
  );
}
