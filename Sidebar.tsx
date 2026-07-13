import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import {
  LayoutDashboard,
  Package,
  PackageOpen,
  RotateCcw,
  ScanBarcode,
  Scale,
  RefreshCw,
  Settings,
  Users,
  LogOut,
  Hexagon,
  BarChart3,
  ClipboardCheck,
  Zap,
  ShieldCheck,
  FileText,
  Brain,
  Smartphone,
  Shield,
  X,
  Camera,
  QrCode,
  Barcode,
  Truck,
  Plug,
  ArrowDownToLine,
  Fingerprint,
  Layers,
  UsersRound,
  Bot,
  Sheet,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

// 1. Operations
const operationItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Package, label: 'Inbound Receiving', path: '/inbound' },
  { icon: ArrowDownToLine, label: 'Putaway', path: '/putaway' },
  { icon: PackageOpen, label: 'Pick & Pack', path: '/pick-pack' },
  { icon: Layers, label: 'Batch Pick', path: '/batch-pick' },
  { icon: RotateCcw, label: 'Returns', path: '/returns' },
  { icon: Truck, label: 'Shipping', path: '/shipping' },
  { icon: Truck, label: 'Dock & Yard', path: '/dock' },
  { icon: Camera, label: 'Posting Tracker', path: '/posting-tracker' },
  { icon: Sheet, label: 'Ozon Sheets', path: '/ozon-sheets' },
];

// 2. Advanced
const advancedItems = [
  { icon: ClipboardCheck, label: 'Inventory Hub', path: '/inventory' },
  { icon: Fingerprint, label: 'Serial Tracking', path: '/serial-tracking' },
  { icon: ClipboardCheck, label: 'Cycle Count', path: '/cycle-count' },
  { icon: Zap, label: 'Replenishment', path: '/replenishment' },
  { icon: UsersRound, label: 'Labor Management', path: '/labor' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics' },
  { icon: ShieldCheck, label: 'QC Management', path: '/qc' },
  { icon: Plug, label: 'Integrations', path: '/integrations' },
  { icon: Brain, label: 'Labors Memory', path: '/memory' },
  { icon: QrCode, label: 'Barcode Scanner', path: '/barcode-scanner' },
];

// 3. Manual Orders
const manualOrderItems = [
  { icon: ScanBarcode, label: 'PDF Sequencer', path: '/pdf-sequencer' },
  { icon: FileText, label: 'Templates', path: '/templates' },
  { icon: RefreshCw, label: 'Bulk Converter', path: '/bulk-convert' },
  { icon: Scale, label: 'Auditor', path: '/auditor' },
];

// 4. Administration
const adminItems = [
  { icon: Users, label: 'User Management', path: '/users' },
  { icon: Smartphone, label: 'SIM(IMEI) Manager', path: '/sim-manager' },
  { icon: Shield, label: 'Guardian OPs', path: '/guardian' },
  { icon: Bot, label: 'Vortex AI', path: '/ai-assistant', aiTrigger: true },
  { icon: Barcode, label: 'Barcode Generator', path: '/barcode-generator' },
];

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, logout } = useAuth();
  const setAiAssistantOpen = useAppStore((s) => s.setAiAssistantOpen);

  const handleNav = (path: string, aiTrigger?: boolean) => {
    if (aiTrigger) {
      setAiAssistantOpen(true);
    } else {
      navigate(path);
    }
    if (onClose) onClose();
  };

  const sidebarBaseStyle = {
    background: 'linear-gradient(180deg, rgba(16, 16, 18, 0.98) 0%, rgba(8, 8, 10, 0.98) 100%)',
    backdropFilter: 'blur(20px) saturate(150%)',
    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  };

  const renderNavItems = (items: (typeof operationItems[number] & { aiTrigger?: boolean })[]) =>
    items.map((item) => {
      const isActive = !item.aiTrigger && location.pathname === item.path;
      return (
        <button
          key={item.path}
          onClick={() => handleNav(item.path, item.aiTrigger)}
          className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group"
          style={isActive ? {
            background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.12) 0%, rgba(56, 189, 248, 0.04) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(56, 189, 248, 0.08)',
          } : {
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)';
              e.currentTarget.style.border = '1px solid rgba(255,255,255,0.04)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
            }
          }}
        >
          {isActive && (
            <motion.div
              layoutId="activeNav"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-accent-sky rounded-r-full"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <item.icon className={`w-4 h-4 ${isActive ? 'text-accent-sky' : ''}`} />
          <span className={`font-medium ${isActive ? 'text-white' : 'text-text-secondary group-hover:text-white'}`}>
            {item.label}
          </span>
        </button>
      );
    });

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 h-full w-[240px] border-r border-white/[0.06] flex-col z-50"
        style={sidebarBaseStyle}
      >
        {/* Top glossy highlight line */}
        <div
          className="absolute top-0 left-0 right-0 h-px z-10"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }}
        />

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
              boxShadow: '0 4px 16px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <Hexagon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">YESI-FULFILLMENT</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">Warehouse Ops</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          {/* 1. Operations */}
          <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-2">1. Operations</div>
          {renderNavItems(operationItems)}

          {/* 2. Advanced */}
          <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-4">2. Advanced</div>
          {renderNavItems(advancedItems)}

          {/* 3. Manual Orders */}
          <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-4">3. Manual Orders</div>
          {renderNavItems(manualOrderItems)}

          {/* 4. Administration (admin only) */}
          {isAdmin && (
            <>
              <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-4">4. Administration</div>
              {renderNavItems(adminItems)}
            </>
          )}
        </nav>

        {/* Bottom: 5. Settings & 6. Sign Out */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2">5. Settings</div>
          <button
            onClick={() => handleNav('/settings')}
            className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 mb-1"
            style={location.pathname === '/settings' ? {
              background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.12) 0%, rgba(56, 189, 248, 0.04) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.12)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(56, 189, 248, 0.08)',
            } : { border: '1px solid transparent' }}
            onMouseEnter={(e) => {
              if (location.pathname !== '/settings') {
                e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)';
                e.currentTarget.style.border = '1px solid rgba(255,255,255,0.04)';
              }
            }}
            onMouseLeave={(e) => {
              if (location.pathname !== '/settings') {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.border = '1px solid transparent';
              }
            }}
          >
            {location.pathname === '/settings' && (
              <motion.div
                layoutId="activeNav"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-accent-sky rounded-r-full"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Settings className={`w-4 h-4 ${location.pathname === '/settings' ? 'text-accent-sky' : ''}`} />
            <span className={`font-medium ${location.pathname === '/settings' ? 'text-white' : 'text-text-secondary'}`}>
              Settings
            </span>
          </button>

          <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-3">6. Sign Out</div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:text-accent-red transition-all duration-200"
            style={{ border: '1px solid transparent' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(180deg, rgba(230, 57, 70, 0.08) 0%, rgba(230, 57, 70, 0.02) 100%)';
              e.currentTarget.style.border = '1px solid rgba(230, 57, 70, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.border = '1px solid transparent';
            }}
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed left-0 top-0 h-full w-[260px] border-r border-white/[0.06] flex-col z-50 flex"
              style={sidebarBaseStyle}
            >
              {/* Top glossy highlight line */}
              <div
                className="absolute top-0 left-0 right-0 h-px z-10"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }}
              />

              {/* Logo + Close */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                      boxShadow: '0 4px 16px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                    }}
                  >
                    <Hexagon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold text-white tracking-tight">YESI-FULFILLMENT</h1>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">Warehouse Ops</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1 text-text-secondary hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 py-3 px-3 overflow-y-auto">
                <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-2">1. Operations</div>
                {renderNavItems(operationItems)}

                <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-4">2. Advanced</div>
                {renderNavItems(advancedItems)}

                <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-4">3. Manual Orders</div>
                {renderNavItems(manualOrderItems)}

                {isAdmin && (
                  <>
                    <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-4">4. Administration</div>
                    {renderNavItems(adminItems)}
                  </>
                )}
              </nav>

              {/* Bottom */}
              <div className="p-3 border-t border-white/[0.06]">
                <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2">5. Settings</div>
                <button
                  onClick={() => handleNav('/settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 mb-1 ${
                    location.pathname === '/settings'
                      ? 'text-white'
                      : 'text-text-secondary'
                  }`}
                  style={location.pathname === '/settings' ? {
                    background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.12) 0%, rgba(56, 189, 248, 0.04) 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.12)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(56, 189, 248, 0.08)',
                  } : { border: '1px solid transparent' }}
                >
                  <Settings className={`w-4 h-4 ${location.pathname === '/settings' ? 'text-accent-sky' : ''}`} />
                  <span className="font-medium">Settings</span>
                </button>

                <div className="text-[10px] text-white/30 uppercase tracking-widest px-3 mb-2 mt-3">6. Sign Out</div>
                <button
                  onClick={() => { logout(); if (onClose) onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-secondary hover:text-accent-red transition-all duration-200"
                  style={{ border: '1px solid transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, rgba(230, 57, 70, 0.08) 0%, rgba(230, 57, 70, 0.02) 100%)';
                    e.currentTarget.style.border = '1px solid rgba(230, 57, 70, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.border = '1px solid transparent';
                  }}
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
