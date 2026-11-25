'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useToast, type FeedbackKey } from '@/components/feedback';
import { api, ApiError } from './api';

type QueryState<T> = { data?: T; error?: ApiError; loading: boolean };

/** GET `path` (null = skip) and re-fetch on `reload()` or when the path changes. */
export function useApiQuery<T>(path: string | null) {
  const [state, setState] = useState<QueryState<T>>({ loading: path !== null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path)
      .then((data) => !cancelled && setState({ data, loading: false }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const e = error instanceof ApiError ? error : new ApiError(0, 'NETWORK', String(error));
        setState((s) => ({ ...s, error: e, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/**
 * Runs a mutation, exposing `pending` and a translated error message.
 * Resolves to `undefined` only on failure: a call with no body (204) resolves to `true`,
 * so `if (await run(...))` works for deletes too.
 */
/**
 * Runs one user action: pending flag, translated error, and with `success` a short
 * message that goes away on its own (toast).
 */
export function useAction() {
  const errorMessage = useApiErrorMessage();
  const toast = useToast();
  const tf = useTranslations('feedback');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      options?: { success?: FeedbackKey },
    ): Promise<(T extends void | undefined ? true : T) | undefined> => {
      setPending(true);
      setError(null);
      try {
        const result = await fn();
        if (options?.success) toast.success(tf(options.success));
        return (result === undefined ? true : result) as T extends void | undefined ? true : T;
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [errorMessage, toast, tf],
  );

  return { run, pending, error, setError };
}

/** Maps an API error `code` to a translated message (errors.<CODE>), with a fallback. */
export function useApiErrorMessage() {
  const t = useTranslations('errors');
  return useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError && t.has(e.code)) return t(e.code);
      return t('generic');
    },
    [t],
  );
}
