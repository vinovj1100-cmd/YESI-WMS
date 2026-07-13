import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import KineticCounter from '@/components/KineticCounter';
import StatusBadge from '@/components/StatusBadge';
import {
  Users, Trophy, Timer, Target, TrendingUp, AlertTriangle,
  CheckCircle, MapPin, Footprints, Activity, BarChart3, Star, Zap,
  ChevronUp, ChevronDown, X, User, Calendar, Package,
  RefreshCw, Filter, Search, ArrowUpDown, UserCheck, Clock
} from 'lucide-react';
import type { WorkerPerformance, WorkerTask, User as WorkerUser } from '@/lib/db';

type SortField = 'displayName' | 'role' | 'skillLevel' | 'uph' | 'picksPerHour' | 'accuracy' | 'tasksCompleted' | 'distanceWalked' | 'errors';
type SortDir = 'asc' | 'desc';

interface WorkerSummary {
  workerId: string;
  displayName: string;
  role: string;
  skillLevel: number;
  currentZone?: string;
  uph: number;
  picksPerHour: number;
  accuracy: number;
  tasksCompleted: number;
  distanceWalked: number;
  errors: number;
  returnsCaused: number;
  pickCount: number;
  packCount: number;
  receiveCount: number;
  putawayCount: number;
  avgTaskTime: number;
  performanceHistory: WorkerPerformance[];
}

const taskTypeLabels: Record<string, string> = {
  pick: 'Pick',
  pack: 'Pack',
  receive: 'Receive',
  putaway: 'Putaway',
  cycle_count: 'Cycle Count',
  replenish: 'Replenish',
  ship: 'Ship',
  label: 'Label',
  audit: 'Audit',
};

const zoneAdjacency: Record<string, string[]> = {
  A1: ['A2', 'B1', 'B2'],
  A2: ['A1', 'B1', 'B2'],
  B1: ['A1', 'A2', 'B2', 'C1'],
  B2: ['A1', 'A2', 'B1', 'C2', 'C3'],
  C1: ['B1', 'C2', 'D1'],
  C2: ['B2', 'C1', 'C3', 'D1', 'D2'],
  C3: ['B2', 'C2', 'D2'],
  D1: ['C1', 'C2', 'D2'],
  D2: ['C2', 'C3', 'D1'],
  E1: ['D1', 'D2'],
};

function getZoneDistance(from: string, to: string): number {
  if (from === to) return 0;
  const adj = zoneAdjacency[from] || [];
  if (adj.includes(to)) return 1;
  return 2;
}

function formatElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  const s = Math.floor((minutes * 60) % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function SkillStars({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < level ? 'text-accent-yellow fill-accent-yellow' : 'text-white/20'}`}
        />
      ))}
    </div>
  );
}

function SimpleBarChart({ data, maxValue, colorClass, labelKey, valueKey }: {
  data: any[];
  maxValue: number;
  colorClass: string;
  labelKey: string;
  valueKey: string;
}) {
  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const pct = maxValue > 0 ? (item[valueKey] / maxValue) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-20 text-[10px] text-text-secondary truncate text-right">{item[labelKey]}</div>
            <div className="flex-1 h-5 bg-white/[0.04] rounded-md overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
                className={`h-full ${colorClass} rounded-md`}
              />
              <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white">
                {item[valueKey]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LaborManagement() {
  const { user } = useAuth();
  const { addNotification } = useAppStore();
  const [workers, setWorkers] = useState<WorkerUser[]>([]);
  const [performanceData, setPerformanceData] = useState<WorkerPerformance[]>([]);
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField>('uph');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<WorkerSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'assign' | 'monitor' | 'charts'>('leaderboard');
  const [assignFilter, setAssignFilter] = useState<'all' | 'pick' | 'pack' | 'receive' | 'putaway'>('all');

  const loadData = useCallback(async () => {
    setRefreshing(true);
    const [allWorkers, allPerf, allTasks] = await Promise.all([
      db.users.toArray(),
      db.workerPerformance.toArray(),
      db.workerTasks.toArray(),
    ]);
    setWorkers(allWorkers);
    setPerformanceData(allPerf);
    setTasks(allTasks);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const workerSummaries = useMemo((): WorkerSummary[] => {
    const last7Days = performanceData.filter(p => {
      const d = new Date(p.date);
      const today = new Date();
      const diff = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    });

    return workers.map(w => {
      const perf = last7Days.filter(p => p.workerId === w.username.toLowerCase().replace(/\s/g, ''));
      const agg = perf.reduce((acc, p) => ({
        uph: acc.uph + p.uph,
        picksPerHour: acc.picksPerHour + p.picksPerHour,
        accuracy: acc.accuracy + p.accuracy,
        tasksCompleted: acc.tasksCompleted + p.tasksCompleted,
        distanceWalked: acc.distanceWalked + p.distanceWalked,
        errors: acc.errors + p.errors,
        returnsCaused: acc.returnsCaused + p.returnsCaused,
        pickCount: acc.pickCount + p.pickCount,
        packCount: acc.packCount + p.packCount,
        receiveCount: acc.receiveCount + p.receiveCount,
        putawayCount: acc.putawayCount + p.putawayCount,
        avgTaskTime: acc.avgTaskTime + p.avgTaskTime,
        count: acc.count + 1,
      }), {
        uph: 0, picksPerHour: 0, accuracy: 0, tasksCompleted: 0,
        distanceWalked: 0, errors: 0, returnsCaused: 0,
        pickCount: 0, packCount: 0, receiveCount: 0, putawayCount: 0,
        avgTaskTime: 0, count: 0,
      });

      const count = agg.count || 1;
      return {
        workerId: w.username,
        displayName: w.displayName,
        role: w.role,
        skillLevel: w.skillLevel || 1,
        currentZone: w.currentZone,
        uph: Math.round(agg.uph / count),
        picksPerHour: Math.round(agg.picksPerHour / count),
        accuracy: Math.round(agg.accuracy / count),
        tasksCompleted: agg.tasksCompleted,
        distanceWalked: agg.distanceWalked,
        errors: agg.errors,
        returnsCaused: agg.returnsCaused,
        pickCount: agg.pickCount,
        packCount: agg.packCount,
        receiveCount: agg.receiveCount,
        putawayCount: agg.putawayCount,
        avgTaskTime: Math.round(agg.avgTaskTime / count * 10) / 10,
        performanceHistory: perf.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      };
    }).filter(w => w.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || w.workerId.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [workers, performanceData, searchQuery]);

  const sortedWorkers = useMemo(() => {
    const sorted = [...workerSummaries];
    sorted.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [workerSummaries, sortField, sortDir]);

  const dashboardStats = useMemo(() => {
    if (workerSummaries.length === 0) return { avgUph: 0, totalPicks: 0, avgAccuracy: 0, topPerformer: '-' };
    const avgUph = Math.round(workerSummaries.reduce((s, w) => s + w.uph, 0) / workerSummaries.length);
    const totalPicks = workerSummaries.reduce((s, w) => s + w.pickCount, 0);
    const avgAccuracy = Math.round(workerSummaries.reduce((s, w) => s + w.accuracy, 0) / workerSummaries.length);
    const top = [...workerSummaries].sort((a, b) => b.uph - a.uph)[0];
    return { avgUph, totalPicks, avgAccuracy, topPerformer: top?.displayName || '-' };
  }, [workerSummaries]);

  const pendingTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'pending' && (assignFilter === 'all' || t.type === assignFilter));
  }, [tasks, assignFilter]);

  const inProgressTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'in_progress');
  }, [tasks]);

  const chartData = useMemo(() => {
    const picksByWorker = workerSummaries.map(w => ({ label: w.displayName, value: w.picksPerHour })).sort((a, b) => b.value - a.value).slice(0, 8);
    const accuracyByWorker = workerSummaries.map(w => ({ label: w.displayName, value: w.accuracy })).sort((a, b) => b.value - a.value).slice(0, 8);
    const taskByType = [
      { label: 'Pick', value: workerSummaries.reduce((s, w) => s + w.pickCount, 0) },
      { label: 'Pack', value: workerSummaries.reduce((s, w) => s + w.packCount, 0) },
      { label: 'Receive', value: workerSummaries.reduce((s, w) => s + w.receiveCount, 0) },
      { label: 'Putaway', value: workerSummaries.reduce((s, w) => s + w.putawayCount, 0) },
    ];
    return { picksByWorker, accuracyByWorker, taskByType };
  }, [workerSummaries]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleAssignTask = async (task: WorkerTask, worker: WorkerSummary) => {
    await db.workerTasks.update(task.id!, { assignedTo: worker.workerId, status: 'in_progress' });
    await logAction('TASK_ASSIGNED', `Task ${task.type} assigned to ${worker.displayName}`, user?.displayName || 'system');
    addNotification({ title: 'Task Assigned', message: `${taskTypeLabels[task.type]} assigned to ${worker.displayName}`, type: 'success' });
    loadData();
  };

  const getBestWorkerForTask = (task: WorkerTask): WorkerSummary | null => {
    const taskZone = task.fromLocation?.split('-')[0] || task.toLocation?.split('-')[0] || 'A1';
    const available = workerSummaries.filter(w => w.role !== 'admin');
    if (available.length === 0) return null;
    const scored = available.map(w => {
      const zoneDist = getZoneDistance(w.currentZone || 'A1', taskZone);
      const skillMatch = w.skillLevel * 10;
      const loadPenalty = inProgressTasks.filter(t => t.assignedTo === w.workerId).length * 20;
      const score = skillMatch - zoneDist * 15 - loadPenalty;
      return { worker: w, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.worker || null;
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors"
    >
      {label}
      {sortField === field ? (
        sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-void">
        <div className="w-8 h-8 border-2 border-accent-sky border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">Labor Management</h1>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-green" />
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1">Worker performance, task assignment, and real-time monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className={`p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary hover:text-text-primary transition-all ${refreshing ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }} className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Avg UPH</span>
            <Zap className="w-4 h-4 text-accent-sky" />
          </div>
          <KineticCounter value={dashboardStats.avgUph} size={40} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Total Picks (7d)</span>
            <Package className="w-4 h-4 text-accent-green" />
          </div>
          <KineticCounter value={dashboardStats.totalPicks} size={40} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Accuracy Rate</span>
            <Target className="w-4 h-4 text-accent-yellow" />
          </div>
          <div className="text-3xl font-bold text-accent-green">{dashboardStats.avgAccuracy}%</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest">Top Performer</span>
            <Trophy className="w-4 h-4 text-accent-sky" />
          </div>
          <div className="text-lg font-bold text-text-primary truncate">{dashboardStats.topPerformer}</div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 bg-white/[0.03] rounded-lg p-1 w-fit">
        {[
          { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
          { key: 'assign', label: 'Task Assign', icon: UserCheck },
          { key: 'monitor', label: 'Live Monitor', icon: Activity },
          { key: 'charts', label: 'KPI Charts', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.key ? 'bg-accent-sky text-void' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      <AnimatePresence mode="wait">
        {activeTab === 'leaderboard' && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-panel rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent-sky" />
                <h3 className="text-sm font-semibold text-text-primary">Worker Leaderboard</h3>
                <span className="text-[10px] text-text-secondary">{sortedWorkers.length} workers</span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search worker..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-white/[0.03] border border-white/[0.08] rounded-md text-xs text-text-primary pl-8 pr-3 py-1.5 w-48 focus:outline-none focus:border-accent-sky/50"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="pb-2 pl-2 text-[10px] uppercase tracking-wider text-text-secondary font-medium">Rank</th>
                    <th className="pb-2"><SortHeader field="displayName" label="Worker" /></th>
                    <th className="pb-2"><SortHeader field="role" label="Role" /></th>
                    <th className="pb-2"><SortHeader field="skillLevel" label="Skill" /></th>
                    <th className="pb-2"><SortHeader field="uph" label="UPH" /></th>
                    <th className="pb-2"><SortHeader field="picksPerHour" label="Picks/hr" /></th>
                    <th className="pb-2"><SortHeader field="accuracy" label="Accuracy" /></th>
                    <th className="pb-2"><SortHeader field="tasksCompleted" label="Tasks" /></th>
                    <th className="pb-2"><SortHeader field="distanceWalked" label="Distance" /></th>
                    <th className="pb-2"><SortHeader field="errors" label="Errors" /></th>
                    <th className="pb-2 pr-2 text-right text-[10px] uppercase tracking-wider text-text-secondary font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWorkers.map((w, idx) => {
                    const isTop3 = idx < 3;
                    const rankColor = idx === 0 ? 'text-accent-sky' : idx === 1 ? 'text-accent-yellow' : idx === 2 ? 'text-gray-400' : 'text-text-secondary';
                    return (
                      <motion.tr
                        key={w.workerId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        onClick={() => setSelectedWorker(w)}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.04] cursor-pointer transition-colors ${isTop3 ? 'bg-accent-sky/[0.03]' : ''}`}
                      >
                        <td className="py-2.5 pl-2">
                          <div className="flex items-center gap-1">
                            {idx < 3 && <Trophy className={`w-3.5 h-3.5 ${rankColor}`} />}
                            <span className={`text-xs font-bold ${rankColor}`}>{idx + 1}</span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-accent-sky/20 flex items-center justify-center text-[10px] font-bold text-accent-sky">
                              {w.displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-text-primary">{w.displayName}</div>
                              <div className="text-[10px] text-text-secondary font-mono">{w.workerId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-text-secondary capitalize">{w.role}</span></td>
                        <td className="py-2.5"><SkillStars level={w.skillLevel} /></td>
                        <td className="py-2.5"><span className="text-xs font-mono font-bold text-accent-sky">{w.uph}</span></td>
                        <td className="py-2.5"><span className="text-xs font-mono text-text-primary">{w.picksPerHour}</span></td>
                        <td className="py-2.5">
                          <span className={`text-xs font-bold ${w.accuracy >= 98 ? 'text-accent-green' : w.accuracy >= 95 ? 'text-accent-yellow' : 'text-accent-red'}`}>
                            {w.accuracy}%
                          </span>
                        </td>
                        <td className="py-2.5"><span className="text-xs font-mono text-text-primary">{w.tasksCompleted}</span></td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                            <Footprints className="w-3 h-3" />
                            {(w.distanceWalked / 1000).toFixed(1)}km
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs font-mono ${w.errors === 0 ? 'text-accent-green' : 'text-accent-red'}`}>{w.errors}</span>
                        </td>
                        <td className="py-2.5 pr-2 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedWorker(w); }}
                            className="text-[10px] text-accent-sky hover:underline"
                          >
                            View
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
              {sortedWorkers.length === 0 && (
                <div className="text-center py-8 text-text-secondary text-xs">No workers found</div>
              )}
            </div>
          </motion.div>
        )}

        {/* Task Assignment */}
        {activeTab === 'assign' && (
          <motion.div
            key="assign"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-4 h-4 text-text-secondary" />
              <div className="flex gap-1">
                {['all', 'pick', 'pack', 'receive', 'putaway'].map(f => (
                  <button
                    key={f}
                    onClick={() => setAssignFilter(f as any)}
                    className={`px-2 py-1 rounded text-[10px] font-medium capitalize transition-colors ${
                      assignFilter === f ? 'bg-accent-sky text-void' : 'bg-white/[0.04] text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[10px] text-text-secondary">{pendingTasks.length} pending tasks</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {pendingTasks.map((task, i) => {
                const bestWorker = getBestWorkerForTask(task);
                const taskZone = task.fromLocation?.split('-')[0] || task.toLocation?.split('-')[0] || 'A1';
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="glass-panel rounded-lg p-3 border border-white/[0.06] hover:border-accent-sky/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${task.priority === 'urgent' ? 'bg-accent-red animate-pulse' : task.priority === 'high' ? 'bg-accent-yellow' : 'bg-accent-green'}`} />
                        <span className="text-xs font-semibold text-text-primary">{taskTypeLabels[task.type] || task.type}</span>
                        <StatusBadge status={task.status} />
                      </div>
                      <span className="text-[10px] text-text-secondary font-mono">#{task.id}</span>
                    </div>
                    <div className="space-y-1 mb-3">
                      {task.orderId && <div className="text-[10px] text-text-secondary">Order: <span className="font-mono text-text-primary">{task.orderId}</span></div>}
                      {task.sku && <div className="text-[10px] text-text-secondary">SKU: <span className="font-mono text-text-primary">{task.sku}</span></div>}
                      <div className="flex items-center gap-3 text-[10px] text-text-secondary">
                        {task.fromLocation && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />From: {task.fromLocation}</span>
                        )}
                        {task.toLocation && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />To: {task.toLocation}</span>
                        )}
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" />Qty: {task.quantity}</span>
                      </div>
                      {task.estimatedTime && (
                        <div className="text-[10px] text-text-secondary flex items-center gap-1">
                          <Timer className="w-3 h-3" />Est: {task.estimatedTime} min
                        </div>
                      )}
                    </div>

                    <div className="border-t border-white/[0.06] pt-2">
                      <div className="text-[10px] text-text-secondary mb-1.5 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-accent-sky" />
                        Recommended: {bestWorker ? (
                          <span className="text-text-primary font-medium">
                            {bestWorker.displayName}
                            {bestWorker.currentZone && (
                              <span className="text-text-secondary font-normal"> ({bestWorker.currentZone} → {taskZone})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-text-secondary">No available worker</span>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {workerSummaries.filter(w => w.role !== 'admin').map(w => {
                          const dist = getZoneDistance(w.currentZone || 'A1', taskZone);
                          const isBest = bestWorker?.workerId === w.workerId;
                          return (
                            <button
                              key={w.workerId}
                              onClick={() => handleAssignTask(task, w)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                                isBest
                                  ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30'
                                  : 'bg-white/[0.04] text-text-secondary hover:text-text-primary border border-transparent'
                              }`}
                              title={`${w.displayName} — Zone ${w.currentZone || '?'} (distance ${dist})`}
                            >
                              <User className="w-3 h-3" />
                              {w.displayName}
                              {dist === 0 && <span className="text-[9px] bg-accent-green/20 text-accent-green px-1 rounded">same</span>}
                              {dist === 1 && <span className="text-[9px] bg-accent-yellow/20 text-accent-yellow px-1 rounded">near</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {pendingTasks.length === 0 && (
                <div className="col-span-2 text-center py-12 text-text-secondary text-xs glass-panel rounded-lg">
                  <CheckCircle className="w-8 h-8 text-accent-green mx-auto mb-2" />
                  All tasks are assigned or completed
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Live Monitor */}
        {activeTab === 'monitor' && (
          <motion.div
            key="monitor"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-panel rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-accent-green animate-pulse" />
                <h3 className="text-sm font-semibold text-text-primary">Real-time Task Monitor</h3>
                <span className="text-[10px] text-text-secondary">{inProgressTasks.length} active</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                <Clock className="w-3 h-3" />
                Live
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {inProgressTasks.map((task, i) => {
                const assignedWorker = workers.find(w => w.username === task.assignedTo);
                const started = task.createdAt ? new Date(task.createdAt).getTime() : Date.now();
                const elapsedMin = (Date.now() - started) / (1000 * 60);
                const remaining = task.estimatedTime ? Math.max(0, task.estimatedTime - elapsedMin) : 0;
                const progress = task.estimatedTime && task.estimatedTime > 0
                  ? Math.min(100, (elapsedMin / task.estimatedTime) * 100)
                  : 0;
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${task.priority === 'urgent' ? 'bg-accent-red' : 'bg-accent-yellow'}`} />
                        <span className="text-xs font-semibold text-text-primary">{taskTypeLabels[task.type] || task.type}</span>
                        <span className="text-[10px] text-text-secondary font-mono">#{task.id}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-text-secondary">
                        <User className="w-3 h-3" />
                        {assignedWorker?.displayName || task.assignedTo}
                      </div>
                    </div>
                    <div className="space-y-1 mb-2">
                      {task.sku && <div className="text-[10px] text-text-secondary font-mono">{task.sku}</div>}
                      <div className="flex items-center gap-2 text-[10px] text-text-secondary">
                        {task.fromLocation && <span>From: {task.fromLocation}</span>}
                        {task.toLocation && <span>To: {task.toLocation}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] mb-2">
                      <span className="flex items-center gap-1 text-accent-yellow">
                        <Timer className="w-3 h-3" />
                        {formatElapsed(elapsedMin)}
                      </span>
                      {task.estimatedTime && (
                        <span className="flex items-center gap-1 text-text-secondary">
                          <Target className="w-3 h-3" />
                          Est: {remaining > 0 ? `${Math.round(remaining)}m left` : 'Overdue'}
                        </span>
                      )}
                    </div>
                    {task.estimatedTime && (
                      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${progress >= 100 ? 'bg-accent-red' : 'bg-accent-green'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    )}
                  </motion.div>
                );
              })}
              {inProgressTasks.length === 0 && (
                <div className="col-span-2 text-center py-12 text-text-secondary text-xs">
                  <CheckCircle className="w-8 h-8 text-accent-green mx-auto mb-2" />
                  No tasks in progress
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* KPI Charts */}
        {activeTab === 'charts' && (
          <motion.div
            key="charts"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          >
            <div className="glass-panel rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-accent-sky" />
                <h3 className="text-sm font-semibold text-text-primary">Picks per Hour</h3>
              </div>
              <SimpleBarChart
                data={chartData.picksByWorker}
                maxValue={Math.max(...chartData.picksByWorker.map(d => d.value), 1)}
                colorClass="bg-accent-sky"
                labelKey="label"
                valueKey="value"
              />
            </div>
            <div className="glass-panel rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-accent-green" />
                <h3 className="text-sm font-semibold text-text-primary">Accuracy %</h3>
              </div>
              <SimpleBarChart
                data={chartData.accuracyByWorker}
                maxValue={100}
                colorClass="bg-accent-green"
                labelKey="label"
                valueKey="value"
              />
            </div>
            <div className="glass-panel rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-4 h-4 text-accent-yellow" />
                <h3 className="text-sm font-semibold text-text-primary">Tasks by Type</h3>
              </div>
              <SimpleBarChart
                data={chartData.taskByType}
                maxValue={Math.max(...chartData.taskByType.map(d => d.value), 1)}
                colorClass="bg-accent-yellow"
                labelKey="label"
                valueKey="value"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Worker Detail Modal */}
      <AnimatePresence>
        {selectedWorker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedWorker(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="glass-panel rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-white/[0.1]"
            >
              {/* Modal Header */}
              <div className="sticky top-0 bg-void/90 backdrop-blur-md border-b border-white/[0.08] p-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-sky/20 flex items-center justify-center text-sm font-bold text-accent-sky">
                    {selectedWorker.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-text-primary">{selectedWorker.displayName}</h2>
                    <div className="flex items-center gap-2 text-[10px] text-text-secondary">
                      <span className="capitalize">{selectedWorker.role}</span>
                      <span>•</span>
                      <span className="font-mono">{selectedWorker.workerId}</span>
                      {selectedWorker.currentZone && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{selectedWorker.currentZone}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedWorker(null)}
                  className="p-1.5 rounded-lg hover:bg-white/[0.08] text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Skill & Quick Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Skill Level</div>
                    <SkillStars level={selectedWorker.skillLevel} />
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">UPH</div>
                    <div className="text-xl font-bold text-accent-sky font-mono">{selectedWorker.uph}</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Accuracy</div>
                    <div className="text-xl font-bold text-accent-green font-mono">{selectedWorker.accuracy}%</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                    <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-1">Errors</div>
                    <div className={`text-xl font-bold font-mono ${selectedWorker.errors === 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      {selectedWorker.errors}
                    </div>
                  </div>
                </div>

                {/* Performance History Table */}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-accent-sky" />
                    Performance History (Last 7 Days)
                  </h3>
                  {selectedWorker.performanceHistory.length === 0 ? (
                    <p className="text-xs text-text-secondary py-4 text-center">No performance data</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/[0.06]">
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">Date</th>
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">Picks</th>
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">Picks/hr</th>
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">UPH</th>
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">Accuracy</th>
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">Tasks</th>
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">Errors</th>
                            <th className="pb-2 text-[10px] uppercase text-text-secondary font-medium">Returns</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedWorker.performanceHistory.map((p, i) => (
                            <motion.tr
                              key={p.id || i}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.03 }}
                              className="border-b border-white/[0.04]"
                            >
                              <td className="py-2 text-xs text-text-primary font-mono">{p.date}</td>
                              <td className="py-2 text-xs font-mono text-text-primary">{p.picksCompleted}</td>
                              <td className="py-2 text-xs font-mono text-accent-sky">{p.picksPerHour}</td>
                              <td className="py-2 text-xs font-mono text-text-primary">{p.uph}</td>
                              <td className="py-2 text-xs font-bold text-accent-green">{p.accuracy}%</td>
                              <td className="py-2 text-xs font-mono text-text-primary">{p.tasksCompleted}</td>
                              <td className="py-2 text-xs font-mono text-accent-red">{p.errors}</td>
                              <td className="py-2 text-xs font-mono text-accent-yellow">{p.returnsCaused}</td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Task Completion Timeline */}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-accent-green" />
                    Task Completion Timeline
                  </h3>
                  <div className="space-y-2">
                    {selectedWorker.performanceHistory.slice(0, 5).map((p, i) => {
                      const total = p.pickCount + p.packCount + p.receiveCount + p.putawayCount;
                      return (
                        <div key={i} className="bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.06]">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-text-secondary font-mono">{p.date}</span>
                            <span className="text-[10px] text-text-secondary">{total} tasks</span>
                          </div>
                          <div className="flex h-2 rounded-full overflow-hidden">
                            {p.pickCount > 0 && (
                              <div className="bg-accent-sky h-full" style={{ width: `${total > 0 ? (p.pickCount / total) * 100 : 0}%` }} />
                            )}
                            {p.packCount > 0 && (
                              <div className="bg-accent-yellow h-full" style={{ width: `${total > 0 ? (p.packCount / total) * 100 : 0}%` }} />
                            )}
                            {p.receiveCount > 0 && (
                              <div className="bg-accent-green h-full" style={{ width: `${total > 0 ? (p.receiveCount / total) * 100 : 0}%` }} />
                            )}
                            {p.putawayCount > 0 && (
                              <div className="bg-blue-500 h-full" style={{ width: `${total > 0 ? (p.putawayCount / total) * 100 : 0}%` }} />
                            )}
                          </div>
                          <div className="flex gap-3 mt-1.5 flex-wrap">
                            <span className="text-[10px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent-sky" />Pick {p.pickCount}</span>
                            <span className="text-[10px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent-yellow" />Pack {p.packCount}</span>
                            <span className="text-[10px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent-green" />Receive {p.receiveCount}</span>
                            <span className="text-[10px] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Putaway {p.putawayCount}</span>
                          </div>
                        </div>
                      );
                    })}
                    {selectedWorker.performanceHistory.length === 0 && (
                      <p className="text-xs text-text-secondary py-4 text-center">No timeline data</p>
                    )}
                  </div>
                </div>

                {/* Error Log */}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-accent-red" />
                    Error Log
                  </h3>
                  {selectedWorker.errors === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-accent-green bg-accent-green/5 border border-accent-green/10 rounded-lg p-3">
                      <CheckCircle className="w-4 h-4" />
                      No errors recorded. Excellent quality record!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedWorker.performanceHistory.filter(p => p.errors > 0).map((p, i) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 bg-accent-red/5 border border-accent-red/10 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-accent-red shrink-0" />
                          <div className="flex-1">
                            <div className="text-xs text-text-primary">{p.errors} error{p.errors > 1 ? 's' : ''} on {p.date}</div>
                            <div className="text-[10px] text-text-secondary">{p.returnsCaused} return(s) caused</div>
                          </div>
                          <div className="text-[10px] text-accent-red font-mono">{p.accuracy}% accuracy</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
