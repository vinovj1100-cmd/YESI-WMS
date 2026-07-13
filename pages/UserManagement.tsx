import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { Users, Plus, Shield, User, Trash2, X, UserCog, ScrollText, Clock } from 'lucide-react';
import type { User as UserType, AuditLog } from '@/lib/db';

export default function UserManagement() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<'users' | 'logs'>('users');
  const [users, setUsers] = useState<UserType[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', displayName: '', role: 'operator' as 'admin' | 'operator' | 'supervisor' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUsers = useCallback(async () => {
    const items = await db.users.toArray();
    setUsers(items);
  }, []);

  const loadLogs = useCallback(async () => {
    const items = await db.auditLogs.reverse().limit(100).toArray();
    setLogs(items);
  }, []);

  useEffect(() => {
    loadUsers();
    loadLogs();
  }, [loadUsers, loadLogs]);

  const handleAddUser = async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      setMessage({ type: 'error', text: 'Username and password are required' });
      return;
    }

    const existing = await db.users.where({ username: newUser.username.trim() }).first();
    if (existing) {
      setMessage({ type: 'error', text: 'Username already exists' });
      return;
    }

    try {
      await db.users.add({
        username: newUser.username.trim(),
        password: newUser.password,
        role: newUser.role,
        displayName: newUser.displayName.trim() || newUser.username.trim(),
        createdAt: new Date().toISOString(),
      });
      setMessage({ type: 'success', text: `User ${newUser.username} created successfully` });
      setNewUser({ username: '', password: '', displayName: '', role: 'operator' });
      setShowAddForm(false);
      loadUsers();
    } catch {
      setMessage({ type: 'error', text: 'Failed to create user' });
    }
  };

  const handleDeleteUser = async (id: number | undefined, username: string) => {
    if (!id) return;
    if (username === 'admin') {
      setMessage({ type: 'error', text: 'Cannot delete the default admin account' });
      return;
    }
    try {
      await db.users.delete(id);
      setMessage({ type: 'success', text: `User ${username} deleted` });
      loadUsers();
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete user' });
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === 'admin') return <Shield className="w-4 h-4 text-accent-sky" />;
    if (role === 'supervisor') return <UserCog className="w-4 h-4 text-accent-yellow" />;
    return <User className="w-4 h-4 text-text-secondary" />;
  };

  const getRoleBg = (role: string) => {
    if (role === 'admin') return 'bg-accent-sky/20';
    if (role === 'supervisor') return 'bg-accent-yellow/20';
    return 'bg-white/[0.05]';
  };

  const getRoleBadgeStyle = (role: string) => {
    if (role === 'admin') return 'bg-accent-sky/20 text-accent-sky';
    if (role === 'supervisor') return 'bg-accent-yellow/20 text-accent-yellow';
    return 'bg-white/[0.05] text-text-secondary';
  };

  if (!isAdmin) {
    return (
      <div className="glass-panel rounded-lg p-8 text-center">
        <Shield className="w-10 h-10 text-accent-red mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-text-primary">Access Denied</h2>
        <p className="text-sm text-text-secondary mt-1">You need admin privileges to access this page.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Admin Control Panel</h1>
        <p className="text-sm text-text-secondary mt-1">Manage users and review system audit logs</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
            tab === 'users'
              ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30'
              : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          User Management
        </button>
        <button
          onClick={() => setTab('logs')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
            tab === 'logs'
              ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30'
              : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'
          }`}
        >
          <ScrollText className="w-3.5 h-3.5" />
          Audit Logs
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'users' ? (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* Add User Button */}
            <div className="mb-4">
              {!showAddForm ? (
                <motion.button
                  onClick={() => setShowAddForm(true)}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add User
                </motion.button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="glass-panel rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary">Add New User</h3>
                    <button onClick={() => setShowAddForm(false)} className="text-text-secondary hover:text-text-primary">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Username</label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-1.5 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Password</label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-1.5 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Display Name</label>
                      <input
                        type="text"
                        value={newUser.displayName}
                        onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                        className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-1.5 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Role</label>
                      <div className="flex gap-2">
                        {(['operator', 'supervisor', 'admin'] as const).map(role => (
                          <button
                            key={role}
                            onClick={() => setNewUser({ ...newUser, role })}
                            className={`flex-1 py-1.5 text-xs rounded-md border transition-all ${
                              newUser.role === role
                                ? 'bg-accent-sky/20 border-accent-sky/40 text-accent-sky'
                                : 'bg-white/[0.02] border-white/[0.06] text-text-secondary'
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {message && (
                    <div className={`mb-3 p-2 rounded-md text-xs ${
                      message.type === 'success'
                        ? 'bg-accent-green/10 text-accent-green'
                        : 'bg-accent-red/10 text-accent-red'
                    }`}>
                      {message.text}
                    </div>
                  )}

                  <motion.button
                    onClick={handleAddUser}
                    whileTap={{ scale: 0.98 }}
                    className="px-4 py-2 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
                  >
                    Create User
                  </motion.button>
                </motion.div>
              )}
            </div>

            {/* Users List */}
            <div className="glass-panel rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-accent-sky" />
                <h3 className="text-sm font-semibold text-text-primary">System Users</h3>
                <span className="ml-auto text-[10px] text-text-secondary">{users.length} users</span>
              </div>

              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.06] rounded-md"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getRoleBg(u.role)}`}>
                        {getRoleIcon(u.role)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-text-primary">{u.displayName}</p>
                        <p className="text-[10px] text-text-secondary font-mono">@{u.username}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${getRoleBadgeStyle(u.role)}`}>
                        {u.role}
                      </span>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.username)}
                        className="text-text-secondary hover:text-accent-red transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="glass-panel rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <ScrollText className="w-4 h-4 text-accent-sky" />
                <h3 className="text-sm font-semibold text-text-primary">System Audit Logs</h3>
                <span className="ml-auto text-[10px] text-text-secondary">{logs.length} records</span>
              </div>

              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                      <th className="text-left py-2 px-2">Time</th>
                      <th className="text-left py-2 px-2">User</th>
                      <th className="text-left py-2 px-2">Action</th>
                      <th className="text-left py-2 px-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-2 px-2 text-text-secondary whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                        </td>
                        <td className="py-2 px-2 font-mono text-text-primary">{log.operator}</td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded-full font-semibold ${
                            log.action.includes('LOGIN') ? 'bg-accent-green/20 text-accent-green' :
                            log.action.includes('FAIL') || log.action.includes('DELETE') ? 'bg-accent-red/20 text-accent-red' :
                            'bg-accent-sky/20 text-accent-sky'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-text-secondary max-w-[300px] truncate">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {logs.length === 0 && (
                <p className="text-xs text-text-secondary text-center py-6">No audit logs found</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
