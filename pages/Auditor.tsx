import { useState } from 'react';
import { motion } from 'framer-motion';
import { Scale, Zap, AlertTriangle, CheckCircle, FileCheck } from 'lucide-react';

interface DiscrepancyResult {
  id: string;
  status: string;
  expected: string;
  actual: string;
}

function robustParseMultiline(textData: string): Map<string, Set<string>> {
  const SCANNING_ID_REGEX = /\b\d{4,12}-?\d{4}-?\d?\b/g;
  const dataMap = new Map<string, Set<string>>();
  let currentTn: string | null = null;

  for (const line of textData.trim().split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tnMatches = trimmed.match(SCANNING_ID_REGEX);
    if (tnMatches && tnMatches.length > 0) {
      currentTn = tnMatches[0];
      const desc = trimmed.replace(currentTn, '').replace(/\|/g, '').trim();
      if (!dataMap.has(currentTn)) dataMap.set(currentTn, new Set());
      if (desc) dataMap.get(currentTn)!.add(desc);
    } else if (currentTn) {
      dataMap.get(currentTn)!.add(trimmed);
    }
  }
  return dataMap;
}

export default function Auditor() {
  const [masterIn, setMasterIn] = useState('');
  const [scanIn, setScanIn] = useState('');
  const [results, setResults] = useState<DiscrepancyResult[]>([]);
  const [summary, setSummary] = useState({ total: 0, matched: 0, errors: 0 });

  const handleAnalyze = () => {
    if (!masterIn.trim() || !scanIn.trim()) return;

    const mMap = robustParseMultiline(masterIn);
    const sMap = robustParseMultiline(scanIn);

    const allIds = new Set([...mMap.keys(), ...sMap.keys()]);
    const analysis: DiscrepancyResult[] = [];
    let matched = 0;
    let errors = 0;

    for (const tid of Array.from(allIds).sort()) {
      const exp = mMap.get(tid) || new Set();
      const got = sMap.get(tid) || new Set();

      // Compare sets
      const expArr = Array.from(exp).sort();
      const gotArr = Array.from(got).sort();
      const isMatch = JSON.stringify(expArr) === JSON.stringify(gotArr);

      if (isMatch) {
        matched++;
      } else {
        errors++;
      }

      analysis.push({
        id: tid,
        status: isMatch ? 'MATCH' : 'ERROR',
        expected: expArr.join(' | ') || '(not in master)',
        actual: gotArr.join(' | ') || '(not scanned)',
      });
    }

    setResults(analysis);
    setSummary({ total: allIds.size, matched, errors });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Discrepancy Auditor</h1>
        <p className="text-sm text-text-secondary mt-1">Compare master data against scanned data to find discrepancies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Master Input */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileCheck className="w-4 h-4 text-accent-green" />
            <h3 className="text-sm font-semibold text-text-primary">MASTER (Expected)</h3>
          </div>
          <textarea
            value={masterIn}
            onChange={(e) => setMasterIn(e.target.value)}
            className="w-full h-48 bg-transparent border border-white/[0.08] rounded-md p-3 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-green transition-colors"
            placeholder="Paste expected tracking numbers and descriptions..."
          />
        </div>

        {/* Scan Input */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-accent-yellow" />
            <h3 className="text-sm font-semibold text-text-primary">SCAN (Actual)</h3>
          </div>
          <textarea
            value={scanIn}
            onChange={(e) => setScanIn(e.target.value)}
            className="w-full h-48 bg-transparent border border-white/[0.08] rounded-md p-3 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-yellow transition-colors"
            placeholder="Paste scanned tracking numbers and descriptions..."
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-4 mb-4">
        <motion.button
          onClick={handleAnalyze}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent-sky text-void font-semibold text-sm rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
        >
          <Zap className="w-4 h-4" />
          Run Discrepancy Analysis
        </motion.button>

        {results.length > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <span className="text-text-secondary">
              Total: <strong className="text-text-primary">{summary.total}</strong>
            </span>
            <span className="text-accent-green">
              <CheckCircle className="w-3 h-3 inline mr-1" />
              Matched: <strong>{summary.matched}</strong>
            </span>
            <span className="text-accent-red">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Errors: <strong>{summary.errors}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Analysis Results</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="text-left py-2 px-2 w-12">Status</th>
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Expected</th>
                  <th className="text-left py-2 px-2">Actual</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <motion.tr
                    key={result.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`border-b border-white/[0.04] ${
                      result.status === 'ERROR' ? 'bg-accent-red/5' : ''
                    }`}
                  >
                    <td className="py-2 px-2">
                      {result.status === 'MATCH' ? (
                        <CheckCircle className="w-4 h-4 text-accent-green" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-accent-red" />
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs font-mono text-text-primary">{result.id}</td>
                    <td className="py-2 px-2 text-xs text-text-secondary max-w-[200px] truncate">{result.expected}</td>
                    <td className="py-2 px-2 text-xs text-text-secondary max-w-[200px] truncate">{result.actual}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
