import { motion } from 'framer-motion';

interface SyncStatusProps {
  isOnline: boolean;
}

export default function SyncStatus({ isOnline }: SyncStatusProps) {
  const waveCount = 5;

  return (
    <div className="flex items-center gap-2 text-xs text-text-secondary">
      <div className="flex items-center gap-[1px] h-4">
        {Array.from({ length: waveCount }).map((_, i) => (
          <motion.div
            key={i}
            className="w-[2px] bg-accent-green rounded-full"
            style={{ height: '100%' }}
            animate={isOnline ? { scaleY: [0.2, 1, 0.2] } : { scaleY: 0.2 }}
            transition={
              isOnline
                ? { duration: 0.8, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }
                : {}
            }
          />
        ))}
      </div>
      <span className="uppercase tracking-widest">
        {isOnline ? (
          <>
            <span className="text-accent-green">ONLINE</span>
            {' \u2022 SYNCED'}
          </>
        ) : (
          <>
            <span className="text-accent-red">OFFLINE</span>
            {' \u2022 LOCAL MODE'}
          </>
        )}
      </span>
    </div>
  );
}
