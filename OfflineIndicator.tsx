import { useState, useEffect } from 'react';
import { WifiOff, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsSyncing(true);
      // Simulate sync delay
      setTimeout(() => setIsSyncing(false), 2000);
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-accent-red/90 text-void px-4 py-2 flex items-center justify-center gap-2 backdrop-blur-md"
        >
          <WifiOff className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Offline Mode</span>
          <span className="text-[10px] ml-2 opacity-80">Local changes will sync when connection is restored</span>
        </motion.div>
      )}
      
      {isOnline && isSyncing && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-accent-green/90 text-void px-4 py-2 flex items-center justify-center gap-2 backdrop-blur-md"
        >
          <RefreshCcw className="w-4 h-4 animate-spin" />
          <span className="text-xs font-bold uppercase tracking-widest">Syncing Changes...</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
