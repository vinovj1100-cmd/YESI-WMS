import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList,
  Plus,
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  MapPin,
  BarChart3,
  ArrowRightLeft,
  Filter,
  ChevronDown,
  ChevronUp,
  Save,
  RotateCcw,
  Hash,
  Package,
  User,
  Calendar,
  FileText,
} from 'lucide-react';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import BarcodeReader from '@/components/BarcodeReader';
import type { CycleCount, InventoryItem } from '@/lib/db';

type TabKey = 'list' | 'create' | 'by-location' | 'dashboard';
type StatusFilter = 'all' | 'pending' | 'completed' | 'rejected';

const ZONES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

const cardVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

const listItemVariant = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
};

export default function CycleCount() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>('list');
  const [counts, setCounts] = useState<CycleCount[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Create form state
  const [skuInput, setSkuInput] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [actualQty, setActualQty] = useState('');
  const [note, setNote] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  // Location count state
  const [selectedZone, setSelectedZone] = useState('A1');
  const [locGenerating, setLocGenerating] = useState(false);

  // Fetch data
  const refresh = useCallback(async () => {
    setLoading(true);
    const [c, inv] = await Promise.all([
      db.cycleCounts.toArray(),
      db.inventory.toArray(),
    ]);
    setCounts(c.sort((a, b) => +new Date(b.countedAt) - +new Date(a.countedAt)));
    setInventory(inv);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Derived stats
  const stats = useMemo(() => {
    const pending = counts.filter((c) => c.status === 'pending').length;
    const completed = counts.filter((c) => c.status === 'completed').length;
    const rejected = counts.filter((c) => c.status === 'rejected').length;
    const variances = counts.filter((c) => c.variance !== 0).length;
    const totalVariance = counts.reduce((sum, c) => sum + Math.abs(c.variance), 0);
    return { pending, completed, rejected, variances, totalVariance };
  }, [counts]);

  // Filtered list
  const filteredCounts = useMemo(() => {
    let list = counts;
    if (statusFilter !== 'all') {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.sku.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q) ||
          c.operator.toLowerCase().includes(q)
      );
    }
    return list;
  }, [counts, statusFilter, search]);

  // Create single count
  const handleCreate = async () => {
    if (!skuInput.trim() || !actualQty.trim() || !user) return;
    const expectedQty = selectedItem ? selectedItem.stock : 0;
    const actual = Number(actualQty);
    const variance = actual - expectedQty;
    const newCount: CycleCount = {
      sku: skuInput.trim().toUpperCase(),
      location: selectedItem?.location || 'UNKNOWN',
      expectedQty,
      actualQty: actual,
      variance,
      status: 'pending',
      operator: user.displayName || 'unknown',
      countedAt: new Date().toISOString(),
      note: note.trim() || undefined,
    };
    await db.cycleCounts.add(newCount);
    await logAction('cycle_count', `Created cycle count for ${newCount.sku} variance ${variance}`, user.displayName || 'unknown');
    await refresh();
    setSkuInput('');
    setSelectedItem(null);
    setActualQty('');
    setNote('');
    setTab('list');
  };

  // Generate counts by location
  const handleGenerateByLocation = async () => {
    if (!user) return;
    setLocGenerating(true);
    const items = inventory.filter((i) => i.location === selectedZone);
    const now = new Date().toISOString();
    const operator = user.displayName || 'unknown';
    const newCounts: CycleCount[] = items.map((item) => ({
      sku: item.sku,
      location: item.location,
      expectedQty: item.stock,
      actualQty: 0,
      variance: -item.stock,
      status: 'pending' as const,
      operator,
      countedAt: now,
      note: `Auto-generated for zone ${selectedZone}`,
    }));
    await db.cycleCounts.bulkAdd(newCounts);
    await logAction('cycle_count', `Generated ${newCounts.length} counts for zone ${selectedZone}`, operator);
    await refresh();
    setLocGenerating(false);
    setTab('list');
  };

  const handleComplete = async (count: CycleCount, autoAdjust: boolean) => {
    if (!user) return;
    const updated: CycleCount = {
      ...count,
      status: 'completed',
      operator: user.displayName || 'unknown',
      countedAt: new Date().toISOString(),
    };
    await db.cycleCounts.update(count.id!, updated);

    if (autoAdjust && count.variance !== 0) {
      const item = inventory.find((i) => i.sku === count.sku && i.location === count.location);
      if (item) {
        await db.inventory.update(item.id!, {
          stock: count.actualQty,
          updatedAt: new Date().toISOString(),
        });
        await db.inventoryMovements.add({
          sku: count.sku,
          type: 'adjustment',
          quantity: Math.abs(count.variance),
          fromLocation: count.location,
          toLocation: count.location,
          operator: user.displayName || 'unknown',
          note: `Cycle count adjustment: ${count.expectedQty} → ${count.actualQty} (${count.variance > 0 ? '+' : ''}${count.variance})`,
          timestamp: new Date().toISOString(),
        });
      }
    }
    await logAction('cycle_count', `Completed cycle count ${count.sku} (auto-adjust: ${autoAdjust})`, user.displayName || 'unknown');
    await refresh();
    setExpandedId(null);
  };

  // Reject count
  const handleReject = async (count: CycleCount) => {
    if (!user) return;
    await db.cycleCounts.update(count.id!, {
      ...count,
      status: 'rejected',
      operator: user.displayName || 'unknown',
      countedAt: new Date().toISOString(),
    });
    await logAction('cycle_count', `Rejected cycle count ${count.sku}`, user.displayName || 'unknown');
    await refresh();
    setExpandedId(null);
  };

  // SKU lookup while typing
  const handleSkuChange = (val: string) => {
    setSkuInput(val);
    const found = inventory.find((i) => i.sku.toLowerCase() === val.trim().toLowerCase());
    setSelectedItem(found || null);
  };

  const onBarcode = (code: string) => {
    setSkuInput(code);
    const found = inventory.find((i) => i.sku.toLowerCase() === code.toLowerCase());
    setSelectedItem(found || null);
    setShowScanner(false);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { color: string; icon: React.ReactNode }> = {
      pending: { color: 'text-accent-yellow', icon: <AlertTriangle size={12} /> },
      completed: { color: 'text-accent-green', icon: <CheckCircle2 size={12} /> },
      rejected: { color: 'text-accent-red', icon: <XCircle size={12} /> },
    };
    const s = map[status] || map.pending;
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold ${s.color}`}>
        {s.icon}
        {status}
      </span>
    );
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'list', label: 'Counts', icon: <ClipboardList size={16} /> },
    { key: 'create', label: 'Create', icon: <Plus size={16} /> },
    { key: 'by-location', label: 'By Location', icon: <MapPin size={16} /> },
    { key: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-void text-text-primary p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto mb-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardList className="text-accent-sky" size={24} />
              Cycle Count
            </h1>
            <p className="text-text-secondary text-sm mt-1">Inventory accuracy & variance tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScanner((s) => !s)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface hover:bg-opacity-80 text-accent-sky text-sm transition"
            >
              <ScanLine size={16} />
              Scan
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showScanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-6xl mx-auto mb-6 overflow-hidden"
          >
            <div className="glass-panel rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">
                  Barcode Scanner
                </span>
                <button onClick={() => setShowScanner(false)} className="text-text-secondary hover:text-text-primary">
                  <XCircle size={18} />
                </button>
              </div>
              <BarcodeReader onScan={onBarcode} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                tab === t.key
                  ? 'bg-accent-sky text-white'
                  : 'bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'list' && (
            <motion.div
              key="list"
              variants={cardVariant}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              {/* Filters */}
              <div className="glass-panel rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                  <input
                    type="text"
                    placeholder="Search SKU, location, operator..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-void border border-white/5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-sky/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-text-secondary" />
                  {(['all', 'pending', 'completed', 'rejected'] as StatusFilter[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-widest font-semibold transition ${
                        statusFilter === s
                          ? 'bg-accent-sky text-white'
                          : 'bg-surface text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              {loading ? (
                <div className="text-center text-text-secondary py-12">Loading...</div>
              ) : filteredCounts.length === 0 ? (
                <div className="text-center text-text-secondary py-12">No cycle counts found.</div>
              ) : (
                <div className="space-y-2">
                  {filteredCounts.map((count) => (
                    <motion.div
                      key={count.id}
                      layout
                      variants={listItemVariant}
                      initial="hidden"
                      animate="visible"
                      className="glass-panel rounded-xl p-4 cursor-pointer transition hover:bg-white/5"
                      onClick={() => setExpandedId(expandedId === count.id ? null : count.id!)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">SKU</span>
                            <span className="text-sm font-semibold">{count.sku}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">Location</span>
                            <span className="text-sm">{count.location}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">Expected</span>
                            <span className="text-sm">{count.expectedQty}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">Actual</span>
                            <span className={`text-sm font-semibold ${count.variance !== 0 ? 'text-accent-sky' : ''}`}>
                              {count.actualQty}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">Variance</span>
                            <span
                              className={`text-sm font-bold ${
                                count.variance > 0 ? 'text-accent-green' : count.variance < 0 ? 'text-accent-red' : 'text-text-primary'
                              }`}
                            >
                              {count.variance > 0 ? '+' : ''}
                              {count.variance}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {statusBadge(count.status)}
                          {expandedId === count.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedId === count.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="flex items-center gap-2">
                                <User size={14} className="text-text-secondary" />
                                <div>
                                  <span className="text-[10px] uppercase tracking-widest text-text-secondary block">Operator</span>
                                  <span className="text-sm">{count.operator}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-text-secondary" />
                                <div>
                                  <span className="text-[10px] uppercase tracking-widest text-text-secondary block">Counted At</span>
                                  <span className="text-sm">{new Date(count.countedAt).toLocaleString()}</span>
                                </div>
                              </div>
                              {count.note && (
                                <div className="flex items-center gap-2 col-span-2">
                                  <FileText size={14} className="text-text-secondary" />
                                  <div>
                                    <span className="text-[10px] uppercase tracking-widest text-text-secondary block">Note</span>
                                    <span className="text-sm">{count.note}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                            {count.status === 'pending' && (
                              <div className="mt-4 flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplete(count, false);
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-green text-white text-sm font-medium hover:opacity-90 transition"
                                >
                                  <CheckCircle2 size={14} />
                                  Complete
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplete(count, true);
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-sky text-white text-sm font-medium hover:opacity-90 transition"
                                >
                                  <ArrowRightLeft size={14} />
                                  Complete & Adjust
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReject(count);
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-red text-white text-sm font-medium hover:opacity-90 transition"
                                >
                                  <XCircle size={14} />
                                  Reject
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'create' && (
            <motion.div
              key="create"
              variants={cardVariant}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="glass-panel rounded-xl p-6 max-w-xl"
            >
              <h2 className="text-lg font-bold mb-1">Create Cycle Count</h2>
              <p className="text-text-secondary text-sm mb-6">Select an SKU or scan a barcode to begin counting.</p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold block mb-1.5">
                    SKU
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      list="sku-suggestions"
                      value={skuInput}
                      onChange={(e) => handleSkuChange(e.target.value)}
                      placeholder="Enter or scan SKU"
                      className="flex-1 px-3 py-2 rounded-lg bg-void border border-white/5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-sky/50"
                    />
                    <button
                      onClick={() => setShowScanner(true)}
                      className="px-3 py-2 rounded-lg bg-surface text-accent-sky hover:opacity-90 transition"
                      title="Scan barcode"
                    >
                      <ScanLine size={18} />
                    </button>
                  </div>
                  <datalist id="sku-suggestions">
                    {inventory.map((i) => (
                      <option key={i.id} value={i.sku} />
                    ))}
                  </datalist>
                </div>

                {selectedItem && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="rounded-lg bg-surface p-3 text-sm space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <Package size={14} className="text-accent-sky" />
                      <span className="font-semibold">{selectedItem.product}</span>
                    </div>
                    <div className="flex items-center gap-2 text-text-secondary">
                      <MapPin size={14} />
                      <span>{selectedItem.location}</span>
                    </div>
                    <div className="flex items-center gap-2 text-text-secondary">
                      <Hash size={14} />
                      <span>Expected Qty: {selectedItem.stock}</span>
                    </div>
                  </motion.div>
                )}

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold block mb-1.5">
                    Actual Quantity
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={actualQty}
                    onChange={(e) => setActualQty(e.target.value)}
                    placeholder="Enter counted quantity"
                    className="w-full px-3 py-2 rounded-lg bg-void border border-white/5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-sky/50"
                  />
                  {selectedItem && actualQty && (
                    <div className="mt-2 text-sm">
                      <span className="text-text-secondary">Variance: </span>
                      <span
                        className={`font-bold ${
                          Number(actualQty) - selectedItem.stock > 0
                            ? 'text-accent-green'
                            : Number(actualQty) - selectedItem.stock < 0
                            ? 'text-accent-red'
                            : 'text-text-primary'
                        }`}
                      >
                        {Number(actualQty) - selectedItem.stock > 0 ? '+' : ''}
                        {Number(actualQty) - selectedItem.stock}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold block mb-1.5">
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reason for variance, damage, etc."
                    className="w-full px-3 py-2 rounded-lg bg-void border border-white/5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent-sky/50"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleCreate}
                    disabled={!skuInput.trim() || !actualQty.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-sky text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Save size={16} />
                    Save Count
                  </button>
                  <button
                    onClick={() => {
                      setSkuInput('');
                      setSelectedItem(null);
                      setActualQty('');
                      setNote('');
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface text-text-secondary text-sm font-medium hover:text-text-primary transition"
                  >
                    <RotateCcw size={16} />
                    Reset
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'by-location' && (
            <motion.div
              key="by-location"
              variants={cardVariant}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="glass-panel rounded-xl p-6 max-w-xl"
            >
              <h2 className="text-lg font-bold mb-1">Count by Location</h2>
              <p className="text-text-secondary text-sm mb-6">
                Generate pending cycle counts for every item in a selected zone.
              </p>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold block mb-2">
                  Select Zone
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {ZONES.map((z) => (
                    <button
                      key={z}
                      onClick={() => setSelectedZone(z)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                        selectedZone === z
                          ? 'bg-accent-sky text-white'
                          : 'bg-surface text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {z}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-lg bg-surface p-4 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Items in {selectedZone}:</span>
                  <span className="font-semibold">
                    {inventory.filter((i) => i.location === selectedZone).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total Stock:</span>
                  <span className="font-semibold">
                    {inventory
                      .filter((i) => i.location === selectedZone)
                      .reduce((sum, i) => sum + i.stock, 0)}
                  </span>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleGenerateByLocation}
                  disabled={locGenerating}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-sky text-white text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus size={16} />
                  {locGenerating ? 'Generating...' : 'Generate Counts'}
                </button>
              </div>
            </motion.div>
          )}

          {tab === 'dashboard' && (
            <motion.div
              key="dashboard"
              variants={cardVariant}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Pending', value: stats.pending, color: 'text-accent-yellow', icon: <AlertTriangle size={20} /> },
                  { label: 'Completed', value: stats.completed, color: 'text-accent-green', icon: <CheckCircle2 size={20} /> },
                  { label: 'Rejected', value: stats.rejected, color: 'text-accent-red', icon: <XCircle size={20} /> },
                  { label: 'With Variance', value: stats.variances, color: 'text-accent-sky', icon: <ArrowRightLeft size={20} /> },
                ].map((s) => (
                  <motion.div
                    key={s.label}
                    whileHover={{ y: -2 }}
                    className="glass-panel rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-widest text-text-secondary font-semibold">
                        {s.label}
                      </span>
                      <span className={s.color}>{s.icon}</span>
                    </div>
                    <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                  </motion.div>
                ))}
              </div>

              {/* Variance summary */}
              <div className="glass-panel rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <BarChart3 size={18} className="text-accent-sky" />
                  Variance Summary
                </h3>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-text-secondary">Total absolute variance</span>
                  <span className="text-2xl font-bold text-accent-sky">{stats.totalVariance}</span>
                </div>
                <div className="h-2 bg-void rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((stats.variances / (counts.length || 1)) * 100, 100)}%` }}
                    className="h-full bg-accent-sky rounded-full"
                    transition={{ duration: 0.6 }}
                  />
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-widest text-text-secondary font-semibold">
                  {counts.length > 0 ? ((stats.variances / counts.length) * 100).toFixed(1) : 0}% of counts have variance
                </div>
              </div>

              {/* Recent variances table */}
              <div className="glass-panel rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-accent-red" />
                  Recent Variances
                </h3>
                {counts.filter((c) => c.variance !== 0).length === 0 ? (
                  <div className="text-center text-text-secondary py-6">No variances found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-white/5">
                          <th className="text-left font-semibold py-2">SKU</th>
                          <th className="text-left font-semibold py-2">Location</th>
                          <th className="text-right font-semibold py-2">Expected</th>
                          <th className="text-right font-semibold py-2">Actual</th>
                          <th className="text-right font-semibold py-2">Variance</th>
                          <th className="text-left font-semibold py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {counts
                          .filter((c) => c.variance !== 0)
                          .slice(0, 10)
                          .map((c) => (
                            <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition">
                              <td className="py-2 font-medium">{c.sku}</td>
                              <td className="py-2">{c.location}</td>
                              <td className="py-2 text-right">{c.expectedQty}</td>
                              <td className="py-2 text-right">{c.actualQty}</td>
                              <td
                                className={`py-2 text-right font-bold ${
                                  c.variance > 0 ? 'text-accent-green' : 'text-accent-red'
                                }`}
                              >
                                {c.variance > 0 ? '+' : ''}
                                {c.variance}
                              </td>
                              <td className="py-2">{statusBadge(c.status)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
