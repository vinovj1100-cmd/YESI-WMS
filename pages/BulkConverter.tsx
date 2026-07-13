import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { db, logAction } from '@/lib/db';
import { useAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import {
  RefreshCw, Copy, CheckCircle, Wand2, Database, FileText,
  Languages, Loader2, AlertTriangle, X, Globe, Barcode,
  Download, Settings, Trash2, Grid3X3, ChevronRight
} from 'lucide-react';
import type { Template } from '@/lib/db';

// ─── Constants ────────────────────────────────────────────────────────────────

const TITLE_MAPPINGS: Record<string, string> = {
  'IPHONE': 'APPLE IPHONE',
  ' ORANGE': ' COSMIC ORANGE',
  ' BLUE': ' DEEP BLUE',
  ' GRAY': ' TITAN GRAY',
  ' GREY': ' TITAN GRAY',
  ' PURPLE': ' SANDY PURPLE',
  'SMARTPHONE ': '',
  'MOBILE PHONE ': '',
};

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pl', label: 'Polish' },
  { code: 'uk', label: 'Ukrainian' },
];

const BARCODE_FORMATS = [
  { value: 'CODE128' as const, label: 'Code 128', desc: 'Best for alphanumeric' },
  { value: 'CODE39' as const, label: 'Code 39', desc: 'Uppercase only' },
  { value: 'EAN13' as const, label: 'EAN-13', desc: '13-digit retail' },
  { value: 'EAN8' as const, label: 'EAN-8', desc: '8-digit retail' },
  { value: 'UPC' as const, label: 'UPC-A', desc: '12-digit retail' },
  { value: 'ITF14' as const, label: 'ITF-14', desc: 'Shipping container' },
  { value: 'QR' as const, label: 'QR Code', desc: '2D matrix scan' },
];

const BARCODE_PRESETS = [
  { name: 'Small', width: 120, height: 60, fontSize: 12, margin: 4 },
  { name: 'Standard', width: 200, height: 80, fontSize: 14, margin: 6 },
  { name: 'Large', width: 300, height: 120, fontSize: 18, margin: 8 },
  { name: 'QR Compact', width: 200, height: 200, fontSize: 12, margin: 8 },
  { name: 'QR Large', width: 400, height: 400, fontSize: 16, margin: 12 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function standardizeTitle(rawText: string): string {
  let text = rawText.toUpperCase();
  for (const [key, value] of Object.entries(TITLE_MAPPINGS)) {
    if (text.includes(key) && (value === '' || !text.includes(value))) {
      text = text.replace(key, value);
    }
  }
  return text.trim();
}

async function googleTranslate(text: string, target: string, source = 'auto'): Promise<string> {
  if (!text.trim()) return text;
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Translate error: ${res.status}`);
  const data = await res.json();
  const translated: string = data[0].map((chunk: any[]) => chunk[0]).join('');
  return translated;
}

async function renderBarcodeImage(
  text: string,
  format: 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC' | 'ITF14' | 'QR',
  width: number,
  height: number,
  showText: boolean,
  fontSize: number,
  bgColor: string,
  lineColor: string,
  margin: number
): Promise<string> {
  if (!text.trim()) return '';
  const canvas = document.createElement('canvas');

  if (format === 'QR') {
    try {
      return await QRCode.toDataURL(text, {
        width: Math.min(width, height),
        margin: Math.max(1, Math.floor(margin / 10)),
        color: { dark: lineColor, light: bgColor },
      });
    } catch { return ''; }
  }

  canvas.width = width;
  canvas.height = height;
  try {
    JsBarcode(canvas, text, {
      format,
      width: 2,
      height: height - (showText ? fontSize + 12 : 8),
      displayValue: showText,
      font: 'monospace',
      textMargin: 4,
      fontSize,
      background: bgColor,
      lineColor,
      margin,
      marginTop: margin,
      marginBottom: margin,
      marginLeft: margin,
      marginRight: margin,
    });
    return canvas.toDataURL('image/png');
  } catch { return ''; }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OutputMode = 'template' | 'standardize' | 'combined';
type LineStatus = 'pending' | 'translating' | 'done' | 'error';

type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC' | 'ITF14' | 'QR';

interface LineResult {
  original: string;
  translated?: string;
  standardized: string;
  templateMatch?: string;
  final: string;
  status: LineStatus;
  error?: string;
  barcodeUrl?: string;
}

interface BarcodeResult {
  id: string;
  text: string;
  label: string;
  url: string;
  format: BarcodeFormat;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkConverter() {
  const { user } = useAuth();
  const addNotification = useAppStore((s) => s.addNotification);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [outputMode, setOutputMode] = useState<OutputMode>('standardize');
  const [stats, setStats] = useState({ processed: 0, matched: 0, translated: 0 });

  // Translation state
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lineResults, setLineResults] = useState<LineResult[]>([]);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // ── Barcode generation state ──
  const [bcFormat, setBcFormat] = useState<BarcodeFormat>('CODE128');
  const [bcWidth, setBcWidth] = useState(200);
  const [bcHeight, setBcHeight] = useState(80);
  const [bcShowText, setBcShowText] = useState(true);
  const [bcFontSize, setBcFontSize] = useState(14);
  const [bcBgColor, setBcBgColor] = useState('#ffffff');
  const [bcLineColor, setBcLineColor] = useState('#1a1c1e');
  const [bcMargin, setBcMargin] = useState(6);
  const [bcUseOriginal, setBcUseOriginal] = useState(false);
  const [bcResults, setBcResults] = useState<BarcodeResult[]>([]);
  const [bcGenerating, setBcGenerating] = useState(false);
  const [bcProgress, setBcProgress] = useState(0);
  const [showBarcodeSection, setShowBarcodeSection] = useState(false);

  const loadTemplates = useCallback(async () => {
    const items = await db.templates.toArray();
    setTemplates(items);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const suggestTemplate = (text: string): string | null => {
    const upper = text.toUpperCase();
    for (const t of templates) {
      const rawUpper = t.raw.toUpperCase();
      if (upper.includes(rawUpper) || rawUpper.includes(upper)) return t.standard;
      const rawWords = rawUpper.split(/\s+/);
      const textWords = upper.split(/\s+/);
      const common = rawWords.filter(w => textWords.includes(w)).length;
      if (common >= Math.max(2, rawWords.length * 0.5)) return t.standard;
    }
    return null;
  };

  const handleConvert = async () => {
    if (!input.trim()) return;
    abortRef.current = false;
    setIsProcessing(true);
    setTranslateError(null);
    setLineResults([]);
    setProgress(0);
    setBcResults([]);
    setShowBarcodeSection(false);

    const rawLines = input.split('\n');
    const nonEmptyLines = rawLines.filter(l => l.trim());
    const results: LineResult[] = rawLines.map(l => ({
      original: l,
      standardized: '',
      final: '',
      status: l.trim() ? 'pending' : 'done',
    }));
    setLineResults([...results]);

    let matchedCount = 0;
    let translatedCount = 0;
    let nonEmptyProcessed = 0;

    for (let i = 0; i < rawLines.length; i++) {
      if (abortRef.current) break;
      const line = rawLines[i];
      if (!line.trim()) {
        results[i] = { ...results[i], final: '', status: 'done' };
        continue;
      }

      results[i] = { ...results[i], status: 'translating' };
      setLineResults([...results]);

      try {
        let workingText = line.trim();
        if (enableTranslation && sourceLang !== targetLang) {
          workingText = await googleTranslate(line.trim(), targetLang, sourceLang);
          results[i].translated = workingText;
          translatedCount++;
        }

        const std = standardizeTitle(workingText);
        results[i].standardized = std;

        const templateMatch = suggestTemplate(std);
        results[i].templateMatch = templateMatch || undefined;
        if (templateMatch) matchedCount++;

        let final = std;
        if (templateMatch) {
          if (outputMode === 'template') final = templateMatch;
          else if (outputMode === 'combined') final = `${templateMatch} [${std}]`;
        }
        results[i].final = final;
        results[i].status = 'done';
      } catch (e: any) {
        results[i].status = 'error';
        results[i].error = e.message;
        results[i].final = line.toUpperCase();
        setTranslateError(`Translation failed on line ${i + 1}: ${e.message}`);
      }

      nonEmptyProcessed++;
      setProgress(Math.round((nonEmptyProcessed / nonEmptyLines.length) * 100));
      setLineResults([...results]);
    }

    const finalOutput = results.map(r => r.final).join('\n');
    setOutput(finalOutput);
    setStats({ processed: nonEmptyLines.length, matched: matchedCount, translated: translatedCount });
    setIsProcessing(false);

    await logAction(
      'BULK_CONVERT',
      `Processed ${nonEmptyLines.length} lines, ${matchedCount} templates matched, ${translatedCount} translated`,
      user?.displayName || 'Unknown'
    );
  };

  const handleAbort = () => { abortRef.current = true; };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = output;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Barcode generation ──
  const generateBarcodes = async () => {
    if (!lineResults.length) return;
    setBcGenerating(true);
    setBcProgress(0);
    const results: BarcodeResult[] = [];
    const nonEmpty = lineResults.filter(r => r.original.trim());

    for (let i = 0; i < nonEmpty.length; i++) {
      const r = nonEmpty[i];
      const text = bcUseOriginal ? r.original.trim() : r.final.trim();
      if (!text) continue;
      const url = await renderBarcodeImage(
        text, bcFormat, bcWidth, bcHeight,
        bcShowText, bcFontSize, bcBgColor, bcLineColor, bcMargin
      );
      if (url) {
        results.push({
          id: `bc-${i}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          label: bcUseOriginal ? r.original : r.final,
          url,
          format: bcFormat,
        });
      }
      setBcProgress(Math.round(((i + 1) / nonEmpty.length) * 100));
    }

    setBcResults(results);
    setBcGenerating(false);
    addNotification({
      title: `${bcFormat === 'QR' ? 'QR' : 'Barcode'}s Generated`,
      message: `${results.length} ${bcFormat === 'QR' ? 'QR codes' : 'barcodes'} rendered`,
      type: 'success',
    });
  };

  const downloadBarcode = (item: BarcodeResult) => {
    const safe = item.text.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50);
    downloadDataUrl(item.url, `${bcFormat.toLowerCase()}-${safe}.png`);
  };

  const downloadBarcodeZip = async () => {
    if (!bcResults.length) return;
    const zip = new JSZip();
    const folder = zip.folder(`${bcFormat.toLowerCase()}-bulk`);
    if (!folder) return;

    for (const item of bcResults) {
      const b64 = item.url.split(',')[1];
      if (b64) {
        const safe = item.text.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50);
        folder.file(`${safe}.png`, b64, { base64: true });
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, `${bcFormat.toLowerCase()}-bulk.zip`);
    URL.revokeObjectURL(url);
    addNotification({
      title: 'ZIP Downloaded',
      message: `${bcResults.length} ${bcFormat === 'QR' ? 'QR codes' : 'barcodes'} packaged`,
      type: 'success',
    });
  };

  const applyPreset = (idx: number) => {
    const p = BARCODE_PRESETS[idx];
    setBcWidth(p.width);
    setBcHeight(p.height);
    setBcFontSize(p.fontSize);
    setBcMargin(p.margin);
  };

  const inputCount = input.split('\n').filter(Boolean).length;
  const outputCount = output.split('\n').filter(Boolean).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Bulk Title Converter</h1>
        <p className="text-sm text-text-secondary mt-1">Standardize, translate, apply templates — and generate barcodes or QR codes in bulk</p>
      </div>

      {/* ── Translation Panel ── */}
      <div className="mb-4 glass-panel rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-accent-sky" />
            <span className="text-sm font-semibold text-text-primary">Google Translate</span>
            <button
              onClick={() => setEnableTranslation(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${enableTranslation ? 'bg-accent-sky' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enableTranslation ? 'translate-x-5' : ''}`} />
            </button>
            {enableTranslation && (
              <span className="text-[10px] text-accent-sky font-semibold uppercase tracking-wider">Active</span>
            )}
          </div>

          <AnimatePresence>
            {enableTranslation && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex items-center gap-2 overflow-hidden"
              >
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-text-secondary">From</label>
                  <select
                    value={sourceLang}
                    onChange={e => setSourceLang(e.target.value)}
                    className="bg-white/[0.05] border border-white/[0.08] text-xs text-text-primary rounded-md px-2 py-1 focus:outline-none focus:border-accent-sky"
                  >
                    <option value="auto">Auto-detect</option>
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <Languages className="w-3.5 h-3.5 text-text-secondary" />
                <div className="flex items-center gap-1">
                  <label className="text-[10px] text-text-secondary">To</label>
                  <select
                    value={targetLang}
                    onChange={e => setTargetLang(e.target.value)}
                    className="bg-white/[0.05] border border-white/[0.08] text-xs text-text-primary rounded-md px-2 py-1 focus:outline-none focus:border-accent-sky"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {enableTranslation && (
          <p className="text-[10px] text-text-secondary mt-2">
            Uses the free Google Translate public endpoint — no API key required. Each line is translated individually before standardization.
          </p>
        )}
      </div>

      {/* ── Output Mode ── */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {([
          { key: 'standardize' as OutputMode, label: 'Standardize Only' },
          { key: 'template' as OutputMode, label: 'Template Only' },
          { key: 'combined' as OutputMode, label: 'Combined (Template + Std)' },
        ]).map(m => (
          <button
            key={m.key}
            onClick={() => setOutputMode(m.key)}
            className={`px-3 py-1.5 text-[10px] rounded-md border transition-all uppercase tracking-wider font-semibold ${
              outputMode === m.key
                ? 'bg-accent-sky/20 border-accent-sky/40 text-accent-sky'
                : 'bg-white/[0.02] border-white/[0.06] text-text-secondary hover:bg-white/[0.04]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Progress Bar ── */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 glass-panel rounded-lg p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-accent-sky animate-spin" />
                <span className="text-xs text-text-primary">
                  {enableTranslation ? 'Translating & Processing...' : 'Processing...'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-accent-sky font-semibold">{progress}%</span>
                <button
                  onClick={handleAbort}
                  className="flex items-center gap-1 text-[10px] text-accent-red border border-accent-red/30 px-2 py-0.5 rounded hover:bg-accent-red/10 transition-colors"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
                className="h-full rounded-full bg-accent-sky"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error Banner ── */}
      <AnimatePresence>
        {translateError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-start gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-accent-red flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-accent-red flex-1">{translateError}</p>
            <button onClick={() => setTranslateError(null)}><X className="w-3 h-3 text-accent-red" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Input (Original Titles)</h3>
            <span className="ml-auto text-[10px] text-text-secondary">{inputCount} lines</span>
          </div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full h-72 bg-transparent border border-white/[0.08] rounded-md p-3 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-sky transition-colors"
            placeholder="Paste original product titles here, one per line..."
          />
        </div>

        {/* Output */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-4 h-4 text-accent-green" />
            <h3 className="text-sm font-semibold text-text-primary">Output</h3>
            <div className="ml-auto flex items-center gap-2">
              {outputCount > 0 && <span className="text-[10px] text-text-secondary">{outputCount} lines</span>}
              {output && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[10px] bg-white/[0.05] text-text-secondary px-2 py-1 rounded hover:bg-white/[0.08] transition-colors"
                >
                  {copied ? <CheckCircle className="w-3 h-3 text-accent-green" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>
          <textarea
            value={output}
            readOnly
            className="w-full h-72 bg-transparent border border-white/[0.08] rounded-md p-3 text-xs text-text-primary font-mono resize-none focus:outline-none"
            placeholder="Converted titles will appear here..."
          />
        </div>
      </div>

      {/* ── Action ── */}
      <div className="flex items-center justify-center mt-4">
        <motion.button
          onClick={handleConvert}
          whileTap={{ scale: 0.98 }}
          disabled={!input.trim() || isProcessing}
          className="flex items-center gap-2 px-6 py-3 bg-accent-sky text-void font-semibold text-sm rounded-md hover:bg-accent-sky/90 transition-colors disabled:opacity-30"
        >
          {isProcessing
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Wand2 className="w-4 h-4" />
          }
          {isProcessing ? `Processing... ${progress}%` : (enableTranslation ? 'Translate & Convert' : 'Convert & Standardize')}
        </motion.button>
      </div>

      {stats.processed > 0 && !isProcessing && (
        <div className="mt-3 text-center space-x-4">
          <span className="text-[10px] text-text-secondary">
            Processed <span className="text-text-primary font-semibold">{stats.processed}</span> titles
          </span>
          <span className="text-[10px] text-text-secondary">
            Templates matched: <span className="text-accent-sky font-semibold">{stats.matched}</span>
          </span>
          {enableTranslation && (
            <span className="text-[10px] text-text-secondary">
              Translated: <span className="text-accent-green font-semibold">{stats.translated}</span>
            </span>
          )}
        </div>
      )}

      {/* ── Per-line Results (shown while processing) ── */}
      <AnimatePresence>
        {lineResults.length > 0 && isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 glass-panel rounded-lg p-4 max-h-52 overflow-y-auto"
          >
            <h3 className="text-[10px] text-text-secondary uppercase tracking-widest mb-2">Live Processing Log</h3>
            <div className="space-y-0.5">
              {lineResults.filter(r => r.original.trim()).map((r, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  {r.status === 'translating' && <Loader2 className="w-3 h-3 text-accent-sky animate-spin flex-shrink-0" />}
                  {r.status === 'done' && <CheckCircle className="w-3 h-3 text-accent-green flex-shrink-0" />}
                  {r.status === 'error' && <AlertTriangle className="w-3 h-3 text-accent-red flex-shrink-0" />}
                  {r.status === 'pending' && <div className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0" />}
                  <span className="text-[10px] text-text-secondary truncate">{r.original}</span>
                  {r.translated && r.translated !== r.original && (
                    <>
                      <span className="text-[10px] text-white/30">→</span>
                      <span className="text-[10px] text-accent-sky truncate">{r.translated}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
          NEW: Barcode / QR Generator Section
         ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {lineResults.some(r => r.status === 'done') && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="mt-6"
          >
            {/* Toggle Barcode Section */}
            <button
              onClick={() => setShowBarcodeSection(v => !v)}
              className="w-full flex items-center justify-between glass-panel rounded-lg p-4 hover:bg-white/[0.02] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-accent-sky/10 rounded-lg">
                  <Barcode className="w-5 h-5 text-accent-sky" />
                </div>
                <div className="text-left">
                  <h2 className="text-sm font-semibold text-text-primary">Barcode & QR Generator</h2>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    Generate {bcFormat === 'QR' ? 'QR codes' : 'barcodes'} from processed {bcUseOriginal ? 'original' : 'output'} text
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {bcResults.length > 0 && (
                  <span className="text-[10px] text-accent-sky font-semibold">{bcResults.length} generated</span>
                )}
                <ChevronRight
                  className={`w-4 h-4 text-text-secondary transition-transform ${showBarcodeSection ? 'rotate-90' : ''}`}
                />
              </div>
            </button>

            <AnimatePresence>
              {showBarcodeSection && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  {/* ── Barcode Config Panel ── */}
                  <div className="mt-4 glass-panel rounded-lg p-4 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="w-4 h-4 text-accent-yellow" />
                      <h3 className="text-sm font-semibold text-text-primary">Configuration</h3>
                    </div>

                    {/* Format Selector */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                      {BARCODE_FORMATS.map(f => (
                        <button
                          key={f.value}
                          onClick={() => setBcFormat(f.value)}
                          className={`px-3 py-2 rounded-lg text-xs text-left border transition-all ${
                            bcFormat === f.value
                              ? 'border-accent-sky/50 bg-accent-sky/10 text-accent-sky'
                              : 'border-white/[0.06] text-text-secondary hover:text-text-primary hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="font-semibold">{f.label}</div>
                          <div className="text-[10px] opacity-60 mt-0.5 leading-tight">{f.desc}</div>
                        </button>
                      ))}
                    </div>

                    {/* Source Toggle */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary">Use text from:</span>
                      <button
                        onClick={() => setBcUseOriginal(false)}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                          !bcUseOriginal
                            ? 'border-accent-sky/50 bg-accent-sky/10 text-accent-sky'
                            : 'border-white/[0.06] text-text-secondary hover:bg-white/[0.04]'
                        }`}
                      >
                        Output (Processed)
                      </button>
                      <button
                        onClick={() => setBcUseOriginal(true)}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                          bcUseOriginal
                            ? 'border-accent-sky/50 bg-accent-sky/10 text-accent-sky'
                            : 'border-white/[0.06] text-text-secondary hover:bg-white/[0.04]'
                        }`}
                      >
                        Original Input
                      </button>
                    </div>

                    {/* Dimensions & Style */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Width (px)</label>
                        <input
                          type="number"
                          value={bcWidth}
                          onChange={(e) => setBcWidth(parseInt(e.target.value) || 100)}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Height (px)</label>
                        <input
                          type="number"
                          value={bcHeight}
                          onChange={(e) => setBcHeight(parseInt(e.target.value) || 50)}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Font Size</label>
                        <input
                          type="number"
                          value={bcFontSize}
                          onChange={(e) => setBcFontSize(parseInt(e.target.value) || 12)}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-text-secondary uppercase tracking-wider mb-1 block">Margin</label>
                        <input
                          type="number"
                          value={bcMargin}
                          onChange={(e) => setBcMargin(parseInt(e.target.value) || 0)}
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-sky/50"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bcShowText}
                          onChange={(e) => setBcShowText(e.target.checked)}
                          className="w-4 h-4 accent-accent-sky rounded"
                        />
                        <span className="text-xs text-text-secondary">Show Text Below</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={bcBgColor}
                          onChange={(e) => setBcBgColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                        />
                        <input
                          type="color"
                          value={bcLineColor}
                          onChange={(e) => setBcLineColor(e.target.value)}
                          className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                        />
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {BARCODE_PRESETS.map((p, i) => (
                        <button
                          key={p.name}
                          onClick={() => applyPreset(i)}
                          className="px-3 py-2 rounded-lg text-[10px] bg-white/[0.04] border border-white/[0.06] text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-all text-left"
                        >
                          <div className="font-semibold text-text-primary">{p.name}</div>
                          <div className="mt-0.5">{p.width}×{p.height}</div>
                        </button>
                      ))}
                    </div>

                    {/* Generate Actions */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={generateBarcodes}
                        disabled={bcGenerating || !lineResults.some(r => r.status === 'done')}
                        className="flex items-center gap-2 px-5 py-2.5 bg-accent-sky text-void rounded-lg text-sm font-semibold hover:bg-accent-sky/90 transition-all disabled:opacity-40"
                      >
                        {bcGenerating ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Generating {bcProgress}%</>
                        ) : (
                          <><Wand2 className="w-4 h-4" /> Generate {bcFormat === 'QR' ? 'QR Codes' : 'Barcodes'}</>
                        )}
                      </button>
                      <button
                        onClick={downloadBarcodeZip}
                        disabled={!bcResults.length}
                        className="flex items-center gap-2 px-4 py-2.5 bg-accent-green text-void rounded-lg text-sm font-semibold hover:bg-accent-green/90 transition-all disabled:opacity-40"
                      >
                        <Download className="w-4 h-4" /> Download All ZIP
                      </button>
                      <button
                        onClick={() => setBcResults([])}
                        disabled={!bcResults.length}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] text-text-primary rounded-lg text-sm hover:bg-white/[0.08] transition-all disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" /> Clear
                      </button>
                    </div>
                  </div>

                  {/* ── Barcode Progress ── */}
                  <AnimatePresence>
                    {bcGenerating && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-3 glass-panel rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 text-accent-sky animate-spin" />
                            <span className="text-xs text-text-primary">Rendering {bcFormat === 'QR' ? 'QR codes' : 'barcodes'}...</span>
                          </div>
                          <span className="text-xs text-accent-sky font-semibold">{bcProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <motion.div
                            animate={{ width: `${bcProgress}%` }}
                            transition={{ duration: 0.2 }}
                            className="h-full rounded-full bg-accent-sky"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ── Barcode Results Grid ── */}
                  <AnimatePresence>
                    {bcResults.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-4 glass-panel rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Grid3X3 className="w-4 h-4 text-accent-sky" />
                            <h3 className="text-sm font-semibold text-text-primary">
                              {bcResults.length} {bcFormat === 'QR' ? 'QR Codes' : 'Barcodes'}
                            </h3>
                          </div>
                          <span className="text-[10px] text-text-secondary">{bcWidth}×{bcHeight}px · {bcFormat}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                          {bcResults.map((item) => (
                            <div
                              key={item.id}
                              className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-2.5 flex flex-col items-center gap-1.5"
                            >
                              <div className="h-[70px] flex items-center justify-center w-full bg-white rounded" style={{ background: bcBgColor }}>
                                <img
                                  src={item.url}
                                  alt={item.text}
                                  className="max-h-full max-w-full rounded"
                                  style={{ imageRendering: 'pixelated' }}
                                />
                              </div>
                              <p className="text-[10px] font-mono text-text-primary text-center break-all w-full leading-tight" title={item.text}>
                                {item.text.length > 20 ? item.text.slice(0, 18) + '...' : item.text}
                              </p>
                              <p className="text-[9px] text-text-secondary text-center truncate w-full">{item.label}</p>
                              <button
                                onClick={() => downloadBarcode(item)}
                                className="text-[10px] text-accent-sky hover:underline flex items-center gap-1 mt-1"
                              >
                                <Download className="w-3 h-3" /> PNG
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Mapping Legend + Templates ── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <h3 className="text-[10px] text-text-secondary uppercase tracking-widest mb-3">Keyword Mappings</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(TITLE_MAPPINGS).map(([from, to]) => (
              <div key={from} className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-md">
                <span className="text-[10px] font-mono text-accent-red">{from.trim() || '(remove)'}</span>
                <span className="text-[10px] text-text-secondary">→</span>
                <span className="text-[10px] font-mono text-accent-green">{to.trim() || '(remove)'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-3.5 h-3.5 text-accent-sky" />
            <h3 className="text-[10px] text-text-secondary uppercase tracking-widest">Template Database</h3>
            <span className="ml-auto text-[10px] text-text-secondary">{templates.length} templates</span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {templates.slice(0, 10).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-[10px] p-1.5 bg-white/[0.02] rounded-md">
                <FileText className="w-3 h-3 text-text-secondary flex-shrink-0" />
                <span className="text-text-secondary truncate">{t.raw}</span>
                <span className="text-text-secondary/50">→</span>
                <span className="text-accent-green truncate">{t.standard}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
