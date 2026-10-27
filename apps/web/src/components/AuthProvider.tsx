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

const LANG_KEY = 'gow_lang';

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'ur') return stored;
  } catch {
    /* ignore */
  }
  return 'en';
}

function applyDocumentLang(lang: Lang) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = lang === 'ur' ? 'ur' : 'en';
  root.dir = lang === 'ur' ? 'rtl' : 'ltr';
  root.classList.toggle('lang-ur', lang === 'ur');
}

function persistLangCookie(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.cookie = `gow_lang=${lang};path=/;max-age=31536000;SameSite=Lax`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [lang, setLangState] = useState<Lang>('en');
  const [ready, setReady] = useState(false);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
    applyDocumentLang(next);
    persistLangCookie(next);
  }, []);

  useEffect(() => {
    setUser(loadUser());
    const stored = readStoredLang();
    setLangState(stored);
    applyDocumentLang(stored);
    persistLangCookie(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
    applyDocumentLang(lang);
    persistLangCookie(lang);
  }, [lang, ready]);

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
