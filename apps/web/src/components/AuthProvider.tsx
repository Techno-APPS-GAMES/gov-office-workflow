'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ROLE_NAV, type Role } from '@gow/shared';
import {
  SessionUser,
  api,
  clearTokens,
  loadUser,
  saveUser,
  setTokens,
} from '@/lib/api';
import { Lang, t } from '@/lib/i18n';

type AuthCtx = {
  user: SessionUser | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  login: (username: string, password: string, totpCode?: string) => Promise<{ mfaSetupRequired: boolean }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  nav: string[];
  label: (key: string) => string;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [lang, setLang] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(loadUser());
    const stored = localStorage.getItem('gow_lang') as Lang | null;
    if (stored === 'en' || stored === 'ur') setLang(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('gow_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);

  const login = useCallback(async (username: string, password: string, totpCode?: string) => {
    const res = await api<{
      user: SessionUser;
      accessToken: string;
      refreshToken: string;
      mfaSetupRequired: boolean;
    }>('/auth/login', { method: 'POST', json: { username, password, totpCode } });
    setTokens(res.accessToken, res.refreshToken);
    saveUser(res.user);
    setUser(res.user);
    return { mfaSetupRequired: res.mfaSetupRequired };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearTokens();
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await api<{ user: SessionUser }>('/auth/me', { method: 'POST' });
      if (res.user) {
        saveUser(res.user);
        setUser(res.user);
      }
    } catch {
      setUser(loadUser());
    }
  }, []);

  const nav = useMemo(() => {
    if (!user) return [];
    return ROLE_NAV[user.role as Role] || ROLE_NAV.ADMIN;
  }, [user]);

  const label = useCallback((key: string) => t(lang, key), [lang]);

  if (!ready) return null;

  return (
    <Ctx.Provider value={{ user, lang, setLang, login, logout, refreshMe, nav, label }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}
