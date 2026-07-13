import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, logAction } from './db';

interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'operator' | 'supervisor';
  displayName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAdmin: boolean;
  loading: boolean;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => false,
  logout: () => {},
  isAdmin: false,
  loading: true,
  updateUser: () => {},
});

const SESSION_TIMEOUT_MINUTES = 30;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());

  // Check for session expiry
  useEffect(() => {
    const stored = localStorage.getItem('vortex_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.expiresAt && new Date(session.expiresAt) > new Date()) {
          setUser(session.user);
        } else {
          localStorage.removeItem('vortex_session');
        }
      } catch {
        localStorage.removeItem('vortex_session');
      }
    }
    setLoading(false);
  }, []);

  // Session timeout enforcement
  useEffect(() => {
    if (!user) return;

    const checkTimeout = () => {
      const inactive = Date.now() - lastActivity;
      if (inactive > SESSION_TIMEOUT_MINUTES * 60 * 1000) {
        logout();
      }
    };

    const interval = setInterval(checkTimeout, 60000); // check every minute

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const updateActivity = () => setLastActivity(Date.now());
    activityEvents.forEach(e => window.addEventListener(e, updateActivity));

    return () => {
      clearInterval(interval);
      activityEvents.forEach(e => window.removeEventListener(e, updateActivity));
    };
  }, [user, lastActivity]);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    const found = await db.users
      .where('username').equals(username)
      .filter(user => user.password === password)
      .first();

    if (found && found.id) {
      const sessionUser: AuthUser = {
        id: found.id,
        username: found.username,
        role: found.role,
        displayName: found.displayName,
      };

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + SESSION_TIMEOUT_MINUTES);

      localStorage.setItem('vortex_session', JSON.stringify({
        user: sessionUser,
        expiresAt: expiresAt.toISOString(),
      }));

      setUser(sessionUser);
      setLastActivity(Date.now());
      await logAction('LOGIN', `User ${username} logged in`, found.displayName);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    if (user) {
      logAction('LOGOUT', `User ${user.username} logged out`, user.displayName);
    }
    localStorage.removeItem('vortex_session');
    setUser(null);
  }, [user]);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      const stored = localStorage.getItem('vortex_session');
      if (stored) {
        try {
          const session = JSON.parse(stored);
          session.user = updated;
          localStorage.setItem('vortex_session', JSON.stringify(session));
        } catch {
          // ignore
        }
      }
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAdmin: user?.role === 'admin',
      loading,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
