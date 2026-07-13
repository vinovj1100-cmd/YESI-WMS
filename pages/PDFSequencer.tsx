import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, ArrowUpDown, Download, Trash2, AlertTriangle, ScanBarcode } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';

// Configure PDF.js worker using local Vite asset URL
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface ExtractedPage {
  id: number;
  text: string;
  cleanText: string;
  codes: string[];
}

interface ResultRow {
  status: string;
  sequenceOrder: number;
  id: string;
  originalPage: string | number;
  outputPage: string | number;
  notes: string;
}

type SequencerMode = 'smart' | 'strict';

export default function PDFSequencer() {
  const [sequenceList, setSequenceList] = useState('');
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [sortedPages, setSortedPages] = useState<ExtractedPage[]>([]);
  const [unmatchedPages, setUnmatchedPages] = useState<ResultRow[]>([]);
  const [duplicateIds, setDuplicateIds] = useState<{ id: string; count: number }[]>([]);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [mode, setMode] = useState<SequencerMode>('smart');
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [results, setResults] = useState<ResultRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ozon tracking ID formats:
  //   Hyphenated: 0164378780-0023-1  (digits-4digits-1digit)
  //   Plain:      57696746178         (9–15 consecutive digits)
  const OZON_ID_REGEX = /\b\d{9,15}-\d{4}-\d{1,2}\b|\b\d{9,15}\b/g;

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setMessage(null);
    setFileName(file.name);
    setResults([]);
    setUnmatchedPages([]);
    setDuplicateIds([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Clone the buffer: pdfjs-dist transfers ownership (detaches) the original
      // so we keep a separate copy for pdf-lib to use during download
      setPdfBytes(arrayBuffer.slice(0));

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const extracted: ExtractedPage[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ');
        
        // Remove all spaces and hyphens for bulletproof matching
        const cleanText = text.replace(/[-\s]/g, '');
        
        // Extract all Ozon-format tracking IDs from page text
        // Normalise by removing spaces so split tokens get rejoined correctly
        const normText = text.replace(/\s+/g, ' ');
        const matches = normText.match(OZON_ID_REGEX) || [];
        const cleanedMatches = matches.map(m => m.trim());

        extracted.push({
          id: i - 1, // 0-indexed
          text: text.substring(0, 200),
          cleanText: cleanText,
          codes: [...new Set(cleanedMatches)],
        });
      }

      const totalMatches = extracted.reduce((sum, p) => sum + p.codes.length, 0);
      if (totalMatches === 0) {
        setMessage({ type: 'error', text: 'No tracking IDs found in text! If these are image-based labels, browser text extraction cannot read them. OCR/Barcode scanning may be needed.' });
      } else {
        setMessage({ type: 'success', text: `Extracted ${extracted.length} pages. Found ${totalMatches} total tracking IDs.` });
      }

      setPages(extracted);
      setSortedPages([]);
    } catch (e: any) {
      console.error(e);
      setMessage({ type: 'error', text: `Failed to process PDF: ${e.message || 'Unknown error'}` });
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleSort = () => {
    if (!sequenceList.trim() || pages.length === 0) {
      setMessage({ type: 'error', text: 'Provide sequence IDs and upload a PDF' });
      return;
    }

    let targetIdsRaw = sequenceList.split('\n').map(t => t.trim()).filter(Boolean);

    // Detect and track duplicates before deduplication
    const rawCountMap = new Map<string, number>();
    for (const tid of targetIdsRaw) {
      const key = tid.replace(/[-\s]/g, '').toLowerCase();
      rawCountMap.set(key, (rawCountMap.get(key) || 0) + 1);
    }
    const foundDuplicates: { id: string; count: number }[] = [];
    rawCountMap.forEach((count, key) => {
      if (count > 1) {
        // find the original formatted ID
        const original = targetIdsRaw.find(t => t.replace(/[-\s]/g, '').toLowerCase() === key) || key;
        foundDuplicates.push({ id: original, count });
      }
    });
    setDuplicateIds(foundDuplicates);

    // Remove duplicates from target list if enabled
    if (removeDuplicates) {
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const tid of targetIdsRaw) {
        const key = tid.replace(/[-\s]/g, '').toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          cleaned.push(tid);
        }
      }
      targetIdsRaw = cleaned;
    }

    const targetIds = targetIdsRaw.map(t => t.trim());

    const pageMap = new Map<string, ExtractedPage>();
    const usedPages = new Set<number>();

    // Robust matching:
    // Strip hyphens and spaces from both sides so that:
    //   '0164378780-0023-1' → '01643787800231'  matches PDF text '01643787800231'
    //   '57696746178'       → '57696746178'      matches as-is
    targetIds.forEach(tid => {
      const searchStr = tid.replace(/[-\s]/g, '');
      // Guard: skip very short search strings to avoid false-positives
      if (searchStr.length < 8) return;
      const matchedPage = pages.find(p => !usedPages.has(p.id) && p.cleanText.includes(searchStr));
      if (matchedPage) {
        pageMap.set(tid, matchedPage);
        usedPages.add(matchedPage.id);
      }
    });

    const sorted: ExtractedPage[] = [];
    const resultRows: ResultRow[] = [];
    const unmatchedRows: ResultRow[] = [];
    let matchedCount = 0;
    let newPageCounter = 1;

    if (mode === 'strict') {
      // Strict: only pages matching sequence
      for (let i = 0; i < targetIds.length; i++) {
        const tid = targetIds[i];
        if (pageMap.has(tid)) {
          const page = pageMap.get(tid)!;
          sorted.push(page);
          resultRows.push({
            status: '✅ INCLUDED',
            sequenceOrder: i + 1,
            id: tid,
            originalPage: page.id + 1,
            outputPage: newPageCounter++,
            notes: 'Found and sequenced',
          });
          matchedCount++;
        } else {
          unmatchedRows.push({
            status: '❌ MISSING',
            sequenceOrder: i + 1,
            id: tid,
            originalPage: 'N/A',
            outputPage: 'N/A',
            notes: 'ID not detected in PDF',
          });
        }
      }
    } else {
      // Smart: matched first, then extras
      for (let i = 0; i < targetIds.length; i++) {
        const tid = targetIds[i];
        if (pageMap.has(tid)) {
          const page = pageMap.get(tid)!;
          sorted.push(page);
          resultRows.push({
            status: '✅ MATCHED',
            sequenceOrder: i + 1,
            id: tid,
            originalPage: page.id + 1,
            outputPage: newPageCounter++,
            notes: 'Sequenced',
          });
          matchedCount++;
        } else {
          unmatchedRows.push({
            status: '❌ MISSING',
            sequenceOrder: i + 1,
            id: tid,
            originalPage: 'N/A',
            outputPage: 'N/A',
            notes: 'Not in PDF',
          });
        }
      }

      // Add extra pages not in sequence
      pages.forEach(page => {
        if (!usedPages.has(page.id)) {
          sorted.push(page);
          unmatchedRows.push({
            status: 'ℹ️ EXTRA',
            sequenceOrder: 0,
            id: page.codes[0] || `Page ${page.id + 1}`,
            originalPage: page.id + 1,
            outputPage: newPageCounter++,
            notes: 'Extra page in PDF',
          });
        }
      });
    }

    setSortedPages(sorted);
    setResults(resultRows);
    setUnmatchedPages(unmatchedRows);
    setMessage({ type: 'success', text: `Matched ${matchedCount} of ${targetIds.length} tracking IDs` });
  };

  const handleClear = () => {
    setPages([]);
    setSortedPages([]);
    setPdfBytes(null);
    setSequenceList('');
    setFileName('');
    setMessage(null);
    setResults([]);
    setUnmatchedPages([]);
    setDuplicateIds([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadSorted = async () => {
    if (!pdfBytes || sortedPages.length === 0) return;
    setDownloading(true);
    try {
      const originalPdf = await PDFDocument.load(pdfBytes);
      const newPdf = await PDFDocument.create();
      const pageIndices = sortedPages.map(p => p.id);
      const copiedPages = await newPdf.copyPages(originalPdf, pageIndices);
      copiedPages.forEach(page => newPdf.addPage(page));
      const pdfBytes2 = await newPdf.save();
      const blob = new Blob([new Uint8Array(pdfBytes2)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sorted_${mode}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `✅ Downloaded ${sortedPages.length} sorted pages as PDF!` });
    } catch (e: any) {
      console.error(e);
      setMessage({ type: 'error', text: `Download failed: ${e.message}` });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Pro PDF Label Sequencer</h1>
        <p className="text-sm text-text-secondary mt-1">Upload labels, extract tracking IDs, and sort pages</p>
      </div>

      {/* Mode Selector */}
      <div className="mb-4 glass-panel rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <ScanBarcode className="w-4 h-4 text-accent-sky" />
          <h3 className="text-sm font-semibold text-text-primary">Sequencing Mode</h3>
        </div>
        <div className="flex gap-2">
          {([
            { key: 'smart' as SequencerMode, label: '📋 Smart Sort', desc: 'Matched pages first, extras appended' },
            { key: 'strict' as SequencerMode, label: '🔒 Strict Rearrange', desc: 'Only pages matching your sequence' },
          ]).map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 p-3 rounded-md border text-left transition-all ${
                mode === m.key
                  ? 'bg-accent-sky/10 border-accent-sky/30'
                  : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
              }`}
            >
              <span className={`text-xs font-semibold ${mode === m.key ? 'text-accent-sky' : 'text-text-primary'}`}>{m.label}</span>
              <p className="text-[10px] text-text-secondary mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
        {mode === 'strict' && (
          <div className="mt-2 p-2 bg-accent-yellow/10 border border-accent-yellow/20 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-accent-yellow flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-accent-yellow">Strict Mode: Pages NOT in your list will be EXCLUDED from the output.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sequence List */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUpDown className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Target Sequence</h3>
          </div>
          <textarea
            value={sequenceList}
            onChange={(e) => setSequenceList(e.target.value)}
            className="w-full h-48 bg-transparent border border-white/[0.08] rounded-md p-3 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-sky transition-colors"
            placeholder="Paste tracking IDs here, one per line...\n1234-5678-9\n9876-5432-1"
          />
          <div className="flex items-center gap-2 mt-3">
            <input
              type="checkbox"
              id="removeDups"
              checked={removeDuplicates}
              onChange={(e) => setRemoveDuplicates(e.target.checked)}
              className="w-3.5 h-3.5 accent-accent-sky"
            />
            <label htmlFor="removeDups" className="text-[10px] text-text-secondary">Auto-remove duplicate IDs</label>
          </div>
          <p className="text-[10px] text-text-secondary mt-2">
            {sequenceList.split('\n').filter(Boolean).length} tracking IDs
          </p>
        </div>

        {/* PDF Upload & Controls */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Labels PDF</h3>
            {fileName && (
              <span className="ml-auto text-[10px] text-text-secondary truncate max-w-[100px]">{fileName}</span>
            )}
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="h-40 border-2 border-dashed border-white/[0.08] rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-accent-sky/30 transition-colors"
          >
            <Upload className="w-8 h-8 text-text-secondary mb-2" />
            <p className="text-xs text-text-secondary">Click to upload PDF</p>
            <p className="text-[10px] text-text-secondary/60 mt-1">PDF files only</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
          />

          {pages.length > 0 && (
            <div className="mt-4 p-2 bg-white/[0.02] rounded-md">
              <p className="text-xs text-text-primary">{pages.length} pages extracted</p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <motion.button
              onClick={handleSort}
              disabled={processing || pages.length === 0 || !sequenceList.trim()}
              whileTap={{ scale: 0.98 }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent-sky text-void font-semibold text-xs rounded-md hover:bg-accent-sky/90 transition-colors disabled:opacity-30 active:translate-y-[1px]"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Scan & Sort
            </motion.button>
            <button
              onClick={handleClear}
              className="px-3 py-2.5 border border-white/[0.08] rounded-md text-text-secondary hover:text-accent-red hover:border-accent-red/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {message && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-3 p-2.5 rounded-md text-xs ${
                message.type === 'success'
                  ? 'bg-accent-green/10 border border-accent-green/20 text-accent-green'
                  : message.type === 'warning'
                    ? 'bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow'
                    : 'bg-accent-red/10 border border-accent-red/20 text-accent-red'
              }`}
            >
              {message.text}
            </motion.div>
          )}
        </div>

        {/* Sorted Results */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent-green" />
              <h3 className="text-sm font-semibold text-text-primary">Sorted Pages</h3>
              {sortedPages.length > 0 && (
                <span className="text-[10px] bg-accent-green/15 text-accent-green px-1.5 py-0.5 rounded-full">{sortedPages.length}</span>
              )}
            </div>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {sortedPages.length === 0 ? (
              <p className="text-xs text-text-secondary text-center py-8">
                {pages.length > 0 ? 'Click Scan & Sort to reorder pages' : 'Upload PDF and enter sequence IDs'}
              </p>
            ) : (
              sortedPages.map((page, i) => (
                <motion.div
                  key={`sorted-${page.id}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-2 p-2 bg-white/[0.02] border border-white/[0.06] rounded-md"
                >
                  <span className="text-[10px] text-accent-green/60 font-mono w-5 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono text-accent-sky truncate">{page.codes[0] || `Page ${page.id + 1}`}</p>
                    <p className="text-[9px] text-text-secondary truncate">{page.text.substring(0, 50)}</p>
                  </div>
                  <span className="text-[9px] text-text-secondary/40 flex-shrink-0">p.{page.id + 1}</span>
                </motion.div>
              ))
            )}
          </div>

          {/* Big Download Button */}
          <AnimatePresence>
            {sortedPages.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={downloadSorted}
                disabled={downloading}
                className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
                style={{
                  background: downloading ? 'rgba(34,197,94,0.1)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  color: downloading ? '#22c55e' : '#000',
                  boxShadow: downloading ? 'none' : '0 0 20px rgba(34,197,94,0.3)'
                }}
                whileTap={{ scale: 0.97 }}
              >
                <Download className="w-4 h-4" />
                {downloading ? 'Generating PDF...' : `Download ${sortedPages.length} Sorted Pages`}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Summary Banners ── */}
      <AnimatePresence>
        {(results.length > 0 || unmatchedPages.length > 0 || duplicateIds.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">

            {/* Matched Results */}
            {results.length > 0 && (
              <div className="glass-panel rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-accent-green/5">
                  <span className="text-xs font-bold text-accent-green">✅ Matched & Sequenced</span>
                  <span className="ml-auto text-[10px] bg-accent-green/15 text-accent-green px-2 py-0.5 rounded-full">{results.length} pages</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-text-secondary uppercase tracking-widest border-b border-white/[0.04] bg-white/[0.01]">
                        <th className="text-left py-2 px-3">Seq#</th>
                        <th className="text-left py-2 px-3">Tracking ID</th>
                        <th className="text-center py-2 px-3">Original Page</th>
                        <th className="text-center py-2 px-3">Output Page</th>
                        <th className="text-left py-2 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, i) => (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-1.5 px-3 text-text-secondary">{row.sequenceOrder}</td>
                          <td className="py-1.5 px-3 font-mono text-accent-sky">{row.id}</td>
                          <td className="py-1.5 px-3 text-center text-text-secondary">{row.originalPage}</td>
                          <td className="py-1.5 px-3 text-center text-accent-green font-semibold">{row.outputPage}</td>
                          <td className="py-1.5 px-3 text-text-secondary">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Missing / Unmatched */}
            {unmatchedPages.length > 0 && (
              <div className="glass-panel rounded-lg overflow-hidden border border-accent-red/20">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-accent-red/5">
                  <span className="text-xs font-bold text-accent-red">❌ Missing / Unmatched IDs</span>
                  <span className="ml-auto text-[10px] bg-accent-red/15 text-accent-red px-2 py-0.5 rounded-full">{unmatchedPages.filter(r => r.status.includes('❌')).length} missing</span>
                  {unmatchedPages.some(r => r.status.includes('ℹ️')) && (
                    <span className="text-[10px] bg-white/10 text-text-secondary px-2 py-0.5 rounded-full">{unmatchedPages.filter(r => r.status.includes('ℹ️')).length} extra in PDF</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-text-secondary uppercase tracking-widest border-b border-white/[0.04] bg-white/[0.01]">
                        <th className="text-left py-2 px-3">Status</th>
                        <th className="text-left py-2 px-3">Seq#</th>
                        <th className="text-left py-2 px-3">Tracking ID</th>
                        <th className="text-left py-2 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedPages.map((row, i) => (
                        <tr key={i} className={`border-b border-white/[0.03] ${row.status.includes('❌') ? 'bg-accent-red/[0.03]' : 'bg-white/[0.01]'}`}>
                          <td className="py-1.5 px-3">
                            <span className={`font-bold ${row.status.includes('❌') ? 'text-accent-red' : 'text-text-secondary'}`}>
                              {row.status.includes('❌') ? 'MISSING' : 'EXTRA'}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-text-secondary">{row.sequenceOrder || '–'}</td>
                          <td className="py-1.5 px-3 font-mono text-text-primary">{row.id}</td>
                          <td className="py-1.5 px-3 text-text-secondary">{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Duplicate IDs */}
            {duplicateIds.length > 0 && (
              <div className="glass-panel rounded-lg overflow-hidden border border-accent-yellow/20">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-accent-yellow/5">
                  <span className="text-xs font-bold text-accent-yellow">⚠️ Duplicate Tracking IDs Detected</span>
                  <span className="ml-auto text-[10px] bg-accent-yellow/15 text-accent-yellow px-2 py-0.5 rounded-full">{duplicateIds.length} IDs</span>
                </div>
                <div className="p-4">
                  <p className="text-[10px] text-text-secondary mb-3">These IDs appeared more than once in your pasted sequence. Only the first occurrence was used.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {duplicateIds.map((dup, i) => (
                      <div key={i} className="flex items-center justify-between bg-accent-yellow/5 border border-accent-yellow/15 rounded-md px-2.5 py-2">
                        <span className="text-[10px] font-mono text-accent-yellow truncate">{dup.id}</span>
                        <span className="text-[9px] bg-accent-yellow/20 text-accent-yellow px-1.5 py-0.5 rounded ml-1 flex-shrink-0">×{dup.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted Pages Preview removed */}
    </div>
  );
}
