import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import {
  Truck, Calendar, Clock, CheckCircle2, AlertTriangle,
  Plus, MapPin, Package, RefreshCw, X, LogIn,
} from 'lucide-react';
import type { DockAppointment } from '@/lib/db';

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  scheduled: { color: 'text-accent-sky', bg: 'bg-accent-sky/10', label: 'Scheduled' },
  checked_in: { color: 'text-accent-yellow', bg: 'bg-accent-yellow/10', label: 'Checked In' },
  unloading: { color: 'text-accent-sky', bg: 'bg-accent-sky/10', label: 'Unloading' },
  completed: { color: 'text-accent-green', bg: 'bg-accent-green/10', label: 'Completed' },
  no_show: { color: 'text-accent-red', bg: 'bg-accent-red/10', label: 'No Show' },
  cancelled: { color: 'text-text-secondary', bg: 'bg-white/[0.04]', label: 'Cancelled' },
};

const DOCKS = ['DOCK-01', 'DOCK-02', 'DOCK-03', 'DOCK-04'];

export default function DockManagement() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<DockAppointment[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<'today' | 'upcoming' | 'all'>('today');
  const [form, setForm] = useState({
    supplier: '', poNumber: '', dockNumber: 'DOCK-01', scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '09:00', estimatedDuration: 60, carrier: '', palletCount: 0, asnNumber: '',
  });

  const loadAppointments = useCallback(async () => {
    const all = await db.dockAppointments.toArray();
    setAppointments(all.sort((a, b) => {
      const dateA = `${a.scheduledDate}T${a.scheduledTime}`;
      const dateB = `${b.scheduledDate}T${b.scheduledTime}`;
      return dateA.localeCompare(dateB);
    }));
  }, []);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);

  const today = new Date().toISOString().split('T')[0];
  const filtered = appointments.filter(a => {
    if (filter === 'today') return a.scheduledDate.startsWith(today);
    if (filter === 'upcoming') return a.scheduledDate >= today && a.status !== 'completed' && a.status !== 'cancelled';
    return true;
  });

  const dockUtilization = DOCKS.map(dock => {
    const todayAppts = appointments.filter(a => a.scheduledDate.startsWith(today) && a.dockNumber === dock);
    const active = todayAppts.filter(a => a.status === 'checked_in' || a.status === 'unloading');
    return { dock, total: todayAppts.length, active: active.length, occupied: active.length > 0 };
  });

  const updateStatus = async (appt: DockAppointment, status: DockAppointment['status']) => {
    const updates: Partial<DockAppointment> = { status };
    if (status === 'checked_in') updates.checkedInAt = new Date().toISOString();
    if (status === 'completed') updates.completedAt = new Date().toISOString();
    await db.dockAppointments.update(appt.id!, updates);
    await logAction('DOCK_STATUS', `${appt.appointmentId}: ${appt.status} → ${status}`, user?.displayName || 'system');
    setMessage({ type: 'success', text: `${appt.appointmentId} updated to ${status}` });
    loadAppointments();
  };

  const createAppointment = async () => {
    if (!form.supplier) {
      setMessage({ type: 'error', text: 'Supplier is required' });
      return;
    }
    const id = `DOCK-${Date.now().toString().slice(-6)}`;
    await db.dockAppointments.add({
      appointmentId: id,
      supplier: form.supplier,
      poNumber: form.poNumber || undefined,
      dockNumber: form.dockNumber,
      scheduledDate: form.scheduledDate,
      scheduledTime: form.scheduledTime,
      estimatedDuration: form.estimatedDuration,
      status: 'scheduled',
      carrier: form.carrier || undefined,
      palletCount: form.palletCount || undefined,
      asnNumber: form.asnNumber || undefined,
      operator: user?.displayName || 'system',
      createdAt: new Date().toISOString(),
    });
    await logAction('DOCK_CREATE', `Created appointment ${id} for ${form.supplier}`, user?.displayName || 'system');
    setMessage({ type: 'success', text: `Appointment ${id} scheduled` });
    setShowCreate(false);
    setForm({ supplier: '', poNumber: '', dockNumber: 'DOCK-01', scheduledDate: today, scheduledTime: '09:00', estimatedDuration: 60, carrier: '', palletCount: 0, asnNumber: '' });
    loadAppointments();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-accent-sky" />
            Dock & Yard Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">Inbound dock scheduling, ASN tracking & yard utilization</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl text-sm font-medium bg-accent-sky/10 text-accent-sky border border-accent-sky/20 hover:bg-accent-sky/20 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Schedule Appointment
          </button>
          <button onClick={loadAppointments} className="px-4 py-2 rounded-xl text-sm text-text-secondary border border-white/[0.08] hover:bg-white/[0.04] flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {message && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`px-4 py-3 rounded-xl text-sm border ${message.type === 'success' ? 'bg-accent-green/10 border-accent-green/20 text-accent-green' : 'bg-accent-red/10 border-accent-red/20 text-accent-red'}`}
          onClick={() => setMessage(null)}>{message.text}</motion.div>
      )}

      {/* Dock utilization */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dockUtilization.map((d) => (
          <div key={d.dock} className={`glass-panel rounded-xl p-4 border ${d.occupied ? 'border-accent-sky/30' : 'border-transparent'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">{d.dock}</span>
              {d.occupied && <span className="w-2 h-2 bg-accent-sky rounded-full animate-pulse" />}
            </div>
            <p className="text-xs text-text-secondary">{d.total} appointments today</p>
            <p className={`text-lg font-bold mt-1 ${d.occupied ? 'text-accent-sky' : 'text-accent-green'}`}>
              {d.occupied ? 'Occupied' : 'Available'}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-1">
        {(['today', 'upcoming', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs font-medium capitalize ${filter === f ? 'bg-accent-sky/15 text-accent-sky' : 'text-text-secondary hover:bg-white/[0.04]'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((appt) => {
          const cfg = statusConfig[appt.status] || statusConfig.scheduled;
          return (
            <motion.div key={appt.id} layout className="glass-panel rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                    <Truck className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{appt.appointmentId}</span>
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{appt.supplier}{appt.poNumber ? ` — PO ${appt.poNumber}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-xs text-text-secondary flex items-center gap-1"><MapPin className="w-3 h-3" />{appt.dockNumber}</p>
                    <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" />{appt.scheduledDate} {appt.scheduledTime}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary flex items-center gap-1"><Clock className="w-3 h-3" />{appt.estimatedDuration}m</p>
                    {appt.palletCount && <p className="text-xs text-text-secondary flex items-center gap-1 mt-0.5"><Package className="w-3 h-3" />{appt.palletCount} pallets</p>}
                  </div>
                  {appt.asnNumber && <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-text-secondary">ASN: {appt.asnNumber}</span>}
                  <div className="flex gap-1">
                    {appt.status === 'scheduled' && (
                      <button onClick={() => updateStatus(appt, 'checked_in')} className="px-2.5 py-1.5 rounded-lg text-xs bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/20 flex items-center gap-1">
                        <LogIn className="w-3 h-3" /> Check In
                      </button>
                    )}
                    {appt.status === 'checked_in' && (
                      <button onClick={() => updateStatus(appt, 'unloading')} className="px-2.5 py-1.5 rounded-lg text-xs bg-accent-sky/10 text-accent-sky border border-accent-sky/20">Start Unload</button>
                    )}
                    {appt.status === 'unloading' && (
                      <button onClick={() => updateStatus(appt, 'completed')} className="px-2.5 py-1.5 rounded-lg text-xs bg-accent-green/10 text-accent-green border border-accent-green/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Complete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
        {filtered.length === 0 && <p className="text-center py-8 text-text-secondary text-sm">No dock appointments for this filter</p>}
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="glass-panel rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Schedule Dock Appointment</h3>
                <button onClick={() => setShowCreate(false)} className="text-text-secondary hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                {[
                  { key: 'supplier', label: 'Supplier *', type: 'text' },
                  { key: 'poNumber', label: 'PO Number', type: 'text' },
                  { key: 'carrier', label: 'Carrier', type: 'text' },
                  { key: 'asnNumber', label: 'ASN Number', type: 'text' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-text-secondary">{f.label}</label>
                    <input type={f.type} value={(form as Record<string, string | number>)[f.key] as string}
                      onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-accent-sky/30" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-secondary">Dock</label>
                    <select value={form.dockNumber} onChange={(e) => setForm(prev => ({ ...prev, dockNumber: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none">
                      {DOCKS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary">Date</label>
                    <input type="date" value={form.scheduledDate} onChange={(e) => setForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary">Time</label>
                    <input type="time" value={form.scheduledTime} onChange={(e) => setForm(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-text-secondary">Duration (min)</label>
                    <input type="number" value={form.estimatedDuration} onChange={(e) => setForm(prev => ({ ...prev, estimatedDuration: Number(e.target.value) }))}
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                  </div>
                </div>
              </div>
              <button onClick={createAppointment} className="w-full mt-6 py-2.5 rounded-xl text-sm font-medium bg-accent-sky/15 text-accent-sky border border-accent-sky/20 hover:bg-accent-sky/25">
                Schedule Appointment
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}