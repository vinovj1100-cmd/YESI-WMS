import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import BarcodeReader from '@/components/BarcodeReader';
import {
  Fingerprint, Search, MapPin, Smartphone, X,
} from 'lucide-react';
import type { SerialNumber } from '@/lib/db';

const statusConfig: Record<string, { color: string; label: string }> = {
  in_stock: { color: 'text-accent-green', label: 'In Stock' },
  reserved: { color: 'text-accent-sky', label: 'Reserved' },
  shipped: { color: 'text-white/60', label: 'Shipped' },
  returned: { color: 'text-accent-yellow', label: 'Returned' },
  defective: { color: 'text-accent-red', label: 'Defective' },
  quarantine: { color: 'text-accent-red', label: 'Quarantine' },
};

export default function SerialTracking() {
  const { user } = useAuth();
  const [serials, setSerials] = useState<SerialNumber[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<SerialNumber | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSerials = useCallback(async () => {
    const all = await db.serialNumbers.toArray();
    setSerials(all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  }, []);

  useEffect(() => { loadSerials(); }, [loadSerials]);

  const filtered = serials.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.serialNumber.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q) ||
        s.imei1?.toLowerCase().includes(q) || s.product.toLowerCase().includes(q);
    }
    return true;
  });

  const stats = {
    inStock: serials.filter(s => s.status === 'in_stock').length,
    reserved: serials.filter(s => s.status === 'reserved').length,
    shipped: serials.filter(s => s.status === 'shipped').length,
    quarantine: serials.filter(s => s.status === 'quarantine' || s.status === 'defective').length,
  };

  const handleScan = async (code: string) => {
    const sn = serials.find(s => s.serialNumber === code || s.imei1 === code);
    if (sn) {
      setSelected(sn);
      setMessage({ type: 'success', text: `Found: ${sn.serialNumber}` });
    } else {
      const fromDb = await db.serialNumbers.where('serialNumber').equals(code).first()
        || await db.serialNumbers.filter(s => s.imei1 === code).first();
      if (fromDb) {
        setSelected(fromDb);
        setMessage({ type: 'success', text: `Found: ${fromDb.serialNumber}` });
      } else {
        setMessage({ type: 'error', text: `No serial/IMEI match for ${code}` });
      }
    }
  };

  const updateStatus = async (sn: SerialNumber, newStatus: SerialNumber['status']) => {
    await db.serialNumbers.update(sn.id!, { status: newStatus, updatedAt: new Date().toISOString() });
    await logAction('SERIAL_STATUS', `${sn.serialNumber}: ${sn.status} → ${newStatus}`, user?.displayName || 'system');
    setMessage({ type: 'success', text: `Updated ${sn.serialNumber} to ${newStatus}` });
    setSelected(null);
    loadSerials();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Fingerprint className="w-6 h-6 text-accent-sky" />
          Serial & IMEI Tracking
        </h1>
        <p className="text-sm text-text-secondary mt-1">Full traceability chain for serialized high-value items</p>
      </div>

      {message && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`px-4 py-3 rounded-xl text-sm border ${message.type === 'success' ? 'bg-accent-green/10 border-accent-green/20 text-accent-green' : 'bg-accent-red/10 border-accent-red/20 text-accent-red'}`}
          onClick={() => setMessage(null)}>{message.text}</motion.div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'In Stock', value: stats.inStock, color: 'text-accent-green' },
          { label: 'Reserved', value: stats.reserved, color: 'text-accent-sky' },
          { label: 'Shipped', value: stats.shipped, color: 'text-white/60' },
          { label: 'Quarantine', value: stats.quarantine, color: 'text-accent-red' },
        ].map((s) => (
          <div key={s.label} className="glass-panel rounded-xl p-4">
            <p className="text-xs text-text-secondary uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-xl p-4">
        <p className="text-xs text-text-secondary uppercase tracking-wider mb-3">Scan Serial / IMEI</p>
        <BarcodeReader onScan={handleScan} placeholder="Scan or type serial number / IMEI..." />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search serial, IMEI, SKU..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-text-secondary outline-none focus:border-accent-sky/30" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {['all', 'in_stock', 'reserved', 'shipped', 'quarantine'].map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize ${statusFilter === f ? 'bg-accent-sky/15 text-accent-sky' : 'text-text-secondary hover:bg-white/[0.04]'}`}>
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((sn) => {
          const cfg = statusConfig[sn.status] || statusConfig.in_stock;
          return (
            <motion.div key={sn.id} layout className="glass-panel rounded-xl p-4 cursor-pointer hover:border-accent-sky/10 transition-colors"
              onClick={() => setSelected(sn)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-accent-sky" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{sn.serialNumber}</p>
                    <p className="text-xs text-text-secondary">{sn.sku} — {sn.product}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  {sn.imei1 && <span className="text-xs text-white/40 font-mono hidden sm:block">{sn.imei1}</span>}
                  <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-xs text-text-secondary flex items-center gap-1"><MapPin className="w-3 h-3" />{sn.location}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelected(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="glass-panel rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{selected.serialNumber}</h3>
                <button onClick={() => setSelected(null)} className="text-text-secondary hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-3 text-sm">
                {[
                  ['Product', selected.product],
                  ['SKU', selected.sku],
                  ['Status', selected.status],
                  ['Location', selected.location],
                  ['IMEI 1', selected.imei1 || 'N/A'],
                  ['IMEI 2', selected.imei2 || 'N/A'],
                  ['TAC Prefix', selected.tacPrefix || 'N/A'],
                  ['Lot', selected.lotNumber || 'N/A'],
                  ['Order', selected.orderId || 'Unassigned'],
                  ['Color / Storage', `${selected.color || '—'} / ${selected.storage || '—'}`],
                  ['Warranty', selected.warrantyEnd ? `Until ${new Date(selected.warrantyEnd).toLocaleDateString()}` : 'N/A'],
                  ['Received', selected.receivedAt ? new Date(selected.receivedAt).toLocaleString() : 'N/A'],
                  ['Shipped', selected.shippedAt ? new Date(selected.shippedAt).toLocaleString() : 'N/A'],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between py-1.5 border-b border-white/[0.04]">
                    <span className="text-text-secondary">{label}</span>
                    <span className="text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mt-6">
                {selected.status === 'in_stock' && (
                  <button onClick={() => updateStatus(selected, 'quarantine')} className="px-3 py-2 rounded-lg text-xs bg-accent-red/10 text-accent-red border border-accent-red/20">Quarantine</button>
                )}
                {selected.status === 'quarantine' && (
                  <button onClick={() => updateStatus(selected, 'in_stock')} className="px-3 py-2 rounded-lg text-xs bg-accent-green/10 text-accent-green border border-accent-green/20">Release to Stock</button>
                )}
                {selected.status === 'returned' && (
                  <button onClick={() => updateStatus(selected, 'in_stock')} className="px-3 py-2 rounded-lg text-xs bg-accent-green/10 text-accent-green border border-accent-green/20">Restock</button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}