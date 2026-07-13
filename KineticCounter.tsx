import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface KineticCounterProps {
  value: number;
  size?: number;
}

export default function KineticCounter({ value, size = 60 }: KineticCounterProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const digits = displayValue.toLocaleString().split('');

  return (
    <div
      className="flex items-center justify-center font-mono tracking-tighter text-accent-sky"
      style={{ gap: '2px' }}
    >
      {digits.map((char, i) => (
        <span
          key={`${i}-${char}`}
          className="inline-block overflow-hidden bg-void rounded-sm border border-white/10 text-center"
          style={{
            width: size * 0.75,
            height: size,
            lineHeight: `${size}px`,
            fontSize: size * 0.8,
          }}
        >
          {char === ',' ? (
            ','
          ) : (
            <motion.div
              initial={{ y: size }}
              animate={{ y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {parseInt(char)}
            </motion.div>
          )}
        </span>
      ))}
    </div>
  );
}
