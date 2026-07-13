import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

interface BarcodeReaderProps {
  onScan: (code: string) => void;
  placeholder?: string;
}

export default function BarcodeReader({ onScan, placeholder = 'Scan barcode or type and press Enter...' }: BarcodeReaderProps) {
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawBarcodeVisualization = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const w = canvas.width = canvas.offsetWidth || 300;
    const h = canvas.height = canvas.offsetHeight || 128;
    
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e2024';
    ctx.fillRect(0, 0, w, h);
    
    // Draw random barcode-like lines
    for (let i = 0; i < w; i += 4) {
      const barWidth = Math.random() > 0.5 ? 2 : 1;
      const opacity = Math.random() * 0.3 + 0.1;
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fillRect(i, 0, barWidth, h);
    }
  }, []);

  useEffect(() => {
    drawBarcodeVisualization();
    const interval = setInterval(() => {
      if (!scanning) drawBarcodeVisualization();
    }, 2000);
    return () => clearInterval(interval);
  }, [scanning, drawBarcodeVisualization]);

  const triggerScan = useCallback((scanCode: string) => {
    setScanning(true);
    setCode('');
    setInputValue('');

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setScanning(false);
      setCode(scanCode);
      onScan(scanCode);
    }, 1200);
  }, [onScan]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      triggerScan(inputValue.trim().toUpperCase());
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full h-32 bg-surface border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden rounded-md">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30" />

        {scanning && (
          <motion.div
            className="absolute left-0 w-full h-[2px] bg-accent-red z-10"
            style={{ boxShadow: '0 0 10px #e63946' }}
            initial={{ top: '0%' }}
            animate={{ top: '100%' }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          />
        )}

        <span className="text-text-secondary text-xs z-20 font-mono">
          {code ? code : (scanning ? 'Reading barcode...' : 'Ready to scan')}
        </span>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-white/10 text-text-primary text-sm py-2 px-1 focus:outline-none focus:border-accent-sky transition-colors font-mono"
        autoFocus
      />
    </div>
  );
}
