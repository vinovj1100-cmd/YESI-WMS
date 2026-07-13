import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { Brain, Save, Trash2, Tag, History } from 'lucide-react';
import type { Alias, Preference } from '@/lib/db';

export default function MemoryPage() {
  const { user } = useAuth();
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [aliasSource, setAliasSource] = useState('');
  const [aliasTarget, setAliasTarget] = useState('');
  const [prefKey, setPrefKey] = useState('');
  const [prefValue, setPrefValue] = useState('');
  const [siteName, setSiteName] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    const [a, p] = await Promise.all([
      db.aliases.reverse().limit(50).toArray(),
      db.preferences.reverse().limit(50).toArray(),
    ]);
    setAliases(a);
    setPreferences(p);
    const site = p.find(x => x.key === 'site_name');
    const op = p.find(x => x.key === 'operator_name');
    if (site) setSiteName(site.value);
    if (op) setOperatorName(op.value);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveAlias = async () => {
    if (!aliasSource.trim() || !aliasTarget.trim()) {
      setMessage({ type: 'error', text: 'Both source and target are required' });
      return;
    }
    await db.aliases.add({
      source: aliasSource.trim().toLowerCase(),
      target: aliasTarget.trim(),
      createdAt: new Date().toISOString(),
    });
    await logAction('ALIAS_SAVE', `${aliasSource} -> ${aliasTarget}`, user?.displayName || 'Unknown');
    setAliasSource('');
    setAliasTarget('');
    setMessage({ type: 'success', text: 'Alias saved' });
    loadData();
  };

  const savePreference = async () => {
    if (!prefKey.trim()) {
      setMessage({ type: 'error', text: 'Key is required' });
      return;
    }
    const existing = await db.preferences.where({ key: prefKey.trim() }).first();
    if (existing && existing.id) {
      await db.preferences.update(existing.id, { value: prefValue.trim(), createdAt: new Date().toISOString() });
    } else {
      await db.preferences.add({ key: prefKey.trim(), value: prefValue.trim(), createdAt: new Date().toISOString() });
    }
    await logAction('PREF_SAVE', `${prefKey} = ${prefValue}`, user?.displayName || 'Unknown');
    setPrefKey('');
    setPrefValue('');
    setMessage({ type: 'success', text: 'Preference saved' });
    loadData();
  };

  const saveSettings = async () => {
    const sitePref = await db.preferences.where({ key: 'site_name' }).first();
    if (sitePref && sitePref.id) {
      await db.preferences.update(sitePref.id, { value: siteName, createdAt: new Date().toISOString() });
    } else {
      await db.preferences.add({ key: 'site_name', value: siteName, createdAt: new Date().toISOString() });
    }
    const opPref = await db.preferences.where({ key: 'operator_name' }).first();
    if (opPref && opPref.id) {
      await db.preferences.update(opPref.id, { value: operatorName, createdAt: new Date().toISOString() });
    } else {
      await db.preferences.add({ key: 'operator_name', value: operatorName, createdAt: new Date().toISOString() });
    }
    await logAction('SETTINGS_SAVE', `Site: ${siteName}, Operator: ${operatorName}`, user?.displayName || 'Unknown');
    setMessage({ type: 'success', text: 'Settings saved' });
    loadData();
  };

  const deleteAlias = async (id: number | undefined) => {
    if (!id) return;
    await db.aliases.delete(id);
    loadData();
  };

  const deletePref = async (id: number | undefined) => {
    if (!id) return;
    await db.preferences.delete(id);
    loadData();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Memory & Preferences</h1>
        <p className="text-sm text-text-secondary mt-1">System memory, aliases, and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Site Settings */}
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Site Settings</h3>
          </div>
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Site Name</label>
              <input
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                placeholder="Main Warehouse"
              />
            </div>
            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Operator Name</label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                placeholder="John Doe"
              />
            </div>
          </div>
          <motion.button
            onClick={saveSettings}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
          >
            <Save className="w-3.5 h-3.5" />
            Save Settings
          </motion.button>
        </div>

        {/* Product Aliases */}
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Product Aliases</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="text"
              value={aliasSource}
              onChange={(e) => setAliasSource(e.target.value)}
              placeholder="Alias source..."
              className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
            />
            <input
              type="text"
              value={aliasTarget}
              onChange={(e) => setAliasTarget(e.target.value)}
              placeholder="Alias target..."
              className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
            />
          </div>
          <motion.button
            onClick={saveAlias}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] border border-white/[0.08] text-text-primary text-xs rounded-md hover:bg-white/[0.08] transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save Alias
          </motion.button>

          <div className="mt-4 space-y-1 max-h-40 overflow-y-auto">
            {aliases.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-2 bg-white/[0.02] rounded-md text-[10px]">
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">{a.source}</span>
                  <span className="text-text-secondary/50">→</span>
                  <span className="text-accent-green">{a.target}</span>
                </div>
                <button onClick={() => deleteAlias(a.id)} className="text-text-secondary hover:text-accent-red">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div className="glass-panel rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">General Preferences</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="text"
              value={prefKey}
              onChange={(e) => setPrefKey(e.target.value)}
              placeholder="Preference key..."
              className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
            />
            <input
              type="text"
              value={prefValue}
              onChange={(e) => setPrefValue(e.target.value)}
              placeholder="Preference value..."
              className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors"
            />
          </div>
          <motion.button
            onClick={savePreference}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] border border-white/[0.08] text-text-primary text-xs rounded-md hover:bg-white/[0.08] transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save Preference
          </motion.button>

          <div className="mt-4 space-y-1 max-h-40 overflow-y-auto">
            {preferences.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 bg-white/[0.02] rounded-md text-[10px]">
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary font-mono">{p.key}</span>
                  <span className="text-text-secondary/50">=</span>
                  <span className="text-text-primary">{p.value}</span>
                </div>
                <button onClick={() => deletePref(p.id)} className="text-text-secondary hover:text-accent-red">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="glass-panel rounded-lg p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-3">How It Works</h3>
          <div className="space-y-2 text-[10px] text-text-secondary">
            <p><strong className="text-text-primary">Site Settings:</strong> Configure site name and operator for reports and labels.</p>
            <p><strong className="text-text-primary">Product Aliases:</strong> Map common shorthand or variant names to canonical product names. Used by Bulk Converter.</p>
            <p><strong className="text-text-primary">Preferences:</strong> Store arbitrary key-value pairs for system behavior and personalization.</p>
          </div>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`fixed bottom-6 right-6 p-3 rounded-md text-xs ${
            message.type === 'success'
              ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
              : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
          }`}
        >
          {message.text}
        </motion.div>
      )}
    </div>
  );
}
