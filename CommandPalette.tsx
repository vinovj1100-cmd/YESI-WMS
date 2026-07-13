import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Command } from 'cmdk';
import { useAppStore } from '@/lib/store';
import {
  LayoutDashboard, Package, PackageOpen, ClipboardList, RotateCcw,
  ScanBarcode, Scale, RefreshCw, FileText, Brain, ClipboardCheck,
  BarChart3, Zap, ShieldCheck, Settings, Users, Smartphone, Shield,
  Camera, QrCode, X, Search, Bell, ChevronRight, Barcode, Truck,
  ArrowDownToLine, Fingerprint, Layers, UsersRound, Bot, Plug, Sheet
} from 'lucide-react';

const navRoutes = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', keywords: 'home overview stats' },
  { icon: Package, label: 'Inbound Receiving', path: '/inbound', keywords: 'receive goods incoming' },
  { icon: ClipboardList, label: 'Inventory Hub', path: '/inventory', keywords: 'stock items sku' },
  { icon: Fingerprint, label: 'Serial Tracking', path: '/serial-tracking', keywords: 'serial imei traceability' },
  { icon: ArrowDownToLine, label: 'Putaway Management', path: '/putaway', keywords: 'putaway directed slotting' },
  { icon: PackageOpen, label: 'Pick & Pack', path: '/pick-pack', keywords: 'orders fulfill ship' },
  { icon: Layers, label: 'Batch Pick Center', path: '/batch-pick', keywords: 'batch wave zone pick path' },
  { icon: RotateCcw, label: 'Returns', path: '/returns', keywords: 'refund restock' },
  { icon: Truck, label: 'Shipping', path: '/shipping', keywords: 'carrier label tracking' },
  { icon: Truck, label: 'Dock Management', path: '/dock', keywords: 'dock yard asn appointment' },
  { icon: ScanBarcode, label: 'PDF Sequencer', path: '/pdf-sequencer', keywords: 'pdf labels' },
  { icon: Scale, label: 'Auditor', path: '/auditor', keywords: 'audit check' },
  { icon: RefreshCw, label: 'Bulk Converter', path: '/bulk-convert', keywords: 'convert batch' },
  { icon: FileText, label: 'Templates', path: '/templates', keywords: 'template alias' },
  { icon: Brain, label: 'Memory', path: '/memory', keywords: 'settings pref' },
  { icon: ClipboardCheck, label: 'Cycle Count', path: '/cycle-count', keywords: 'count stocktake' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics', keywords: 'charts reports kpi' },
  { icon: Zap, label: 'Replenishment', path: '/replenishment', keywords: 'restock reorder' },
  { icon: UsersRound, label: 'Labor Management', path: '/labor', keywords: 'worker labor uph performance' },
  { icon: Plug, label: 'Integrations', path: '/integrations', keywords: 'erp oms api sync' },
  { icon: Sheet, label: 'Ozon Sheets Hub', path: '/ozon-sheets', keywords: 'google sheets ozon fulfillment sync csv' },
  { icon: ShieldCheck, label: 'QC Management', path: '/qc', keywords: 'quality control hold' },
  { icon: Camera, label: 'Posting Tracker', path: '/posting-tracker', keywords: 'track photo geotag' },
  { icon: QrCode, label: 'Barcode Scanner', path: '/barcode-scanner', keywords: 'scan qr camera' },
  { icon: Barcode, label: 'Barcode Generator', path: '/barcode-generator', keywords: 'generate label print create' },
  { icon: Users, label: 'User Management', path: '/users', keywords: 'staff accounts' },
  { icon: Smartphone, label: 'SIM Manager', path: '/sim-manager', keywords: 'sim tac' },
  { icon: Shield, label: 'Guardian Ops', path: '/guardian', keywords: 'ai ops monitor' },
  { icon: Settings, label: 'Settings', path: '/settings', keywords: 'config preferences' },
];

export default function CommandPalette() {
  const open = useAppStore((s) => s.commandPaletteOpen);
  const setOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const setAiOpen = useAppStore((s) => s.setAiAssistantOpen);
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');

  const handleSelect = useCallback(
    (path: string) => {
      setOpen(false);
      setSearch('');
      navigate(path);
    },
    [navigate, setOpen]
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl bg-surface border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
        <Command className="flex flex-col" loop>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
            <Search className="w-4 h-4 text-text-secondary" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search pages, actions, or type a command..."
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary outline-none"
              autoFocus
            />
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-text-secondary bg-white/[0.06] rounded border border-white/[0.08]">ESC</kbd>
            </div>
            <button onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-sm text-text-secondary text-center">
              No results found for "{search}"
            </Command.Empty>

            <Command.Group heading="AI Assistant">
              <Command.Item
                value="vortex ai assistant chat help"
                onSelect={() => { setOpen(false); setSearch(''); setAiOpen(true); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm cursor-pointer text-text-primary hover:bg-white/[0.04]"
              >
                <Bot className="w-4 h-4 text-accent-sky" />
                <span className="flex-1">Open Vortex AI Assistant</span>
                <ChevronRight className="w-3 h-3 text-text-secondary" />
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigation">
              {navRoutes.map((route) => (
                <Command.Item
                  key={route.path}
                  value={`${route.label} ${route.keywords}`}
                  onSelect={() => handleSelect(route.path)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors ${
                    location.pathname === route.path
                      ? 'bg-accent-sky/10 text-accent-sky'
                      : 'text-text-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <route.icon className="w-4 h-4 text-text-secondary" />
                  <span className="flex-1">{route.label}</span>
                  {location.pathname === route.path && (
                    <span className="text-[10px] text-text-secondary">Current</span>
                  )}
                  <ChevronRight className="w-3 h-3 text-text-secondary" />
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] text-[10px] text-text-secondary">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 font-mono bg-white/[0.06] rounded border border-white/[0.08]">↑↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 font-mono bg-white/[0.06] rounded border border-white/[0.08]">↵</kbd>
                to select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Bell className="w-3 h-3" />
              Vortex WMS Command Palette
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
