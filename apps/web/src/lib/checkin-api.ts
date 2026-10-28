import type { ApiError as ApiErrorShape } from '@riad/shared';
import { ApiError } from './api';

/** Unauthenticated calls for the guest check-in pages (no session, no refresh). */
async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/checkin${path}`, init);
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<ApiErrorShape>;
    throw new ApiError(res.status, body.code ?? (res.status === 429 ? 'TOO_MANY_REQUESTS' : 'ERROR'), body.message ?? '');
  }
  return (await res.json()) as T;
}

export type CheckinLink = { r?: string; room?: string };

export function linkQuery(link: CheckinLink): string {
  const q = new URLSearchParams();
  if (link.r) q.set('r', link.r);
  if (link.room) q.set('room', link.room);
  return q.toString();
}

export const checkinApi = {
  context: <T>(link: CheckinLink) => send<T>(`/context?${linkQuery(link)}`, { method: 'GET' }),
  scan: <T>(link: CheckinLink, image: Blob) => {
    const form = new FormData();
    if (link.r) form.set('r', link.r);
    if (link.room) form.set('room', link.room);
    form.set('image', image, 'passport.jpg');
    return send<T>('/scan-passport', { method: 'POST', body: form });
  },
  submit: <T>(body: unknown) =>
    send<T>('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
};
