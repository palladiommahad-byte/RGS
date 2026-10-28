'use client';

import type { RoomStatus, StayStatus } from '@riad/shared';
import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@/components/ui/badge';

export const ROOM_STATUS_TONE: Record<RoomStatus, BadgeTone> = {
  FREE: 'green',
  OCCUPIED: 'blue',
  CLEANING: 'amber',
  OUT_OF_SERVICE: 'gray',
};

/** Room tiles (board + status buttons): occupied rooms read like the calendar bars. */
export const ROOM_TILE: Record<RoomStatus, string> = {
  FREE: 'border-border bg-card text-foreground hover:border-teal-300',
  OCCUPIED: 'border-transparent bg-teal-900 text-white hover:bg-teal-700',
  CLEANING: 'border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-400',
  OUT_OF_SERVICE: 'border-stone-200 bg-stone-100 text-stone-600 hover:border-stone-300',
};

export const ROOM_DOT: Record<RoomStatus, string> = {
  FREE: 'bg-emerald-500',
  OCCUPIED: 'bg-teal-300',
  CLEANING: 'bg-amber-500',
  OUT_OF_SERVICE: 'bg-stone-400',
};

const STAY_STATUS_TONE: Record<StayStatus, BadgeTone> = {
  PENDING: 'amber',
  CHECKED_IN: 'blue',
  CHECKED_OUT: 'teal',
  CANCELLED: 'gray',
};

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const t = useTranslations('roomStatus');
  return <Badge tone={ROOM_STATUS_TONE[status]}>{t(status)}</Badge>;
}

export function StayStatusBadge({ status }: { status: StayStatus }) {
  const t = useTranslations('stayStatus');
  return <Badge tone={STAY_STATUS_TONE[status]}>{t(status)}</Badge>;
}
