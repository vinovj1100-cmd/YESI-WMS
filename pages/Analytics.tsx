import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle,
  AlertTriangle, Package, BarChart3, ArrowDownLeft, ArrowUpRight,
  Camera, Waves, Zap
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie,
  Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart
} from "recharts";
import { db } from "@/lib/db";

const COLORS = {
  orange: "#ff6b35",
  green: "#2ecc71",
  red: "#e63946",
  yellow: "#ffb800",
  white: "#ffffff",
  gray: "#8f9199",
};

const PIE_COLORS = [COLORS.orange, COLORS.green, COLORS.red, COLORS.yellow, "#ffffff", "#4a4d54"];

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-white/10 rounded-lg p-3 shadow-xl">
      <p className="text-text-primary font-medium text-sm mb-1">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">{entry.name}:</span>
          <span className="text-text-primary font-medium">
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function KPICard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  delay,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<any>;
  trend?: string;
  trendUp?: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass-panel rounded-xl p-5"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-text-secondary text-sm font-medium">{title}</p>
          <p className="text-text-primary text-2xl font-bold">{value}</p>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendUp ? "text-accent-green" : "text-accent-red"}`}>
              {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{trend}</span>
            </div>
          )}
        </div>
        <div className="p-3 rounded-lg bg-white/5">
          <Icon className="w-5 h-5 text-text-primary" />
        </div>
      </div>
    </motion.div>
  );
}

export default function Analytics() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [postings, setPostings] = useState<any[]>([]);
  const [waves, setWaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [inv, ord, mov, pst, wav] = await Promise.all([
          db.inventory.toArray(),
          db.orders.toArray(),
          db.inventoryMovements.toArray(),
          db.postingRecords.toArray(),
          db.waveBatches.toArray(),
        ]);
        setInventory(inv || []);
        setOrders(ord || []);
        setMovements(mov || []);
        setPostings(pst || []);
        setWaves(wav || []);
      } catch (err) {
        console.error("Failed to load analytics data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const kpis = useMemo(() => {
    const totalStockValue = inventory.reduce((sum, item) => {
      return sum + (item.quantity || 0) * (item.unitCost || item.unitPrice || 0);
    }, 0);

    const shippedOrders = orders.filter((o) => {
      const s = (o.status || "").toLowerCase();
      return s === "shipped" || s === "delivered";
    });

    const avgFulfillmentHours =
      shippedOrders.length > 0
        ? shippedOrders.reduce((sum, o) => {
            const created = new Date(o.createdAt || 0).getTime();
            const updated = new Date(o.updatedAt || 0).getTime();
            return sum + Math.max(0, updated - created) / (1000 * 60 * 60);
          }, 0) / shippedOrders.length
        : 0;

    const totalOrders = orders.length || 0;
    const returnedOrders = orders.filter((o) => (o.status || "").toLowerCase() === "returned").length;
    const accuracy = totalOrders > 0 ? ((totalOrders - returnedOrders) / totalOrders) * 100 : 100;

    const avgInventoryValue = totalStockValue / (inventory.length || 1);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentOutbound = movements
      .filter((m) => {
        const t = (m.type || "").toLowerCase();
        const ts = new Date(m.timestamp || m.createdAt || 0);
        return t === "outbound" && ts >= thirtyDaysAgo;
      })
      .reduce((sum, m) => sum + Math.abs(m.quantity || 0) * (m.unitCost || 0), 0);

    const turnover = avgInventoryValue > 0 ? (recentOutbound / avgInventoryValue) * 12 : 0;

    return {
      totalStockValue,
      avgFulfillmentHours,
      accuracy,
      turnover,
    };
  }, [inventory, orders, movements]);

  const inventoryChartData = useMemo(() => {
    return [...inventory]
      .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))
      .slice(0, 10)
      .map((item) => ({
        name: item.sku || item.name || "Unknown",
        quantity: item.quantity || 0,
      }));
  }, [inventory]);

  const orderTrendData = useMemo(() => {
    if (!orders.length) return [];
    const grouped = new Map<string, { key: string; label: string; Pending: number; Shipped: number; Returned: number }>();

    orders.forEach((order) => {
      const d = new Date(order.updatedAt || order.createdAt || 0);
      const key = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      if (!grouped.has(key)) {
        grouped.set(key, { key, label, Pending: 0, Shipped: 0, Returned: 0 });
      }
      const entry = grouped.get(key)!;
      const status = (order.status || "").toLowerCase();
      if (status === "pending") entry.Pending++;
      else if (status === "shipped" || status === "delivered") entry.Shipped++;
      else if (status === "returned") entry.Returned++;
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-14)
      .map(({ label, Pending, Shipped, Returned }) => ({
        date: label,
        Pending,
        Shipped,
        Returned,
      }));
  }, [orders]);

  const movementHistoryData = useMemo(() => {
    if (!movements.length) return [];
    const grouped = new Map<string, { key: string; label: string; Inbound: number; Outbound: number }>();

    movements.forEach((m) => {
      const d = new Date(m.timestamp || m.createdAt || 0);
      const key = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      if (!grouped.has(key)) {
        grouped.set(key, { key, label, Inbound: 0, Outbound: 0 });
      }
      const entry = grouped.get(key)!;
      const type = (m.type || "").toLowerCase();
      const qty = Math.abs(m.quantity || 0);
      if (type === "inbound") entry.Inbound += qty;
      else if (type === "outbound") entry.Outbound += qty;
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-14)
      .map(({ label, Inbound, Outbound }) => ({
        date: label,
        Inbound,
        Outbound,
      }));
  }, [movements]);

  const zoneData = useMemo(() => {
    if (!inventory.length) return [];
    const zones = new Map<string, number>();

    inventory.forEach((item) => {
      const location = item.location || "Unknown";
      const zone = location.split("-")[0] || "Unknown";
      zones.set(zone, (zones.get(zone) || 0) + (item.quantity || 0));
    });

    return Array.from(zones.entries()).map(([name, value], index) => ({
      name,
      value,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
  }, [inventory]);

  const lowStockData = useMemo(() => {
    if (!inventory.length) return [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return inventory
      .filter((item) => (item.stock || 0) < (item.reorderPoint || 0))
      .map((item) => {
        const sku = item.sku || item.id || "Unknown";
        const qty = item.stock || 0;
        const reorderPoint = item.reorderPoint || 0;

        const itemMovements = movements.filter((m) => {
          const mDate = new Date(m.timestamp || m.createdAt || 0);
          return (m.sku === sku || m.sku === item.sku) && (m.type || "").toLowerCase() === "outbound" && mDate >= thirtyDaysAgo;
        });

        const totalOutbound = itemMovements.reduce((sum, m) => sum + Math.abs(m.quantity || 0), 0);
        const dailyVelocity = totalOutbound / 30;
        const projectedDays = dailyVelocity > 0 ? Math.floor(qty / dailyVelocity) : Infinity;

        return {
          sku: item.sku || "Unknown",
          name: item.product || "Unknown",
          quantity: qty,
          reorderPoint,
          dailyVelocity: Math.round(dailyVelocity * 10) / 10,
          projectedDays: projectedDays === Infinity ? Infinity : projectedDays,
          status: qty === 0 ? "Stockout" : qty <= reorderPoint * 0.5 ? "Critical" : "Low",
        };
      })
      .sort((a, b) => {
        if (a.projectedDays === Infinity) return 1;
        if (b.projectedDays === Infinity) return -1;
        return (a.projectedDays as number) - (b.projectedDays as number);
      });
  }, [inventory, movements]);

  const postingTrendData = useMemo(() => {
    if (!postings.length) return [];
    const grouped = new Map<string, { key: string; label: string; count: number }>();
    postings.forEach((p) => {
      const d = new Date(p.createdAt || 0);
      const key = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!grouped.has(key)) grouped.set(key, { key, label, count: 0 });
      grouped.get(key)!.count++;
    });
    return Array.from(grouped.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-14)
      .map(({ label, count }) => ({ date: label, postings: count }));
  }, [postings]);

  const wavePerformanceData = useMemo(() => {
    if (!waves.length) return [];
    return waves.map((w) => {
      const created = new Date(w.createdAt || 0).getTime();
      const completed = w.completedAt ? new Date(w.completedAt).getTime() : Date.now();
      const duration = Math.max(0, (completed - created) / (1000 * 60 * 60));
      const orderCount = (w.orderIds || "").split(",").filter(Boolean).length;
      return {
        name: w.name || w.waveId,
        orders: orderCount,
        durationHours: Math.round(duration * 10) / 10,
        status: w.status,
      };
    }).slice(-10);
  }, [waves]);

  const velocityForecastChart = useMemo(() => {
    return lowStockData.map((item) => ({
      name: item.sku,
      projectedDays: item.projectedDays === Infinity ? 30 : item.projectedDays,
      reorderPoint: item.reorderPoint,
      quantity: item.quantity,
      status: item.status,
    })).slice(0, 8);
  }, [lowStockData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-accent-sky border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void p-4 md:p-6 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary">Analytics</h1>
        <p className="text-text-secondary mt-1">Warehouse performance insights & inventory intelligence</p>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Stock Value"
          value={`$${kpis.totalStockValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          trend="vs last month"
          trendUp={true}
          delay={0}
        />
        <KPICard
          title="Avg Fulfillment Time"
          value={`${kpis.avgFulfillmentHours.toFixed(1)}h`}
          icon={Clock}
          trend="vs last month"
          trendUp={false}
          delay={0.1}
        />
        <KPICard
          title="Order Accuracy"
          value={`${kpis.accuracy.toFixed(1)}%`}
          icon={CheckCircle}
          trend="vs last month"
          trendUp={true}
          delay={0.2}
        />
        <KPICard
          title="Stock Turnover"
          value={`${kpis.turnover.toFixed(1)}x`}
          icon={BarChart3}
          trend="annualized"
          trendUp={true}
          delay={0.3}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="glass-panel rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-accent-sky" />
            <h2 className="text-lg font-semibold text-text-primary">Inventory Overview</h2>
            <span className="text-xs text-text-secondary ml-auto">Top 10 SKUs by quantity</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inventoryChartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: COLORS.gray, fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: COLORS.gray, fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="quantity" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Order Fulfillment Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="glass-panel rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpRight className="w-5 h-5 text-accent-green" />
            <h2 className="text-lg font-semibold text-text-primary">Order Fulfillment Trend</h2>
            <span className="text-xs text-text-secondary ml-auto">Last 14 days</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={orderTrendData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: COLORS.gray, fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: COLORS.gray, fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: COLORS.gray }}
                />
                <Area type="monotone" dataKey="Pending" stroke={COLORS.yellow} fill={COLORS.yellow} fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="Shipped" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="Returned" stroke={COLORS.red} fill={COLORS.red} fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Movement History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="glass-panel rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <ArrowDownLeft className="w-5 h-5 text-accent-sky" />
            <h2 className="text-lg font-semibold text-text-primary">Inventory Movement History</h2>
            <span className="text-xs text-text-secondary ml-auto">Inbound vs Outbound</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={movementHistoryData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: COLORS.gray, fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: COLORS.gray, fontSize: 12 }}
                  axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: COLORS.gray }} />
                <Line type="monotone" dataKey="Inbound" stroke={COLORS.green} strokeWidth={2} dot={{ fill: COLORS.green, r: 3 }} />
                <Line type="monotone" dataKey="Outbound" stroke={COLORS.red} strokeWidth={2} dot={{ fill: COLORS.red, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Zone Utilization */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="glass-panel rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-accent-yellow" />
            <h2 className="text-lg font-semibold text-text-primary">Zone Utilization</h2>
            <span className="text-xs text-text-secondary ml-auto">By inventory quantity</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={zoneData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: "rgba(255,255,255,0.2)" }}
                >
                  {zoneData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: COLORS.gray }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Low Stock Forecast Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="glass-panel rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-accent-red" />
          <h2 className="text-lg font-semibold text-text-primary">Low Stock Forecast</h2>
          <span className="text-xs text-text-secondary ml-auto">
            {lowStockData.length} items below reorder point
          </span>
        </div>

        {lowStockData.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-accent-green opacity-60" />
            <p>All items are above reorder point</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider py-3 px-4">SKU</th>
                  <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider py-3 px-4">Name</th>
                  <th className="text-right text-xs font-semibold text-text-secondary uppercase tracking-wider py-3 px-4">Current Qty</th>
                  <th className="text-right text-xs font-semibold text-text-secondary uppercase tracking-wider py-3 px-4">Reorder Point</th>
                  <th className="text-right text-xs font-semibold text-text-secondary uppercase tracking-wider py-3 px-4">Daily Velocity</th>
                  <th className="text-right text-xs font-semibold text-text-secondary uppercase tracking-wider py-3 px-4">Projected Days</th>
                  <th className="text-center text-xs font-semibold text-text-secondary uppercase tracking-wider py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStockData.map((item, index) => (
                  <motion.tr
                    key={item.sku + index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * index }}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm text-text-primary font-medium">{item.sku}</td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{item.name}</td>
                    <td className="py-3 px-4 text-sm text-text-primary text-right">{item.quantity.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-text-secondary text-right">{item.reorderPoint.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm text-text-secondary text-right">{item.dailyVelocity}</td>
                    <td className="py-3 px-4 text-sm text-text-primary text-right font-medium">
                      {item.projectedDays === Infinity ? (
                        <span className="text-text-secondary">—</span>
                      ) : (
                        <span className={item.projectedDays <= 7 ? "text-accent-red" : "text-accent-yellow"}>
                          {item.projectedDays}d
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.status === "Stockout"
                            ? "bg-accent-red/20 text-accent-red"
                            : item.status === "Critical"
                            ? "bg-accent-red/15 text-accent-red"
                            : "bg-accent-yellow/15 text-accent-yellow"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Posting Trends */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.85 }}
        className="glass-panel rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5 text-accent-sky" />
          <h2 className="text-lg font-semibold text-text-primary">Posting Trends</h2>
          <span className="text-xs text-text-secondary ml-auto">Daily posting volume</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={postingTrendData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: COLORS.gray, fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
              <YAxis tick={{ fill: COLORS.gray, fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="postings" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Wave Performance + Velocity Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          className="glass-panel rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Waves className="w-5 h-5 text-accent-yellow" />
            <h2 className="text-lg font-semibold text-text-primary">Wave Performance</h2>
            <span className="text-xs text-text-secondary ml-auto">Last 10 waves</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={wavePerformanceData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: COLORS.gray, fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: COLORS.gray, fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: COLORS.gray, fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: COLORS.gray }} />
                <Bar yAxisId="left" dataKey="orders" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="durationHours" stroke={COLORS.yellow} strokeWidth={2} dot={{ fill: COLORS.yellow, r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.95 }}
          className="glass-panel rounded-xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-accent-red" />
            <h2 className="text-lg font-semibold text-text-primary">Stockout Forecast</h2>
            <span className="text-xs text-text-secondary ml-auto">Days until stockout</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocityForecastChart} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: COLORS.gray, fontSize: 11 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <YAxis tick={{ fill: COLORS.gray, fontSize: 12 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="projectedDays" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                <Bar dataKey="quantity" fill={COLORS.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
