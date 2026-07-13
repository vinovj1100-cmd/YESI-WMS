import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction, logInventoryMovement } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import {
  ArrowRightLeft,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  PlayCircle,
  PackagePlus,
  MapPin,
  Search,
  Zap,
  LayoutGrid,
  X,
} from 'lucide-react';
import type { InventoryItem, ReplenishmentTask, ZoneCapacity } from '@/lib/db';

interface AlertItem extends InventoryItem {
  urgency: 'critical' | 'warning';
  suggestedQty: number;
}

interface SlottingSuggestion {
  sku: string;
  product: string;
  currentLocation: string;
  currentZone: string;
  currentVelocity: string;
  suggestedZone: string;
  reason: string;
}

export default function Replenishment() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<ReplenishmentTask[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [zones, setZones] = useState<ZoneCapacity[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [suggestions, setSuggestions] = useState<SlottingSuggestion[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'tasks' | 'alerts' | 'slotting'>('tasks');
  const [confirmComplete, setConfirmComplete] = useState<ReplenishmentTask | null>(null);

  const loadData = useCallback(async () => {
    const [inv, ts, zns] = await Promise.all([
      db.inventory.toArray(),
      db.replenishmentTasks.toArray(),
      db.zoneCapacities.toArray(),
    ]);

    const sortedTasks = ts.sort((a, b) => {
      const statusOrder = { pending: 0, in_progress: 1, completed: 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      if (a.priority !== b.priority) {
        return a.priority === 'high' ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    setTasks(sortedTasks);
    setInventory(inv);
    setZones(zns);

    // Reorder alerts
    const alertItems: AlertItem[] = inv
      .filter((i) => (i.reorderPoint || 0) > 0 && (i.stock || 0) <= (i.reorderPoint || 0))
      .map((i) => ({
        ...i,
        urgency: ((i.stock || 0) === 0 ? 'critical' : 'warning') as 'critical' | 'warning',
        suggestedQty: i.reorderQty || Math.max(10, (i.reorderPoint || 0) * 2),
      }))
      .sort((a, b) => (a.stock || 0) - (b.stock || 0));
    setAlerts(alertItems);

    // Slotting suggestions
    const slotting: SlottingSuggestion[] = inv
      .map((i) => {
        const velocity = i.velocity || 'low';
        const currentZone = i.location.split('-')[0];
        const zoneInfo = zns.find((z) => z.zone === currentZone);
        const isOptimal = zoneInfo?.velocityTarget === velocity;

        let suggestedZone = currentZone;
        let reason = 'Optimal placement';

        if (!isOptimal) {
          const bestZone = zns
            .filter((z) => z.velocityTarget === velocity && z.zone !== 'E1')
            .sort((a, b) => a.currentUtilization - b.currentUtilization)[0];
          if (bestZone && bestZone.zone !== currentZone) {
            suggestedZone = bestZone.zone;
            reason = `${velocity} velocity → Zone ${bestZone.zone}`;
          } else {
            reason = 'Current zone acceptable';
          }
        }

        return {
          sku: i.sku,
          product: i.product,
          currentLocation: i.location,
          currentZone,
          currentVelocity: velocity,
          suggestedZone,
          reason,
        };
      })
      .filter((s) => s.suggestedZone !== s.currentZone || s.reason !== 'Optimal placement')
      .sort((a, b) => a.suggestedZone.localeCompare(b.suggestedZone));

    setSuggestions(slotting);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const generateTasks = async () => {
    const bulkItems = inventory.filter((i) => i.location.startsWith('E1'));
    let createdCount = 0;

    for (const item of alerts) {
      const existingPending = tasks.filter(
        (t) => t.sku === item.sku && t.status !== 'completed'
      );
      const pendingQty = existingPending.reduce((sum, t) => sum + t.quantity, 0);
      const neededQty = item.suggestedQty - pendingQty;

      if (neededQty <= 0) continue;

      const bulkStock = bulkItems.find((b) => b.sku === item.sku);
      const sourceLocation = bulkStock?.location || 'E1-01';
      const availableQty = bulkStock?.stock || 0;
      const transferQty = Math.min(neededQty, availableQty || neededQty);

      // Determine target zone based on velocity
      const velocity = item.velocity || 'low';
      const bestZone = zones
        .filter((z) => z.velocityTarget === velocity && z.zone !== 'E1')
        .sort((a, b) => a.currentUtilization - b.currentUtilization)[0];
      const targetZone = bestZone?.zone || 'A1';

      // Find a specific bin in the target zone (or use a default)
      const existingInZone = inventory.find(
        (i) => i.sku === item.sku && i.location.startsWith(targetZone)
      );
      const targetLocation = existingInZone?.location || `${targetZone}-01`;

      const newTask: ReplenishmentTask = {
        sku: item.sku,
        fromLocation: sourceLocation,
        toLocation: targetLocation,
        quantity: transferQty,
        status: 'pending',
        priority: item.urgency === 'critical' ? 'high' : 'normal',
        createdAt: new Date().toISOString(),
      };

      await db.replenishmentTasks.add(newTask);
      createdCount++;
    }

    // Also generate high-velocity replenishment tasks for items not in forward pick
    const highVelocityItems = inventory.filter(
      (i) => i.velocity === 'high' && !i.location.match(/^[A-D]\d/)
    );
    for (const item of highVelocityItems) {
      const existingPending = tasks.filter(
        (t) => t.sku === item.sku && t.status !== 'completed'
      );
      if (existingPending.length > 0) continue;

      const bestZone = zones
        .filter((z) => z.velocityTarget === 'high' && z.zone !== 'E1')
        .sort((a, b) => a.currentUtilization - b.currentUtilization)[0];
      const targetZone = bestZone?.zone || 'A1';
      const existingInZone = inventory.find(
        (i) => i.sku === item.sku && i.location.startsWith(targetZone)
      );
      if (existingInZone) continue; // Already in a forward pick zone

      const bulkStock = bulkItems.find((b) => b.sku === item.sku);
      const sourceLocation = bulkStock?.location || 'E1-01';
      const transferQty = Math.min(10, bulkStock?.stock || 10);
      if (transferQty <= 0) continue;

      const newTask: ReplenishmentTask = {
        sku: item.sku,
        fromLocation: sourceLocation,
        toLocation: `${targetZone}-01`,
        quantity: transferQty,
        status: 'pending',
        priority: 'high',
        createdAt: new Date().toISOString(),
      };

      await db.replenishmentTasks.add(newTask);
      createdCount++;
    }

    if (createdCount > 0) {
      showMessage('success', `${createdCount} replenishment task(s) created`);
      await logAction(
        'REPLENISH_GENERATE',
        `Generated ${createdCount} replenishment tasks`,
        user?.displayName || 'System'
      );
    } else {
      showMessage('info', 'No new replenishment tasks needed — all caught up');
    }

    loadData();
  };

  const startTask = async (task: ReplenishmentTask) => {
    if (!task.id) return;
    await db.replenishmentTasks.update(task.id, {
      status: 'in_progress',
    });
    showMessage('info', `Task for ${task.sku} started`);
    await logAction(
      'REPLENISH_START',
      `Started replenishment task: ${task.sku} (${task.quantity} units) ${task.fromLocation} → ${task.toLocation}`,
      user?.displayName || 'Unknown'
    );
    loadData();
  };

  const completeTask = async (task: ReplenishmentTask) => {
    if (!task.id) return;

    // Update inventory: deduct from source, add to destination
    const fromItem = inventory.find(
      (i) => i.sku === task.sku && i.location === task.fromLocation
    );
    const toItem = inventory.find(
      (i) => i.sku === task.sku && i.location === task.toLocation
    );

    if (fromItem && fromItem.id) {
      const newStock = Math.max(0, (fromItem.stock || 0) - task.quantity);
      await db.inventory.update(fromItem.id, {
        stock: newStock,
        updatedAt: new Date().toISOString(),
      });
    }

    if (toItem && toItem.id) {
      const newStock = (toItem.stock || 0) + task.quantity;
      await db.inventory.update(toItem.id, {
        stock: newStock,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // If no existing item at destination, create one (or move the record if it was the only one)
      const anyExisting = inventory.find((i) => i.sku === task.sku);
      if (anyExisting) {
        await db.inventory.add({
          ...anyExisting,
          id: undefined,
          location: task.toLocation,
          stock: task.quantity,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    await db.replenishmentTasks.update(task.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    await logInventoryMovement(
      task.sku,
      'transfer',
      task.quantity,
      user?.displayName || 'Unknown',
      {
        fromLocation: task.fromLocation,
        toLocation: task.toLocation,
        note: `Replenishment task completed`,
      }
    );

    await logAction(
      'REPLENISH_COMPLETE',
      `Completed replenishment: ${task.sku} ${task.quantity} units ${task.fromLocation} → ${task.toLocation}`,
      user?.displayName || 'Unknown'
    );

    setConfirmComplete(null);
    showMessage('success', `Task completed — ${task.quantity}x ${task.sku} moved to ${task.toLocation}`);
    loadData();
  };

  const filteredTasks = tasks.filter(
    (t) =>
      t.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.fromLocation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.toLocation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedToday = tasks.filter(
    (t) =>
      t.status === 'completed' &&
      t.completedAt &&
      new Date(t.completedAt).toDateString() === new Date().toDateString()
  ).length;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30',
      in_progress: 'bg-accent-sky/20 text-accent-sky border-accent-sky/30',
      completed: 'bg-accent-green/20 text-accent-green border-accent-green/30',
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border ${styles[status] || styles.pending}`}
      >
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    return priority === 'high' ? (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-full bg-accent-red/20 text-accent-red">
        HIGH
      </span>
    ) : (
      <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-full bg-white/10 text-text-secondary">
        NORM
      </span>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Replenishment</h1>
            <p className="text-sm text-text-secondary mt-1">Auto-generate tasks, execute moves, and optimize slotting</p>
          </div>
          <motion.button
            onClick={generateTasks}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2 bg-accent-sky/20 text-accent-sky text-xs font-semibold rounded-md hover:bg-accent-sky/30 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            Generate Tasks
          </motion.button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <PackagePlus className="w-3.5 h-3.5 text-accent-yellow" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Pending</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{pendingCount}</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <PlayCircle className="w-3.5 h-3.5 text-accent-sky" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">In Progress</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{inProgressCount}</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-accent-green" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Completed Today</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{completedToday}</p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-accent-red" />
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Reorder Alerts</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{alerts.length}</p>
        </div>
      </div>

      {/* Message */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`mb-4 p-3 rounded-md text-xs border ${
              message.type === 'success'
                ? 'bg-accent-green/10 border-accent-green/20 text-accent-green'
                : message.type === 'info'
                  ? 'bg-accent-sky/10 border-accent-sky/20 text-accent-sky'
                  : 'bg-accent-red/10 border-accent-red/20 text-accent-red'
            }`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-white/[0.06]">
        {[
          { key: 'tasks' as const, label: 'Tasks', icon: ArrowRightLeft, count: tasks.filter((t) => t.status !== 'completed').length },
          { key: 'alerts' as const, label: 'Reorder Alerts', icon: AlertTriangle, count: alerts.length },
          { key: 'slotting' as const, label: 'Slotting', icon: LayoutGrid, count: suggestions.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent-sky text-accent-sky'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-[9px] bg-white/[0.08] text-text-secondary px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-accent-sky" />
                <h3 className="text-sm font-semibold text-text-primary">Replenishment Tasks</h3>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search SKU, location..."
                  className="bg-white/[0.03] border border-white/[0.08] rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-sky transition-colors w-48"
                />
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-10 h-10 text-accent-green mx-auto mb-3" />
                <p className="text-sm font-semibold text-text-primary">All caught up!</p>
                <p className="text-xs text-text-secondary mt-1">No replenishment tasks pending</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                      <th className="text-left py-2 px-2">SKU</th>
                      <th className="text-center py-2 px-2">From</th>
                      <th className="text-center py-2 px-2">To</th>
                      <th className="text-center py-2 px-2">Qty</th>
                      <th className="text-center py-2 px-2">Priority</th>
                      <th className="text-center py-2 px-2">Status</th>
                      <th className="text-right py-2 px-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2 px-2 text-xs font-mono text-text-primary">{task.sku}</td>
                        <td className="py-2 px-2 text-center text-[10px] font-mono text-text-secondary">{task.fromLocation}</td>
                        <td className="py-2 px-2 text-center text-[10px] font-mono text-accent-sky">{task.toLocation}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono font-semibold text-text-primary">{task.quantity}</td>
                        <td className="py-2 px-2 text-center">{getPriorityBadge(task.priority)}</td>
                        <td className="py-2 px-2 text-center">{getStatusBadge(task.status)}</td>
                        <td className="py-2 px-2 text-right">
                          {task.status === 'pending' && (
                            <motion.button
                              onClick={() => startTask(task)}
                              whileTap={{ scale: 0.95 }}
                              className="text-[10px] bg-accent-sky/20 text-accent-sky px-2.5 py-1 rounded font-semibold hover:bg-accent-sky/30 transition-colors"
                            >
                              Start
                            </motion.button>
                          )}
                          {task.status === 'in_progress' && (
                            <motion.button
                              onClick={() => setConfirmComplete(task)}
                              whileTap={{ scale: 0.95 }}
                              className="text-[10px] bg-accent-green/20 text-accent-green px-2.5 py-1 rounded font-semibold hover:bg-accent-green/30 transition-colors"
                            >
                              Complete
                            </motion.button>
                          )}
                          {task.status === 'completed' && (
                            <span className="text-[10px] text-text-secondary/50 flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Done
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertOctagon className="w-4 h-4 text-accent-red" />
              <h3 className="text-sm font-semibold text-text-primary">Reorder Alerts</h3>
              <span className="ml-auto text-[10px] text-text-secondary">
                {alerts.filter((a) => a.urgency === 'critical').length} critical
              </span>
            </div>

            {alerts.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-10 h-10 text-accent-green mx-auto mb-3" />
                <p className="text-sm font-semibold text-text-primary">Stock levels healthy</p>
                <p className="text-xs text-text-secondary mt-1">No items below reorder point</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                      <th className="text-left py-2 px-2">SKU</th>
                      <th className="text-left py-2 px-2">Product</th>
                      <th className="text-center py-2 px-2">Current</th>
                      <th className="text-center py-2 px-2">Reorder Pt</th>
                      <th className="text-center py-2 px-2">Suggested Qty</th>
                      <th className="text-center py-2 px-2">Urgency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${
                          item.urgency === 'critical' ? 'bg-accent-red/[0.03]' : ''
                        }`}
                      >
                        <td className="py-2 px-2 text-xs font-mono text-text-primary">{item.sku}</td>
                        <td className="py-2 px-2 text-xs text-text-primary max-w-[200px] truncate">{item.product}</td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`text-xs font-mono font-semibold ${
                              item.urgency === 'critical' ? 'text-accent-red' : 'text-accent-yellow'
                            }`}
                          >
                            {item.stock}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-text-secondary">{item.reorderPoint}</td>
                        <td className="py-2 px-2 text-center text-xs font-mono text-text-primary">{item.suggestedQty}</td>
                        <td className="py-2 px-2 text-center">
                          {item.urgency === 'critical' ? (
                            <span className="text-[9px] bg-accent-red/20 text-accent-red px-2 py-0.5 rounded-full font-semibold uppercase">
                              Critical
                            </span>
                          ) : (
                            <span className="text-[9px] bg-accent-yellow/20 text-accent-yellow px-2 py-0.5 rounded-full font-semibold uppercase">
                              Warning
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slotting Tab */}
      {activeTab === 'slotting' && (
        <div className="space-y-4">
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <LayoutGrid className="w-4 h-4 text-accent-sky" />
              <h3 className="text-sm font-semibold text-text-primary">Slotting Suggestions</h3>
              <span className="ml-auto text-[10px] text-text-secondary">Based on velocity</span>
            </div>

            {suggestions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-10 h-10 text-accent-green mx-auto mb-3" />
                <p className="text-sm font-semibold text-text-primary">Slotting optimized</p>
                <p className="text-xs text-text-secondary mt-1">All items in recommended zones</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                      <th className="text-left py-2 px-2">SKU</th>
                      <th className="text-left py-2 px-2">Product</th>
                      <th className="text-center py-2 px-2">Current Zone</th>
                      <th className="text-center py-2 px-2">Suggested</th>
                      <th className="text-left py-2 px-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s) => (
                      <tr
                        key={s.sku}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2 px-2 text-xs font-mono text-text-primary">{s.sku}</td>
                        <td className="py-2 px-2 text-xs text-text-primary max-w-[200px] truncate">{s.product}</td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-[10px] font-mono bg-white/[0.05] text-text-secondary px-2 py-0.5 rounded">
                            {s.currentZone}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-[10px] font-mono bg-accent-sky/10 text-accent-sky px-2 py-0.5 rounded">
                            {s.suggestedZone}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs text-text-secondary">{s.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Zone Reference */}
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-accent-sky" />
              <h3 className="text-sm font-semibold text-text-primary">Zone Velocity Map</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {zones
                .filter((z) => z.zone !== 'E1')
                .sort((a, b) => a.zone.localeCompare(b.zone))
                .map((z) => (
                  <div
                    key={z.zone}
                    className={`p-2 rounded-md border text-center ${
                      z.velocityTarget === 'high'
                        ? 'bg-accent-sky/5 border-accent-sky/20'
                        : z.velocityTarget === 'medium'
                          ? 'bg-accent-yellow/5 border-accent-yellow/20'
                          : 'bg-white/[0.02] border-white/[0.06]'
                    }`}
                  >
                    <span className="text-xs font-mono font-semibold text-text-primary">{z.zone}</span>
                    <p className="text-[10px] text-text-secondary capitalize">{z.velocityTarget}</p>
                    <p className="text-[9px] text-text-secondary/60">{z.category}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Complete Modal */}
      <AnimatePresence>
        {confirmComplete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmComplete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel rounded-lg p-6 max-w-sm w-full border border-white/[0.08]"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-primary">Confirm Completion</h3>
                <button onClick={() => setConfirmComplete(null)} className="text-text-secondary hover:text-text-primary">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">SKU</span>
                  <span className="font-mono text-text-primary">{confirmComplete.sku}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">Quantity</span>
                  <span className="font-mono text-text-primary">{confirmComplete.quantity}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">From</span>
                  <span className="font-mono text-text-secondary">{confirmComplete.fromLocation}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">To</span>
                  <span className="font-mono text-accent-sky">{confirmComplete.toLocation}</span>
                </div>
              </div>

              <p className="text-[10px] text-text-secondary mb-4">
                This will update inventory and log a transfer movement. Ensure physical stock has been moved.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmComplete(null)}
                  className="flex-1 py-2 text-xs font-semibold text-text-secondary bg-white/[0.03] rounded-md hover:bg-white/[0.06] transition-colors"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={() => completeTask(confirmComplete)}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 py-2 text-xs font-semibold text-void bg-accent-green rounded-md hover:bg-accent-green/90 transition-colors"
                >
                  Confirm
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
