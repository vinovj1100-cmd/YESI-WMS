import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import KineticCounter from '@/components/KineticCounter';
import StatusBadge from '@/components/StatusBadge';
import { useNavigate } from 'react-router-dom';
import {
  Package, AlertTriangle, Clock, CheckCircle, RotateCcw,
  Activity, TrendingUp, Box, BarChart3, Zap, ShieldCheck,
  ClipboardCheck, ArrowRight, Bell, Camera, QrCode, ScanBarcode,
  RefreshCw, Wand2, Globe, Waves, Truck
} from 'lucide-react';
import type { InventoryItem, Order } from '@/lib/db';

interface Stats {
  totalStock: number;
  lowStock: number;
  pendingOrders: number;
  shippedToday: number;
  totalReturns: number;
  totalSkus: number;
  qcHolds: number;
  pendingCounts: number;
  reorderAlerts: number;
  postingCount: number;
  waveActive: number;
  workerTasksActive: number;
  avgFulfillmentRate: number;
}

interface ForecastAlert {
  sku: string;
  product: string;
  stock: number;
  velocity: string;
  daysUntilStockout: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { autoRefresh, refreshInterval, notifications, markRead } = useAppStore();

  const [stats, setStats] = useState<Stats>({
    totalStock: 0, lowStock: 0, pendingOrders: 0, shippedToday: 0,
    totalReturns: 0, totalSkus: 0, qcHolds: 0, pendingCounts: 0,
    reorderAlerts: 0, postingCount: 0, waveActive: 0, workerTasksActive: 0, avgFulfillmentRate: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  const [forecastAlerts, setForecastAlerts] = useState<ForecastAlert[]>([]);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    setRefreshing(true);
    const inventory = await db.inventory.toArray();
    const orders = await db.orders.toArray();
    const returns = await db.returns.toArray();
    const qcHolds = await db.qcHolds.toArray();
    const counts = await db.cycleCounts.toArray();
    const postings = await db.postingRecords.toArray();
    const waves = await db.waveBatches.toArray();
    const tasks = await db.workerTasks.toArray();
    const movements = await db.inventoryMovements.toArray();

    const totalStock = inventory.reduce((sum, item) => sum + (item.stock || 0), 0);
    const lowStock = inventory.filter(item => (item.stock || 0) < (item.reorderPoint || 10));
    const pending = orders.filter(o => o.status === 'Pending');
    const shipped = orders.filter(o => o.status === 'Shipped');
    const reorderAlerts = inventory.filter(item => item.reorderPoint && (item.stock || 0) <= item.reorderPoint);
    const totalShippable = pending.length + shipped.length;

    // Forecast days until stockout based on velocity
    const velocityMultiplier = { high: 8, medium: 4, low: 1 } as const;
    const forecast = inventory
      .map(item => {
        const vel = (item.velocity || 'low') as keyof typeof velocityMultiplier;
        const dailyBurn = velocityMultiplier[vel] || 1;
        const days = item.stock > 0 ? Math.floor(item.stock / dailyBurn) : 0;
        return { sku: item.sku, product: item.product, stock: item.stock, velocity: item.velocity || 'low', daysUntilStockout: days };
      })
      .filter(f => f.daysUntilStockout <= 7 && f.daysUntilStockout > 0)
      .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
      .slice(0, 5);

    setStats({
      totalStock,
      lowStock: lowStock.length,
      pendingOrders: pending.length,
      shippedToday: shipped.length,
      totalReturns: returns.length,
      totalSkus: inventory.length,
      qcHolds: qcHolds.filter(h => h.status === 'hold').length,
      pendingCounts: counts.filter(c => c.status === 'pending').length,
      reorderAlerts: reorderAlerts.length,
      postingCount: postings.length,
      waveActive: waves.filter(w => w.status === 'open' || w.status === 'picking').length,
      workerTasksActive: tasks.filter(t => t.status === 'in_progress').length,
      avgFulfillmentRate: totalShippable > 0 ? (shipped.length / totalShippable) * 100 : 0,
    });

    setRecentOrders(orders.slice(-5).reverse());
    setLowStockItems(lowStock.slice(0, 5));
    setRecentMovements(movements.reverse().slice(0, 5));
    setForecastAlerts(forecast);
    setLastRefresh(new Date().toLocaleTimeString());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadStats();
    }, (refreshInterval || 30) * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadStats]);

  const kpiCards = [
    { label: 'Total Items', value: stats.totalStock, icon: Box, color: 'text-accent-sky', delay: 0 },
    { label: 'Low Stock', value: stats.lowStock, icon: AlertTriangle, color: 'text-accent-red', alert: true, delay: 0.05 },
    { label: 'Pending Orders', value: stats.pendingOrders, icon: Clock, color: 'text-accent-yellow', delay: 0.1 },
    { label: 'Shipped', value: stats.shippedToday, icon: CheckCircle, color: 'text-accent-green', delay: 0.15 },
  ];

  const quickLinks = [
    { label: 'Analytics', icon: BarChart3, path: '/analytics', color: 'text-accent-sky', desc: 'View warehouse KPIs' },
    { label: 'Replenishment', icon: Zap, path: '/replenishment', color: 'text-accent-yellow', desc: `${stats.reorderAlerts} reorder alerts` },
    { label: 'QC Management', icon: ShieldCheck, path: '/qc', color: 'text-accent-red', desc: `${stats.qcHolds} active holds` },
    { label: 'Cycle Count', icon: ClipboardCheck, path: '/cycle-count', color: 'text-accent-green', desc: `${stats.pendingCounts} pending counts` },
  ];

  const unreadNotifications = notifications.filter(n => !n.read).length;
  const recentNotifications = notifications.slice(0, 5);

  return (
    <div>
      {/* Page Header with live pulse and refresh */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">Operations Center</h1>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-green"></span>
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Real-time warehouse performance overview
            {lastRefresh && <span className="ml-2 text-[10px] font-mono opacity-60">refreshed {lastRefresh}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadStats}
            className={`p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary hover:text-text-primary transition-all ${refreshing ? 'animate-spin' : ''}`}
            title="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="relative p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary hover:text-text-primary transition-all"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadNotifications}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: kpi.delay, duration: 0.3 }}
            className="glass-panel rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest">{kpi.label}</span>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <KineticCounter value={kpi.value} size={44} />
          </motion.div>
        ))}
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {quickLinks.map((link, i) => (
          <motion.button
            key={link.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.05, duration: 0.3 }}
            onClick={() => navigate(link.path)}
            className="glass-panel rounded-lg p-4 text-left hover:border-accent-sky/30 transition-all border border-transparent"
          >
            <div className="flex items-center justify-between mb-2">
              <link.icon className={`w-4 h-4 ${link.color}`} />
              <ArrowRight className="w-3 h-3 text-text-secondary" />
            </div>
            <p className="text-xs font-semibold text-text-primary">{link.label}</p>
            <p className="text-[10px] text-text-secondary mt-0.5">{link.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* Advanced Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <motion.button
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          onClick={() => navigate('/posting-tracker')}
          className="glass-panel rounded-lg p-3 text-left hover:border-accent-sky/30 transition-all border border-transparent flex items-center gap-3"
        >
          <Camera className="w-4 h-4 text-accent-sky" />
          <div>
            <p className="text-xs font-semibold text-text-primary">Posting Tracker</p>
            <p className="text-[10px] text-text-secondary">{stats.postingCount} records</p>
          </div>
        </motion.button>
        <motion.button
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
          onClick={() => navigate('/barcode-scanner')}
          className="glass-panel rounded-lg p-3 text-left hover:border-accent-sky/30 transition-all border border-transparent flex items-center gap-3"
        >
          <QrCode className="w-4 h-4 text-accent-green" />
          <div>
            <p className="text-xs font-semibold text-text-primary">Barcode Scan</p>
            <p className="text-[10px] text-text-secondary">Camera & file</p>
          </div>
        </motion.button>
        <motion.button
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}
          onClick={() => navigate('/guardian')}
          className="glass-panel rounded-lg p-3 text-left hover:border-accent-sky/30 transition-all border border-transparent flex items-center gap-3"
        >
          <Wand2 className="w-4 h-4 text-accent-yellow" />
          <div>
            <p className="text-xs font-semibold text-text-primary">Guardian Ops</p>
            <p className="text-[10px] text-text-secondary">AI suggestions</p>
          </div>
        </motion.button>
        <motion.button
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}
          onClick={() => navigate('/inbound')}
          className="glass-panel rounded-lg p-3 text-left hover:border-accent-sky/30 transition-all border border-transparent flex items-center gap-3"
        >
          <Truck className="w-4 h-4 text-accent-sky" />
          <div>
            <p className="text-xs font-semibold text-text-primary">Inbound</p>
            <p className="text-[10px] text-text-secondary">Receive goods</p>
          </div>
        </motion.button>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-lg p-4 text-center">
          <Package className="w-5 h-5 text-accent-sky mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{stats.totalSkus}</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-1">Active SKUs</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="glass-panel rounded-lg p-4 text-center">
          <RotateCcw className="w-5 h-5 text-accent-yellow mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{stats.totalReturns}</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-1">Returns</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="glass-panel rounded-lg p-4 text-center">
          <TrendingUp className="w-5 h-5 text-accent-green mx-auto mb-2" />
          <div className="text-2xl font-bold text-accent-green">{stats.avgFulfillmentRate.toFixed(0)}%</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-1">Fulfillment Rate</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} className="glass-panel rounded-lg p-4 text-center">
          <Waves className="w-5 h-5 text-accent-sky mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{stats.waveActive}</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-1">Active Waves</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="glass-panel rounded-lg p-4 text-center">
          <ScanBarcode className="w-5 h-5 text-accent-yellow mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{stats.workerTasksActive}</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-1">Tasks Active</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel rounded-lg p-4 text-center">
          <Globe className="w-5 h-5 text-accent-green mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{stats.postingCount}</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-1">Postings</div>
        </motion.div>
      </div>

      {/* Three Column Layout: Forecast, Orders, Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Forecast Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="glass-panel rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-accent-red" />
            <h3 className="text-sm font-semibold text-text-primary">Stockout Forecast</h3>
            {forecastAlerts.length > 0 && (
              <span className="ml-auto text-[10px] bg-accent-red/20 text-accent-red px-2 py-0.5 rounded-full">
                {forecastAlerts.length} critical
              </span>
            )}
          </div>
          {forecastAlerts.length === 0 ? (
            <p className="text-xs text-text-secondary py-4 text-center">No stockout risk in next 7 days</p>
          ) : (
            <div className="space-y-2">
              {forecastAlerts.map((item) => (
                <div key={item.sku} className="flex items-center justify-between p-2.5 bg-accent-red/5 border border-accent-red/10 rounded-md">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{item.product}</p>
                    <p className="text-[10px] text-text-secondary font-mono">{item.sku}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`text-xs font-bold ${item.daysUntilStockout <= 3 ? 'text-accent-red' : 'text-accent-yellow'}`}>
                      {item.daysUntilStockout}d
                    </span>
                    <span className="text-[10px] text-text-secondary">{item.stock} left</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          className="glass-panel rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Recent Orders</h3>
            <button onClick={() => navigate('/pick-pack')} className="ml-auto text-[10px] text-accent-sky hover:underline">View all</button>
          </div>
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-md">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-text-primary">{order.orderId}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="text-[10px] text-text-secondary font-mono mt-1 truncate">{order.requiredSkus}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Notifications Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="glass-panel rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-accent-yellow" />
            <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
            {unreadNotifications > 0 && (
              <button onClick={() => recentNotifications.forEach(n => markRead(n.id))} className="ml-auto text-[10px] text-accent-yellow hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-[260px] overflow-y-auto">
            <AnimatePresence>
              {recentNotifications.length === 0 ? (
                <p className="text-xs text-text-secondary py-4 text-center">No new notifications</p>
              ) : (
                recentNotifications.map((n) => (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className={`p-2.5 rounded-md border ${n.read ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-accent-yellow/5 border-accent-yellow/10'}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-medium ${n.read ? 'text-text-secondary' : 'text-text-primary'}`}>{n.title}</p>
                      {!n.read && <span className="w-1.5 h-1.5 bg-accent-yellow rounded-full" />}
                    </div>
                    <p className="text-[10px] text-text-secondary mt-0.5">{n.message}</p>
                    <p className="text-[9px] text-text-secondary/60 mt-1">{new Date(n.timestamp).toLocaleTimeString()}</p>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Low Stock Alerts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.3 }}
        className="glass-panel rounded-lg p-4 mt-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-accent-red" />
          <h3 className="text-sm font-semibold text-text-primary">Low Stock Alerts</h3>
          {lowStockItems.length > 0 && (
            <span className="ml-auto text-[10px] bg-accent-red/20 text-accent-red px-2 py-0.5 rounded-full">
              {lowStockItems.length} items
            </span>
          )}
        </div>
        {lowStockItems.length === 0 ? (
          <p className="text-xs text-text-secondary py-4 text-center">All stock levels are healthy</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-2.5 bg-accent-red/5 border border-accent-red/10 rounded-md">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{item.product}</p>
                  <p className="text-[10px] text-text-secondary font-mono">{item.sku} · {item.location}</p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className="text-xs font-bold text-accent-red">{item.stock} left</span>
                  <span className="text-[10px] text-text-secondary">RP: {item.reorderPoint}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Recent Movements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        className="glass-panel rounded-lg p-4 mt-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-accent-green" />
          <h3 className="text-sm font-semibold text-text-primary">Recent Inventory Movements</h3>
        </div>
        {recentMovements.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-4">No movements recorded yet</p>
        ) : (
          <div className="space-y-2">
            {recentMovements.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-md">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    m.type === 'inbound' ? 'bg-accent-green/20 text-accent-green' :
                    m.type === 'outbound' ? 'bg-accent-red/20 text-accent-red' :
                    m.type === 'return' ? 'bg-accent-yellow/20 text-accent-yellow' :
                    'bg-white/10 text-text-secondary'
                  }`}>{m.type}</span>
                  <span className="text-xs font-mono text-text-primary">{m.sku}</span>
                  <span className="text-[10px] text-text-secondary">{m.quantity} units</span>
                </div>
                <span className="text-[10px] text-text-secondary font-mono">{m.operator}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
