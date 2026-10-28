'use client';

import { hasAnyPermission, type AuthUser } from '@riad/shared';
import { useLocale, useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type AuthContextValue = {
  user: AuthUser;
  /** UI convenience only — the API enforces every permission itself. */
  can: (...anyOf: string[]) => boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<AuthUser>('/auth/me')
      .then((u) => !cancelled && setUser(u))
      .catch(() => {
        if (!cancelled) window.location.replace(`/${locale}/login`);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.replace(`/${locale}/login`);
  }, [locale]);

  const value = useMemo<AuthContextValue | null>(
    () =>
      user && {
        user,
        can: (...anyOf: string[]) => anyOf.length === 0 || hasAnyPermission(user.permissions, anyOf),
        logout,
      },
    [user, logout],
  );

  if (!value) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground" aria-busy>
        {t('loading')}
      </div>
    );
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
