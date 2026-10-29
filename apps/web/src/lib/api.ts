import type { ApiError as ApiErrorShape } from '@riad/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** One refresh at a time, shared by every request that hit a 401 concurrently. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

type ApiInit = Omit<RequestInit, 'body'> & { body?: unknown };

/** Browser-side client for the API (same-origin through the Next.js rewrite). */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const doFetch = () =>
    fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await doFetch();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiErrorShape>;
    throw new ApiError(
      res.status,
      body.code ?? 'ERROR',
      body.message ?? res.statusText,
      body.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Multipart upload (receipts…), with the same session refresh as `api`. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const doFetch = () => fetch(`/api/v1${path}`, { method: 'POST', body: form, credentials: 'same-origin' });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) res = await doFetch();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiErrorShape>;
    throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? res.statusText, body.details);
  }
  return (await res.json()) as T;
}

/** Downloads a file endpoint (session-authenticated) and saves it with the server's filename. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const doFetch = () => fetch(`/api/v1${path}`, { credentials: 'same-origin' });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) res = await doFetch();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiErrorShape>;
    throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? res.statusText, body.details);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
