import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import SyncStatus from './SyncStatus';
import { User, Shield, Menu, Bell, X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface TopBarProps {
  onMenuToggle?: () => void;
}

const TYPE_ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertTriangle,
  info: Info,
};

const TYPE_COLORS = {
  success: 'text-accent-green',
  warning: 'text-accent-yellow',
  error: 'text-accent-red',
  info: 'text-accent-sky',
};

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, isAdmin } = useAuth();
  const notifications = useAppStore((s) => s.notifications);
  const markRead = useAppStore((s) => s.markRead);
  const clearNotifications = useAppStore((s) => s.clearNotifications);
  const unread = notifications.filter((n) => !n.read).length;

  const [isOnline, setIsOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNotifs, setShowNotifs] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    if (showNotifs) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifs]);

  const openNotifs = () => {
    setShowNotifs((v) => !v);
    notifications.filter((n) => !n.read).forEach((n) => markRead(n.id));
  };

  return (
    <header className="fixed top-0 left-0 lg:left-[240px] right-0 h-14 glass-panel border-b border-white/[0.06] flex items-center justify-between px-4 lg:px-5 z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 -ml-2 text-text-secondary hover:text-text-primary rounded-md hover:bg-white/5 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <SyncStatus isOnline={isOnline} />
      </div>

      <div className="flex items-center gap-3 lg:gap-5">
        <div className="text-xs text-text-secondary font-mono hidden sm:block">
          {currentTime.toLocaleTimeString('en-US', { hour12: false })}
          {' \u2022 '}
          {currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>

        <div className="h-5 w-px bg-white/10 hidden sm:block" />

        <div className="relative" ref={panelRef}>
          <button
            onClick={openNotifs}
            className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent-red text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden rounded-xl bg-surface border border-white/10 shadow-2xl z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-sm font-semibold text-text-primary">Alerts</span>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <button
                      onClick={clearNotifications}
                      className="text-[10px] text-text-secondary hover:text-text-primary"
                    >
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setShowNotifs(false)} className="p-1 hover:bg-white/5 rounded">
                    <X className="w-3.5 h-3.5 text-text-secondary" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-72">
                {notifications.length === 0 ? (
                  <p className="p-4 text-xs text-text-secondary text-center">No alerts yet</p>
                ) : (
                  notifications.map((n) => {
                    const Icon = TYPE_ICONS[n.type];
                    return (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 ${!n.read ? 'bg-white/[0.02]' : ''}`}
                        onClick={() => markRead(n.id)}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${TYPE_COLORS[n.type]}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-text-primary">{n.title}</p>
                            <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-[10px] text-text-secondary/60 mt-1">
                              {new Date(n.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent-sky/20 flex items-center justify-center">
            {isAdmin ? (
              <Shield className="w-3.5 h-3.5 text-accent-sky" />
            ) : (
              <User className="w-3.5 h-3.5 text-accent-sky" />
            )}
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-semibold text-text-primary leading-tight">
              {user?.displayName || 'Unknown'}
            </span>
            <span className="text-[10px] text-text-secondary uppercase tracking-wider">
              {isAdmin ? 'Admin' : 'Operator'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}