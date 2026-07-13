import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { Smartphone, Save, Calculator, Table, Download } from 'lucide-react';
import type { SimDbEntry } from '@/lib/db';

function calculateLuhn(base14: string): string {
  const digits = base14.split('').map(Number);
  for (let i = digits.length - 2; i >= 0; i -= 2) {
    const doubled = digits[i] * 2;
    digits[i] = doubled > 9 ? Math.floor(doubled / 10) + (doubled % 10) : doubled;
  }
  const sum = digits.reduce((a, b) => a + b, 0);
  return String((10 - (sum % 10)) % 10);
}

export default function SIMManager() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<SimDbEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [calInput, setCalInput] = useState('');
  const [batchInput, setBatchInput] = useState('');
  const [results, setResults] = useState<Array<{ model: string; imei1: string; imei2: string; tac: string; offset: string }>>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [newTac, setNewTac] = useState('');
  const [newOffset, setNewOffset] = useState('');
  const [newModel, setNewModel] = useState('');
  const newType = 'Smartphone';
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadEntries = useCallback(async () => {
    const items = await db.simDb.toArray();
    setEntries(items);
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filtered = entries.filter(e =>
    e.modelSeries.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.tacPrefix.includes(searchQuery)
  );

  const handleSaveDb = async () => {
    await db.simDb.clear();
    await db.simDb.bulkAdd(entries);
    await logAction('SIM_DB_SAVE', `${entries.length} entries`, user?.displayName || 'Unknown');
    setMessage({ type: 'success', text: 'SIM Database saved' });
  };

  const handleAddEntry = async () => {
    if (!newTac.trim() || !newModel.trim()) return;
    await db.simDb.add({
      tacPrefix: newTac.trim(),
      expectedOffset: parseInt(newOffset) || 8,
      modelSeries: newModel.trim(),
      type: newType,
    });
    setNewTac('');
    setNewOffset('');
    setNewModel('');
    loadEntries();
  };

  const handleConvert = () => {
    if (!batchInput.trim()) return;

    // Parse calibration
    const simMap = new Map<string, number>();
    for (const entry of entries) {
      simMap.set(entry.tacPrefix, entry.expectedOffset);
    }

    if (calInput.trim()) {
      const imeis = calInput.match(/\b\d{15}\b/g) || [];
      if (imeis.length >= 2 && imeis[0] && imeis[1]) {
        const tac = imeis[0].slice(0, 8);
        const offset = parseInt(imeis[1].slice(0, 14)) - parseInt(imeis[0].slice(0, 14));
        simMap.set(tac, offset);
      }
    }

    const targetImeis = batchInput.match(/\b\d{15}\b/g) || [];
    const out: typeof results = [];

    for (const i1 of targetImeis) {
      const tac = i1.slice(0, 8);
      const offset = simMap.get(tac) || 8;
      const modelInfo = entries.find(e => e.tacPrefix === tac);
      const modelName = modelInfo?.modelSeries || 'Unknown TAC';
      const base14 = i1.slice(0, 14);
      const newBase = String(parseInt(base14) + offset).padStart(14, '0');
      const i2 = newBase + calculateLuhn(newBase);
      out.push({
        model: modelName,
        imei1: i1,
        imei2: i2,
        tac,
        offset: `${offset > 0 ? '+' : ''}${offset}`,
      });
    }

    setResults(out);
    logAction('SIM_IMEI_CONVERT', `Processed ${out.length} IMEIs`, user?.displayName || 'Unknown');
  };

  const exportResults = () => {
    if (results.length === 0) return;
    const header = 'Model,IMEI 1,IMEI 2,TAC,Applied Offset\n';
    const rows = results.map(r => `${r.model},${r.imei1},${r.imei2},${r.tac},${r.offset}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imei_results_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">SIM Database Manager</h1>
        <p className="text-sm text-text-secondary mt-1">Samsung IMEI/TAC database with calibration and batch conversion</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Database Editor */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-accent-sky" />
              <h3 className="text-sm font-semibold text-text-primary">TAC Database</h3>
              <span className="text-[10px] text-text-secondary">{entries.length} entries</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowEditor(!showEditor)} className="text-[10px] bg-white/[0.05] px-2 py-1 rounded text-text-secondary hover:text-text-primary">
                {showEditor ? 'Close' : 'Add Entry'}
              </button>
              <button onClick={handleSaveDb} className="flex items-center gap-1 text-[10px] bg-accent-green/20 text-accent-green px-2 py-1 rounded hover:bg-accent-green/30">
                <Save className="w-3 h-3" /> Save
              </button>
            </div>
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search model or TAC..."
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-sky transition-colors mb-3"
          />

          {showEditor && (
            <div className="grid grid-cols-4 gap-2 mb-3 p-3 bg-white/[0.02] rounded-md border border-white/[0.06]">
              <input value={newTac} onChange={(e) => setNewTac(e.target.value)} placeholder="TAC (8 digits)" className="bg-transparent border-b border-white/10 text-xs text-text-primary py-1 focus:outline-none focus:border-accent-sky" />
              <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="Model" className="bg-transparent border-b border-white/10 text-xs text-text-primary py-1 focus:outline-none focus:border-accent-sky" />
              <input value={newOffset} onChange={(e) => setNewOffset(e.target.value)} placeholder="Offset" className="bg-transparent border-b border-white/10 text-xs text-text-primary py-1 focus:outline-none focus:border-accent-sky" />
              <button onClick={handleAddEntry} className="text-xs bg-accent-sky/20 text-accent-sky rounded hover:bg-accent-sky/30">Add</button>
            </div>
          )}

          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="text-left py-1.5 px-2">TAC</th>
                  <th className="text-left py-1.5 px-2">Model</th>
                  <th className="text-center py-1.5 px-2">Offset</th>
                  <th className="text-center py-1.5 px-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-1.5 px-2 font-mono text-text-primary">{e.tacPrefix}</td>
                    <td className="py-1.5 px-2 text-text-primary">{e.modelSeries}</td>
                    <td className="py-1.5 px-2 text-center text-accent-sky">{e.expectedOffset}</td>
                    <td className="py-1.5 px-2 text-center text-text-secondary">{e.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* IMEI Converter */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">IMEI Converter Tools</h3>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">1. Calibration (IMEI 1 | IMEI 2)</label>
              <textarea
                value={calInput}
                onChange={(e) => setCalInput(e.target.value)}
                placeholder="Paste sample pairs (15 digits each)..."
                className="w-full h-24 bg-transparent border border-white/[0.08] rounded-md p-2 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-sky transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">2. Target IMEI 1 List (15 digits)</label>
              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                placeholder="Paste IMEI 1 list, one per line..."
                className="w-full h-24 bg-transparent border border-white/[0.08] rounded-md p-2 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-sky transition-colors"
              />
            </div>
          </div>

          <motion.button
            onClick={handleConvert}
            whileTap={{ scale: 0.98 }}
            disabled={!batchInput.trim()}
            className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors disabled:opacity-30"
          >
            <Calculator className="w-3.5 h-3.5" />
            Convert Batch
          </motion.button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 glass-panel rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-accent-green" />
              <h3 className="text-sm font-semibold text-text-primary">Conversion Results</h3>
              <span className="text-[10px] text-text-secondary">{results.length} devices</span>
            </div>
            <button
              onClick={exportResults}
              className="flex items-center gap-1 text-[10px] bg-accent-green/20 text-accent-green px-2 py-1 rounded hover:bg-accent-green/30"
            >
              <Download className="w-3 h-3" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="text-left py-1.5 px-2">Model</th>
                  <th className="text-left py-1.5 px-2">IMEI 1</th>
                  <th className="text-left py-1.5 px-2">IMEI 2</th>
                  <th className="text-center py-1.5 px-2">TAC</th>
                  <th className="text-center py-1.5 px-2">Offset</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-1.5 px-2 text-text-primary">{r.model}</td>
                    <td className="py-1.5 px-2 font-mono text-accent-sky">{r.imei1}</td>
                    <td className="py-1.5 px-2 font-mono text-accent-green">{r.imei2}</td>
                    <td className="py-1.5 px-2 text-center text-text-secondary">{r.tac}</td>
                    <td className="py-1.5 px-2 text-center text-accent-yellow">{r.offset}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

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
