'use client';

import type { StaySummaryDto } from '@riad/shared';
import { BellRing, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

type Handler = (payload: unknown) => void;
type RealtimeContextValue = { subscribe: (event: string, handler: Handler) => () => void };

const RealtimeContext = createContext<RealtimeContextValue | null>(null);
const RETRY_MS = 30_000;
const TOAST_MS = 15_000;

/**
 * One Socket.io connection per dashboard tab (session cookie auth). Shows a toast for
 * new self check-ins and lets pages subscribe to events to refresh their data.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  // Housekeeping (rooms.read only) gets room status changes; guest events need stays.read.
  // Cash box holders and managers connect for their notifications.
  const enabled = can('stays.read', 'rooms.read', 'expenses.read_all', 'expenses.write_petty_cash');
  const listeners = useRef(new Map<string, Set<Handler>>());
  const [toast, setToast] = useState<StaySummaryDto | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
      path: '/api/v1/socket.io',
      withCredentials: true,
    });
    let retry: ReturnType<typeof setTimeout> | undefined;
    const dispatch = (event: string, payload: unknown) =>
      listeners.current.get(event)?.forEach((h) => h(payload));

    socket.on('checkin:new', (stay: StaySummaryDto) => {
      setToast(stay);
      navigator.vibrate?.(200);
      dispatch('checkin:new', stay);
    });
    for (const event of ['rooms:changed', 'stays:changed', 'notifications:changed']) socket.on(event, (payload: unknown) => dispatch(event, payload));
    // The server drops sockets whose session expired; REST calls refresh the cookie, so
    // try again a little later.
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') retry = setTimeout(() => socket.connect(), RETRY_MS);
    });
    return () => {
      clearTimeout(retry);
      socket.disconnect();
    };
  }, [enabled]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const subscribe = useCallback((event: string, handler: Handler) => {
    const set = listeners.current.get(event) ?? new Set<Handler>();
    set.add(handler);
    listeners.current.set(event, set);
    return () => set.delete(handler);
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribe }}>
      {children}
      {toast && <CheckinToast stay={toast} onClose={() => setToast(null)} />}
    </RealtimeContext.Provider>
  );
}

/** Calls `handler` whenever the server emits `event` (no-op outside the provider). */
export function useRealtimeEvent(event: string, handler: Handler): void {
  const ctx = useContext(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const unsubscribe = ctx?.subscribe(event, (p) => latest.current(p));
    return () => {
      unsubscribe?.();
    };
  }, [ctx, event]);
}

function CheckinToast({ stay, onClose }: { stay: StaySummaryDto; onClose: () => void }) {
  const t = useTranslations('realtime');
  const name = stay.mainGuest ? `${stay.mainGuest.firstName} ${stay.mainGuest.lastName}` : '';
  const room = stay.requestedRoom?.name;
  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed end-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-xl bg-primary p-4 text-primary-foreground shadow-lg animate-in slide-in-from-bottom-4 fade-in-0"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <BellRing className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white/80">{t('newCheckin')}</div>
        <div className="truncate font-semibold">{name}</div>
        <div className="text-xs text-white/75">
          {t('guests', { count: stay.adults + stay.children })}
          {room && ` · ${room}`}
        </div>
        <Button asChild size="sm" variant="secondary" className="mt-3" onClick={onClose}>
          <Link href={`/dashboard/stays/${stay.id}`}>{t('review')}</Link>
        </Button>
      </div>
      <button type="button" onClick={onClose} className="rounded-md p-1 text-white/75 hover:bg-white/10" aria-label={t('dismiss')}>
        <X className="size-4" />
      </button>
    </div>
  );
}
