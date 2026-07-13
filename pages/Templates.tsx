import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { Plus, Save, Trash2, X, Database } from 'lucide-react';
import type { Template } from '@/lib/db';

export default function TemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [raw, setRaw] = useState('');
  const [standard, setStandard] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTemplates = useCallback(async () => {
    const items = await db.templates.toArray();
    setTemplates(items.reverse());
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleSave = async () => {
    if (!raw.trim() || !standard.trim()) {
      setMessage({ type: 'error', text: 'Both raw and standard titles are required' });
      return;
    }
    await db.templates.add({
      raw: raw.trim(),
      standard: standard.trim(),
      createdAt: new Date().toISOString(),
    });
    await logAction('TEMPLATE_SAVE', `${raw} -> ${standard}`, user?.displayName || 'Unknown');
    setRaw('');
    setStandard('');
    setShowForm(false);
    setMessage({ type: 'success', text: 'Template saved' });
    loadTemplates();
  };

  const handleDelete = async (id: number | undefined) => {
    if (!id) return;
    await db.templates.delete(id);
    await logAction('TEMPLATE_DELETE', `Deleted template id ${id}`, user?.displayName || 'Unknown');
    loadTemplates();
  };

  const filtered = templates.filter(t =>
    t.raw.toLowerCase().includes(search.toLowerCase()) ||
    t.standard.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Templates Database</h1>
        <p className="text-sm text-text-secondary mt-1">Raw / translated → Standard title mappings for bulk conversion</p>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {!showForm ? (
          <motion.button
            onClick={() => setShowForm(true)}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Template
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex-1 glass-panel rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary">New Template</h3>
              <button onClick={() => setShowForm(false)} className="text-text-secondary hover:text-text-primary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Raw / Translated Title</label>
                <input
                  type="text"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-1.5 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                  placeholder="IPHONE 15 BLACK 256GB"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Standard / Clean Title</label>
                <input
                  type="text"
                  value={standard}
                  onChange={(e) => setStandard(e.target.value)}
                  className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-1.5 px-1 focus:outline-none focus:border-accent-sky transition-colors"
                  placeholder="APPLE IPHONE 15 256GB BLACK"
                />
              </div>
            </div>
            {message && (
              <div className={`mb-2 p-2 rounded-md text-xs ${message.type === 'success' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
                {message.text}
              </div>
            )}
            <motion.button
              onClick={handleSave}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-4 py-2 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
            >
              <Save className="w-3.5 h-3.5" />
              Save Template
            </motion.button>
          </motion.div>
        )}
      </div>

      <div className="glass-panel rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Stored Templates</h3>
            <span className="text-[10px] text-text-secondary">{templates.length} templates</span>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-sky transition-colors w-48"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                <th className="text-left py-2 px-2">Raw Title</th>
                <th className="text-left py-2 px-2">Standard Title</th>
                <th className="text-right py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2 px-2 text-xs text-text-primary">{t.raw}</td>
                  <td className="py-2 px-2 text-xs text-accent-green">{t.standard}</td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-text-secondary hover:text-accent-red transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-6">No templates found</p>
        )}
      </div>
    </div>
  );
}
