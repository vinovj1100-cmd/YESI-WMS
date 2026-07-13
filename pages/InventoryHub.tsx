import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction, logInventoryMovement } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { AlertTriangle, Search, Package, MapPin, Barcode, Hash, DollarSign, Timer, Calendar, TrendingUp, Plus, X, History, Tag, Box, Ruler, ScanLine, Truck } from 'lucide-react';
import BarcodeReader from '@/components/BarcodeReader';
import type { InventoryItem, InventoryMovement, InboundRecord } from '@/lib/db';

const ZONES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3', 'D1', 'D2', 'E1'];

const VELOCITY_COLORS: Record<string, string> = {
  high: 'text-accent-sky',
  medium: 'text-accent-yellow',
  low: 'text-text-secondary',
};

function getABCClass(item: InventoryItem): 'A' | 'B' | 'C' {
  const value = (item.costPerUnit || 0) * (item.stock || 0);
  if (value >= 5000) return 'A';
  if (value >= 1000) return 'B';
  return 'C';
}

function getABCColor(cls: 'A' | 'B' | 'C'): string {
  return cls === 'A' ? 'text-accent-sky' : cls === 'B' ? 'text-accent-yellow' : 'text-text-secondary';
}

function daysUntilExpiry(expiryDate?: string): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function InventoryHub() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStock, setEditStock] = useState('');
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterVelocity, setFilterVelocity] = useState<string | null>(null);
  const [filterABC, setFilterABC] = useState<'A' | 'B' | 'C' | null>(null);
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'traceability' | 'expiry'>('all');
  const [showScanner, setShowScanner] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [lotInboundRecords, setLotInboundRecords] = useState<InboundRecord[]>([]);

  const loadInventory = useCallback(async () => {
    const items = await db.inventory.toArray();
    setInventory(items);
  }, []);

  const loadMovements = useCallback(async () => {
    const movs = await db.inventoryMovements.reverse().limit(100).toArray();
    setMovements(movs);
  }, []);

  useEffect(() => {
    loadInventory();
    loadMovements();
  }, [loadInventory, loadMovements]);

  const categories = useMemo(() => [...new Set(inventory.map(i => i.category).filter((c): c is string => !!c))], [inventory]);

  const filteredInventory = useMemo(() => inventory.filter(item => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = item.sku.toLowerCase().includes(term) ||
      item.product.toLowerCase().includes(term) ||
      item.location.toLowerCase().includes(term) ||
      (item.category?.toLowerCase() || '').includes(term) ||
      (item.barcode?.toLowerCase() || '').includes(term) ||
      (item.rfidTag?.toLowerCase() || '').includes(term) ||
      (item.lotNumber?.toLowerCase() || '').includes(term) ||
      (item.batchNumber?.toLowerCase() || '').includes(term);
    const matchesCategory = !filterCategory || item.category === filterCategory;
    const matchesVelocity = !filterVelocity || item.velocity === filterVelocity;
    const matchesABC = !filterABC || getABCClass(item) === filterABC;
    return matchesSearch && matchesCategory && matchesVelocity && matchesABC;
  }), [inventory, searchTerm, filterCategory, filterVelocity, filterABC]);

  // Summary calculations
  const totalValue = useMemo(() => inventory.reduce((sum, i) => sum + (i.costPerUnit || 0) * (i.stock || 0), 0), [inventory]);
  const totalSkus = inventory.length;
  const totalUnits = useMemo(() => inventory.reduce((sum, i) => sum + (i.stock || 0), 0), [inventory]);
  const avgUnitCost = totalUnits > 0 ? totalValue / totalUnits : 0;

  const expiryStats = useMemo(() => {
    const expired = inventory.filter(i => {
      const days = daysUntilExpiry(i.expiryDate);
      return days !== null && days < 0;
    }).length;
    const within7 = inventory.filter(i => {
      const days = daysUntilExpiry(i.expiryDate);
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const within30 = inventory.filter(i => {
      const days = daysUntilExpiry(i.expiryDate);
      return days !== null && days > 7 && days <= 30;
    }).length;
    return { expired, within7, within30 };
  }, [inventory]);

  const abcDistribution = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0 };
    inventory.forEach(i => { counts[getABCClass(i)]++; });
    return counts;
  }, [inventory]);

  const isLowStock = (item: InventoryItem) => {
    const threshold = item.reorderPoint ?? 10;
    return (item.stock || 0) <= threshold;
  };

  const lowStockCount = inventory.filter(isLowStock).length;

  const handleStockUpdate = async (id: number) => {
    const newStock = parseInt(editStock);
    if (isNaN(newStock) || newStock < 0) return;
    await db.inventory.update(id, { stock: newStock, updatedAt: new Date().toISOString() });
    setEditingId(null);
    loadInventory();
  };

  const handleAdjustment = async () => {
    if (!adjustItem || !adjustQty) return;
    const delta = parseInt(adjustQty);
    if (isNaN(delta)) return;
    const newStock = Math.max(0, (adjustItem.stock || 0) + delta);
    await db.inventory.update(adjustItem.id!, { stock: newStock, updatedAt: new Date().toISOString() });
    await logInventoryMovement(adjustItem.sku, 'adjustment', Math.abs(delta), user?.displayName || 'Unknown', {
      note: `${delta > 0 ? '+' : ''}${delta} | ${adjustReason || 'Manual adjustment'}`,
    });
    await logAction('INVENTORY_ADJUST', `Adjusted ${adjustItem.sku} by ${delta}: ${adjustReason}`, user?.displayName || 'Unknown');
    setAdjustItem(null);
    setAdjustQty('');
    setAdjustReason('');
    loadInventory();
    loadMovements();
  };

  const getLocationZone = (location: string) => location.split('-')[0] || location;
  const getItemsInZone = (zone: string) => inventory.filter(item => getLocationZone(item.location).startsWith(zone));

  const itemMovements = (sku: string) => movements.filter(m => m.sku === sku).slice(0, 20);

  const onBarcodeScan = useCallback((code: string) => {
    const term = code.trim().toLowerCase();
    if (!term) {
      setScanMessage('Empty scan code');
      return;
    }
    const matches = inventory.filter(i =>
      (i.barcode?.toLowerCase() || '').includes(term) ||
      (i.rfidTag?.toLowerCase() || '').includes(term) ||
      i.sku.toLowerCase().includes(term) ||
      i.product.toLowerCase().includes(term)
    );
    if (matches.length === 1) {
      setSearchTerm(matches[0].sku);
      setDetailItem(matches[0]);
      setScanMessage(`Found: ${matches[0].sku}`);
    } else if (matches.length > 1) {
      setSearchTerm(code);
      setScanMessage(`${matches.length} matches found`);
    } else {
      setSearchTerm(code);
      setScanMessage('No match found');
    }
    setShowScanner(false);
    setTimeout(() => setScanMessage(null), 3000);
  }, [inventory]);

  const loadInboundForLot = useCallback(async (lotNumber?: string) => {
    if (!lotNumber) {
      setLotInboundRecords([]);
      return;
    }
    const records = await db.inbound.filter(r => r.lotNumber === lotNumber).toArray();
    setLotInboundRecords(records);
  }, []);

  useEffect(() => {
    if (detailItem) {
      loadInboundForLot(detailItem.lotNumber);
    } else {
      setLotInboundRecords([]);
    }
  }, [detailItem, loadInboundForLot]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Inventory Hub</h1>
        <p className="text-sm text-text-secondary mt-1">Real-time inventory with traceability, barcoding & FEFO</p>
      </div>

      {/* Value Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-accent-green" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Total Value</span>
          </div>
          <p className="text-lg font-bold text-text-primary">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-3.5 h-3.5 text-accent-sky" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Total SKUs</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{totalSkus}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Box className="w-3.5 h-3.5 text-accent-yellow" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Total Units</span>
          </div>
          <p className="text-lg font-bold text-text-primary">{totalUnits.toLocaleString()}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-text-secondary" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Avg Unit Cost</span>
          </div>
          <p className="text-lg font-bold text-text-primary">${avgUnitCost.toFixed(2)}</p>
        </motion.div>
      </div>

      {/* Expiry Alert Banner */}
      {(expiryStats.expired > 0 || expiryStats.within7 > 0 || expiryStats.within30 > 0) && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 glass-panel rounded-lg">
          <div className="flex items-center gap-4 flex-wrap">
            {expiryStats.expired > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-accent-red" />
                <span className="text-xs text-accent-red font-semibold">{expiryStats.expired} EXPIRED</span>
              </div>
            )}
            {expiryStats.within7 > 0 && (
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-accent-yellow" />
                <span className="text-xs text-accent-yellow font-semibold">{expiryStats.within7} expiring &le;7 days</span>
              </div>
            )}
            {expiryStats.within30 > 0 && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent-sky" />
                <span className="text-xs text-accent-sky font-semibold">{expiryStats.within30} expiring &le;30 days</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Low Stock Banner */}
      {lowStockCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-md flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-accent-red flex-shrink-0" />
          <p className="text-xs text-accent-red"><strong>ACTION REQUIRED:</strong> {lowStockCount} SKU(s) at or below reorder point</p>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'traceability', 'expiry'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === tab ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30' : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'}`}>
            {tab === 'all' ? 'All Inventory' : tab === 'traceability' ? 'Traceability' : 'Expiry Tracking'}
          </button>
        ))}
      </div>

      {/* Scanner Panel */}
      <AnimatePresence>
        {showScanner && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden">
            <div className="glass-panel rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">Barcode / RFID Scanner</span>
                <button onClick={() => setShowScanner(false)} className="p-1 text-text-secondary hover:text-text-primary transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <BarcodeReader onScan={onBarcodeScan} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {scanMessage && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 p-2 glass-panel rounded-md flex items-center gap-2">
          <Barcode className="w-3.5 h-3.5 text-accent-sky" />
          <span className="text-xs text-text-primary">{scanMessage}</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Zone Map + Filters */}
        <div className="lg:col-span-2 glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Zone Map</h3>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {ZONES.map(zone => {
              const items = getItemsInZone(zone);
              const totalStock = items.reduce((s, i) => s + (i.stock || 0), 0);
              const hasLow = items.some(i => isLowStock(i));
              const isHovered = hoveredLocation === zone;
              return (
                <motion.div key={zone} whileHover={{ scale: 1.05 }}
                  className={`aspect-square rounded-md border flex flex-col items-center justify-center cursor-pointer transition-all ${
                    isHovered ? 'bg-accent-sky/20 border-accent-sky/40' : hasLow ? 'bg-accent-red/5 border-accent-red/20' : items.length > 0 ? 'bg-white/[0.03] border-white/[0.08]' : 'bg-transparent border-white/[0.04]'
                  }`}
                  onMouseEnter={() => setHoveredLocation(zone)} onMouseLeave={() => setHoveredLocation(null)}>
                  <span className="text-[10px] text-text-secondary font-mono">{zone}</span>
                  <span className={`text-sm font-bold ${hasLow ? 'text-accent-red' : 'text-text-primary'}`}>{totalStock}</span>
                  <span className="text-[9px] text-text-secondary">{items.length} SKUs</span>
                </motion.div>
              );
            })}
          </div>

          {/* ABC Distribution */}
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">ABC Classification</p>
            <div className="flex gap-2 mb-2">
              {(['A', 'B', 'C'] as const).map(cls => (
                <button key={cls} onClick={() => setFilterABC(filterABC === cls ? null : cls)}
                  className={`flex-1 py-1.5 text-[10px] rounded-md border transition-all font-semibold ${filterABC === cls ? 'bg-accent-sky/20 text-accent-sky border-accent-sky/30' : 'bg-white/[0.02] text-text-secondary border-white/[0.06]'}`}>
                  {cls} ({abcDistribution[cls]})
                </button>
              ))}
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.03]">
              <div className="bg-accent-sky h-full" style={{ width: `${totalSkus ? (abcDistribution.A / totalSkus) * 100 : 0}%` }} />
              <div className="bg-accent-yellow h-full" style={{ width: `${totalSkus ? (abcDistribution.B / totalSkus) * 100 : 0}%` }} />
              <div className="bg-white/20 h-full" style={{ width: `${totalSkus ? (abcDistribution.C / totalSkus) * 100 : 0}%` }} />
            </div>
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Filter by Category</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setFilterCategory(null)} className={`text-[10px] px-2 py-1 rounded-md transition-all ${!filterCategory ? 'bg-accent-sky/20 text-accent-sky' : 'bg-white/[0.03] text-text-secondary'}`}>All</button>
                {categories.map((cat: string) => (
                  <button key={cat} onClick={() => setFilterCategory(cat === filterCategory ? null : cat)} className={`text-[10px] px-2 py-1 rounded-md transition-all ${filterCategory === cat ? 'bg-accent-sky/20 text-accent-sky' : 'bg-white/[0.03] text-text-secondary'}`}>{cat}</button>
                ))}
              </div>
            </div>
          )}

          {/* Velocity Filter */}
          <div className="mt-3">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Filter by Velocity</p>
            <div className="flex gap-1.5">
              {(['high', 'medium', 'low'] as const).map(v => (
                <button key={v} onClick={() => setFilterVelocity(filterVelocity === v ? null : v)} className={`text-[10px] px-2 py-1 rounded-md transition-all capitalize ${filterVelocity === v ? 'bg-accent-sky/20 text-accent-sky' : 'bg-white/[0.03] text-text-secondary'}`}>{v}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Master Stock Table / Traceability / Expiry */}
        <div className="lg:col-span-3 glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-accent-sky" />
              <h3 className="text-sm font-semibold text-text-primary">
                {activeTab === 'all' ? 'Master Stock List' : activeTab === 'traceability' ? 'Traceability & Lots' : 'Expiry Tracking'}
              </h3>
              <span className="text-[10px] text-text-secondary">{filteredInventory.length} items</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowScanner(s => !s)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-accent-sky/10 text-accent-sky border border-accent-sky/20 hover:bg-accent-sky/20 transition-all"
              >
                <ScanLine className="w-3.5 h-3.5" />
                Scan Barcode
              </button>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search SKU, barcode, lot, RFID..."
                  className="bg-white/[0.03] border border-white/[0.08] rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-sky transition-colors w-56" />
              </div>
            </div>
          </div>

          {activeTab === 'all' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                    <th className="text-left py-2 px-2">SKU</th>
                    <th className="text-left py-2 px-2">Product</th>
                    <th className="text-center py-2 px-2">Stock</th>
                    <th className="text-center py-2 px-2">ABC</th>
                    <th className="text-center py-2 px-2">Location</th>
                    <th className="text-center py-2 px-2">Velocity</th>
                    <th className="text-center py-2 px-2">Value</th>
                    <th className="text-center py-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item) => {
                    const low = isLowStock(item);
                    const abc = getABCClass(item);
                    const itemValue = (item.costPerUnit || 0) * (item.stock || 0);
                    return (
                      <tr key={item.id} className={`border-b border-white/[0.04] transition-colors ${low ? 'animate-pulse-red' : 'hover:bg-white/[0.02]'}`}>
                        <td className="py-2 px-2 text-xs font-mono text-text-primary">
                          <div>{item.sku}</div>
                          {item.barcode && <div className="text-[9px] text-text-secondary flex items-center gap-0.5"><Barcode className="w-2.5 h-2.5" />{item.barcode}</div>}
                        </td>
                        <td className="py-2 px-2 text-xs text-text-primary max-w-[120px] truncate">
                          <div>{item.product}</div>
                          {item.category && <div className="text-[9px] text-text-secondary">{item.category}</div>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {editingId === item.id ? (
                            <input type="number" value={editStock} onChange={(e) => setEditStock(e.target.value)} onBlur={() => handleStockUpdate(item.id!)} onKeyDown={(e) => e.key === 'Enter' && handleStockUpdate(item.id!)}
                              className="w-14 bg-transparent border-b border-accent-sky text-center text-xs text-text-primary font-mono focus:outline-none" autoFocus />
                          ) : (
                            <button onClick={() => { setEditingId(item.id!); setEditStock(String(item.stock || 0)); }} className={`text-xs font-mono font-semibold ${low ? 'text-accent-red' : 'text-text-primary'}`}>{item.stock}</button>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-[10px] font-bold ${getABCColor(abc)}`}>{abc}</span>
                        </td>
                        <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{item.location}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-[9px] font-semibold capitalize ${VELOCITY_COLORS[item.velocity || 'low']}`}>{item.velocity || 'low'}</span>
                        </td>
                        <td className="py-2 px-2 text-center text-[10px] font-mono text-accent-green">${itemValue.toLocaleString()}</td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setDetailItem(item)} className="p-1 text-text-secondary hover:text-accent-sky transition-colors" title="Traceability"><History className="w-3 h-3" /></button>
                            <button onClick={() => setAdjustItem(item)} className="p-1 text-text-secondary hover:text-accent-yellow transition-colors" title="Adjust"><Plus className="w-3 h-3" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'traceability' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                    <th className="text-left py-2 px-2">SKU</th>
                    <th className="text-left py-2 px-2">Lot/Batch</th>
                    <th className="text-center py-2 px-2">Barcode</th>
                    <th className="text-center py-2 px-2">RFID</th>
                    <th className="text-center py-2 px-2">Dims (cm)</th>
                    <th className="text-center py-2 px-2">Weight</th>
                    <th className="text-center py-2 px-2">FEFO</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.filter(i => i.lotNumber || i.batchNumber || i.barcode || i.rfidTag).map((item) => (
                    <tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 px-2 text-xs font-mono text-text-primary">{item.sku}</td>
                      <td className="py-2 px-2 text-xs">
                        {item.lotNumber && <div className="text-accent-yellow text-[10px] font-mono">Lot: {item.lotNumber}</div>}
                        {item.batchNumber && <div className="text-accent-sky text-[10px] font-mono">Batch: {item.batchNumber}</div>}
                      </td>
                      <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{item.barcode || '-'}</td>
                      <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{item.rfidTag || '-'}</td>
                      <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">
                        {item.length && item.width && item.height ? `${item.length}×${item.width}×${item.height}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{item.weight ? `${item.weight}kg` : '-'}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`text-[10px] font-bold ${(item.fefoPriority || 0) > 3 ? 'text-accent-red' : 'text-text-secondary'}`}>{item.fefoPriority || '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInventory.filter(i => i.lotNumber || i.batchNumber || i.barcode || i.rfidTag).length === 0 && (
                <p className="text-xs text-text-secondary text-center py-8">No traceable items found</p>
              )}
            </div>
          )}

          {activeTab === 'expiry' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                    <th className="text-left py-2 px-2">SKU</th>
                    <th className="text-left py-2 px-2">Product</th>
                    <th className="text-center py-2 px-2">Lot</th>
                    <th className="text-center py-2 px-2">Mfg Date</th>
                    <th className="text-center py-2 px-2">Expiry</th>
                    <th className="text-center py-2 px-2">Days Left</th>
                    <th className="text-center py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.filter(i => i.expiryDate).sort((a, b) => {
                    const da = daysUntilExpiry(a.expiryDate) ?? 999;
                    const db = daysUntilExpiry(b.expiryDate) ?? 999;
                    return da - db;
                  }).map((item) => {
                    const days = daysUntilExpiry(item.expiryDate);
                    const isExpired = days !== null && days < 0;
                    const isCritical = days !== null && days >= 0 && days <= 7;
                    const isWarning = days !== null && days > 7 && days <= 30;
                    return (
                      <tr key={item.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${isExpired ? 'bg-accent-red/5' : isCritical ? 'bg-accent-yellow/5' : ''}`}>
                        <td className="py-2 px-2 text-xs font-mono text-text-primary">{item.sku}</td>
                        <td className="py-2 px-2 text-xs text-text-primary max-w-[120px] truncate">{item.product}</td>
                        <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{item.lotNumber || '-'}</td>
                        <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{item.manufacturingDate || '-'}</td>
                        <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{item.expiryDate}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-xs font-bold font-mono ${isExpired ? 'text-accent-red' : isCritical ? 'text-accent-yellow' : isWarning ? 'text-accent-sky' : 'text-accent-green'}`}>
                            {days === null ? '-' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${isExpired ? 'bg-accent-red/20 text-accent-red' : isCritical ? 'bg-accent-yellow/20 text-accent-yellow' : isWarning ? 'bg-accent-sky/20 text-accent-sky' : 'bg-accent-green/20 text-accent-green'}`}>
                            {isExpired ? 'EXPIRED' : isCritical ? 'CRITICAL' : isWarning ? 'WARNING' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredInventory.filter(i => i.expiryDate).length === 0 && (
                <p className="text-xs text-text-secondary text-center py-8">No expiry-tracked items</p>
              )}
            </div>
          )}

          {filteredInventory.length === 0 && activeTab === 'all' && (
            <p className="text-xs text-text-secondary text-center py-8">No items found</p>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {detailItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setDetailItem(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-text-primary">{detailItem.sku}</h3>
                  <p className="text-sm text-text-secondary">{detailItem.product}</p>
                </div>
                <button onClick={() => setDetailItem(null)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/[0.02] rounded-md p-3">
                  <p className="text-[10px] text-text-secondary uppercase tracking-widest">Stock</p>
                  <p className="text-lg font-bold text-text-primary">{detailItem.stock}</p>
                </div>
                <div className="bg-white/[0.02] rounded-md p-3">
                  <p className="text-[10px] text-text-secondary uppercase tracking-widest">Location</p>
                  <p className="text-lg font-bold text-text-primary font-mono">{detailItem.location}</p>
                </div>
                <div className="bg-white/[0.02] rounded-md p-3">
                  <p className="text-[10px] text-text-secondary uppercase tracking-widest">Value</p>
                  <p className="text-lg font-bold text-accent-green">${((detailItem.costPerUnit || 0) * (detailItem.stock || 0)).toLocaleString()}</p>
                </div>
                <div className="bg-white/[0.02] rounded-md p-3">
                  <p className="text-[10px] text-text-secondary uppercase tracking-widest">ABC Class</p>
                  <p className={`text-lg font-bold ${getABCColor(getABCClass(detailItem))}`}>{getABCClass(detailItem)}</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-[10px] text-text-secondary uppercase tracking-widest">Traceability</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="flex items-center gap-1"><Barcode className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">Barcode:</span> <span className="text-text-primary font-mono">{detailItem.barcode || '-'}</span></div>
                  <div className="flex items-center gap-1"><Tag className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">RFID:</span> <span className="text-text-primary font-mono">{detailItem.rfidTag || '-'}</span></div>
                  <div className="flex items-center gap-1"><Hash className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">Lot:</span> <span className="text-text-primary font-mono">{detailItem.lotNumber || '-'}</span></div>
                  <div className="flex items-center gap-1"><Hash className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">Batch:</span> <span className="text-text-primary font-mono">{detailItem.batchNumber || '-'}</span></div>
                  <div className="flex items-center gap-1"><Ruler className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">Dims:</span> <span className="text-text-primary font-mono">{detailItem.length && detailItem.width && detailItem.height ? `${detailItem.length}×${detailItem.width}×${detailItem.height}cm` : '-'}</span></div>
                  <div className="flex items-center gap-1"><Box className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">Weight:</span> <span className="text-text-primary font-mono">{detailItem.weight ? `${detailItem.weight}kg` : '-'}</span></div>
                  <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">Mfg:</span> <span className="text-text-primary font-mono">{detailItem.manufacturingDate || '-'}</span></div>
                  <div className="flex items-center gap-1"><Timer className="w-3 h-3 text-text-secondary" /><span className="text-text-secondary">Expiry:</span> <span className="text-text-primary font-mono">{detailItem.expiryDate || '-'}</span></div>
                </div>
              </div>

              {/* Lot Traceability Drill-down */}
              {detailItem.lotNumber && (
                <div className="mb-4">
                  <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    Lot Receipt History — {detailItem.lotNumber}
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {lotInboundRecords.length === 0 ? (
                      <p className="text-xs text-text-secondary py-2">No inbound receipts found for this lot</p>
                    ) : (
                      lotInboundRecords.map((rec, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] p-2 bg-white/[0.02] rounded-md">
                          <span className={`font-semibold capitalize ${rec.qcStatus === 'passed' ? 'text-accent-green' : rec.qcStatus === 'failed' ? 'text-accent-red' : 'text-accent-yellow'}`}>{rec.qcStatus}</span>
                          <span className="text-text-primary font-mono">{rec.qty > 0 ? '+' : ''}{rec.qty}</span>
                          <span className="text-text-secondary">{rec.supplier || '—'}</span>
                          {rec.poNumber && <span className="text-accent-sky font-mono">PO:{rec.poNumber}</span>}
                          <span className="text-text-secondary ml-auto">{new Date(rec.receivedAt).toLocaleDateString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Recent Movements</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {itemMovements(detailItem.sku).length === 0 ? (
                    <p className="text-xs text-text-secondary">No movement history</p>
                  ) : (
                    itemMovements(detailItem.sku).map((mov, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px] p-2 bg-white/[0.02] rounded-md">
                        <span className={`font-semibold capitalize ${mov.type === 'inbound' ? 'text-accent-green' : mov.type === 'outbound' ? 'text-accent-sky' : 'text-text-secondary'}`}>{mov.type}</span>
                        <span className="text-text-primary font-mono">{mov.quantity > 0 ? '+' : ''}{mov.quantity}</span>
                        <span className="text-text-secondary">{mov.operator}</span>
                        <span className="text-text-secondary ml-auto">{new Date(mov.timestamp).toLocaleDateString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Adjust Modal */}
      <AnimatePresence>
        {adjustItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setAdjustItem(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass-panel rounded-lg p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-text-primary">Adjust Stock</h3>
                <button onClick={() => setAdjustItem(null)} className="p-1 text-text-secondary hover:text-text-primary"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-xs text-text-secondary mb-4">{adjustItem.sku} — Current: <span className="text-text-primary font-bold">{adjustItem.stock}</span></p>
              <div className="mb-3">
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Adjustment (+/-)</label>
                <input type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky" placeholder="+5 or -3" />
              </div>
              <div className="mb-4">
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Reason</label>
                <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-sky" placeholder="Damage, found, etc." />
              </div>
              <button onClick={handleAdjustment} className="w-full py-2.5 bg-accent-sky text-void font-semibold text-sm rounded-md hover:bg-accent-sky/90 transition-colors">Apply Adjustment</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
