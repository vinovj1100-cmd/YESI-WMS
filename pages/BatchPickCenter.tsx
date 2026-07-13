import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { createBatchGroup, optimizePickPath, type OptimizedPath } from '@/lib/pickPathOptimizer';
import { autoAllocatePendingOrders } from '@/lib/allocation';
import {
  Layers, Route, PackageOpen, Zap, PlayCircle, CheckCircle2,
  MapPin, Clock, Footprints, RefreshCw, Wand2,
} from 'lucide-react';
import type { BatchGroup, PickPath, Order } from '@/lib/db';

export default function BatchPickCenter() {
  const { user } = useAuth();
  const [batches, setBatches] = useState<BatchGroup[]>([]);
  const [paths, setPaths] = useState<PickPath[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [optimizedPreview, setOptimizedPreview] = useState<OptimizedPath | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'batches' | 'paths' | 'create'>('batches');

  const loadData = useCallback(async () => {
    const [b, p, o] = await Promise.all([
      db.batchGroups.toArray(),
      db.pickPaths.toArray(),
      db.orders.where('status').equals('Pending').toArray(),
    ]);
    setBatches(b.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setPaths(p.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setPendingOrders(o.sort((a, b) => {
      const prio = { urgent: 0, high: 1, normal: 2 };
      return prio[a.priority] - prio[b.priority];
    }));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleOrder = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const previewPath = async () => {
    if (selectedOrders.size === 0) return;
    setLoading(true);
    const orders = pendingOrders.filter(o => selectedOrders.has(o.orderId));
    const skus = orders.flatMap(o => o.requiredSkus.split(',').map(s => s.trim()));
    const path = await optimizePickPath(skus, orders.map(o => o.orderId));
    setOptimizedPreview(path);
    setLoading(false);
  };

  const createBatch = async (method: 'batch' | 'zone' | 'wave') => {
    if (selectedOrders.size === 0) {
      setMessage({ type: 'error', text: 'Select at least one order' });
      return;
    }
    setLoading(true);
    try {
      const batchId = await createBatchGroup([...selectedOrders], method, user?.displayName);
      await logAction('BATCH_CREATE', `Created ${batchId} (${method}) with ${selectedOrders.size} orders`, user?.displayName || 'system');
      setMessage({ type: 'success', text: `Batch ${batchId} created with optimized pick path` });
      setSelectedOrders(new Set());
      setOptimizedPreview(null);
      loadData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to create batch' });
    }
    setLoading(false);
  };

  const completeBatch = async (batch: BatchGroup) => {
    await db.batchGroups.update(batch.id!, { status: 'packed', completedAt: new Date().toISOString() });
    const orderIds = batch.orderIds.split(',');
    for (const oid of orderIds) {
      const order = await db.orders.where('orderId').equals(oid.trim()).first();
      if (order) await db.orders.update(order.id!, { status: 'Packed', updatedAt: new Date().toISOString() });
    }
    setMessage({ type: 'success', text: `Batch ${batch.batchId} marked as packed` });
    loadData();
  };

  const handleAutoAllocate = async () => {
    setLoading(true);
    const result = await autoAllocatePendingOrders(user?.displayName || 'system');
    setMessage({ type: 'info', text: `FEFO allocation: ${result.allocated} allocated, ${result.failed} failed` });
    setLoading(false);
  };

  const statusColor = (s: string) => {
    if (s === 'open' || s === 'planned') return 'text-accent-yellow';
    if (s === 'picking' || s === 'active') return 'text-accent-sky';
    if (s === 'packed' || s === 'completed') return 'text-accent-green';
    return 'text-text-secondary';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-accent-sky" />
            Batch Pick Center
          </h1>
          <p className="text-sm text-text-secondary mt-1">AI-optimized pick paths, batch/zone/wave picking & FEFO allocation</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAutoAllocate} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 flex items-center gap-2">
            <Wand2 className="w-4 h-4" /> Auto-Allocate (FEFO)
          </button>
          <button onClick={loadData} className="px-4 py-2 rounded-xl text-sm text-text-secondary border border-white/[0.08] hover:bg-white/[0.04] flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {message && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`px-4 py-3 rounded-xl text-sm border ${
            message.type === 'success' ? 'bg-accent-green/10 border-accent-green/20 text-accent-green' :
            message.type === 'error' ? 'bg-accent-red/10 border-accent-red/20 text-accent-red' :
            'bg-accent-sky/10 border-accent-sky/20 text-accent-sky'
          }`} onClick={() => setMessage(null)}>{message.text}</motion.div>
      )}

      <div className="flex gap-1 border-b border-white/[0.06] pb-px">
        {(['batches', 'paths', 'create'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab ? 'text-accent-sky border-accent-sky' : 'text-text-secondary border-transparent hover:text-white'
            }`}>
            {tab === 'create' ? 'Create Batch' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'batches' && (
        <div className="space-y-3">
          {batches.map((batch) => {
            const stops = batch.pickPath ? JSON.parse(batch.pickPath) : [];
            return (
              <div key={batch.id} className="glass-panel rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{batch.batchId}</span>
                      <span className={`text-xs font-medium capitalize ${statusColor(batch.status)}`}>{batch.status}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-text-secondary capitalize">{batch.pickingMethod}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">{batch.orderIds} — {batch.totalItems} items, {batch.totalWeight.toFixed(1)}kg</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div><p className="text-xs text-text-secondary">Zones</p><p className="text-sm text-white">{batch.zoneProfile}</p></div>
                    <div><p className="text-xs text-text-secondary">Est.</p><p className="text-sm text-white">{batch.estimatedTime || '—'}m</p></div>
                    {batch.pickerId && <div><p className="text-xs text-text-secondary">Picker</p><p className="text-sm text-accent-sky">{batch.pickerId}</p></div>}
                    {(batch.status === 'open' || batch.status === 'picking') && (
                      <button onClick={() => completeBatch(batch)} className="px-3 py-1.5 rounded-lg text-xs bg-accent-green/15 text-accent-green border border-accent-green/20">Complete</button>
                    )}
                  </div>
                </div>
                {stops.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap text-xs text-text-secondary">
                    <Route className="w-3 h-3" />
                    {stops.map((s: { location: string; sku: string }, i: number) => (
                      <span key={i}>{s.location}<span className="text-white/30 mx-1">→</span></span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {batches.length === 0 && <p className="text-center py-8 text-text-secondary text-sm">No batches yet. Create one from pending orders.</p>}
        </div>
      )}

      {activeTab === 'paths' && (
        <div className="space-y-3">
          {paths.map((path) => {
            const stops = JSON.parse(path.route);
            return (
              <div key={path.id} className="glass-panel rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-white">{path.pathId}</span>
                    <span className={`ml-2 text-xs capitalize ${statusColor(path.status)}`}>{path.status}</span>
                    <p className="text-xs text-text-secondary mt-1">{path.orderIds}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-text-secondary"><Footprints className="w-3 h-3" />{path.totalDistance}m</span>
                    <span className="flex items-center gap-1 text-text-secondary"><Clock className="w-3 h-3" />{path.estimatedTime}m</span>
                    <span className="text-text-secondary">{stops.length} stops</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'create' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Select Orders ({selectedOrders.size} selected)</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {pendingOrders.map((order) => (
                <label key={order.id} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedOrders.has(order.orderId) ? 'bg-accent-sky/10 border border-accent-sky/20' : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.04]'
                }`}>
                  <input type="checkbox" checked={selectedOrders.has(order.orderId)} onChange={() => toggleOrder(order.orderId)}
                    className="rounded border-white/20" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{order.orderId}</span>
                      {order.priority !== 'normal' && <Zap className="w-3 h-3 text-accent-yellow" />}
                    </div>
                    <p className="text-xs text-text-secondary">{order.requiredSkus}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={previewPath} disabled={selectedOrders.size === 0 || loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-white/[0.04] text-white border border-white/[0.08] hover:bg-white/[0.08] flex items-center justify-center gap-2">
                <Route className="w-4 h-4" /> Preview Path
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {optimizedPreview && (
              <div className="glass-panel rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-accent-sky" /> Optimized Route
                </h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div><p className="text-xs text-text-secondary">Distance</p><p className="text-lg font-bold text-white">{optimizedPreview.totalDistance}m</p></div>
                  <div><p className="text-xs text-text-secondary">Est. Time</p><p className="text-lg font-bold text-white">{optimizedPreview.estimatedTime}m</p></div>
                  <div><p className="text-xs text-text-secondary">Stops</p><p className="text-lg font-bold text-white">{optimizedPreview.stops.length}</p></div>
                </div>
                <div className="space-y-1.5">
                  {optimizedPreview.stops.map((stop, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-5 h-5 rounded-full bg-accent-sky/15 text-accent-sky flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                      <MapPin className="w-3 h-3 text-text-secondary" />
                      <span className="text-white">{stop.location}</span>
                      <span className="text-text-secondary">— {stop.sku} ×{stop.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="glass-panel rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Create Batch</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['batch', 'zone', 'wave'] as const).map((method) => (
                  <button key={method} onClick={() => createBatch(method)} disabled={selectedOrders.size === 0 || loading}
                    className="py-3 rounded-xl text-sm font-medium capitalize bg-accent-sky/10 text-accent-sky border border-accent-sky/20 hover:bg-accent-sky/20 disabled:opacity-30 transition-colors flex flex-col items-center gap-1">
                    <PackageOpen className="w-5 h-5" />
                    {method}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}