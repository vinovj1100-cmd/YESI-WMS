import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import AIAssistant from './AIAssistant';
import { useAuth } from '@/lib/auth';
import { startAutomationLoop, stopAutomationLoop } from '@/lib/ozonAutomation';
import { registerDeviceHeartbeat } from '@/lib/deviceRegistry';

export default function Layout() {
  const location = useLocation();
  const { user } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const operator = user?.displayName || user?.username || 'System';

  useEffect(() => {
    registerDeviceHeartbeat(operator).catch(console.error);
    startAutomationLoop(operator, 5);
    const heartbeat = setInterval(() => {
      registerDeviceHeartbeat(operator).catch(console.error);
    }, 60000);
    return () => {
      clearInterval(heartbeat);
      stopAutomationLoop();
    };
  }, [operator]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar mobileOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <TopBar onMenuToggle={() => setMobileSidebarOpen(prev => !prev)} />

      <AIAssistant />
      <main className="relative flex-1 lg:ml-[240px] mt-14 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="p-4 lg:p-6"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
