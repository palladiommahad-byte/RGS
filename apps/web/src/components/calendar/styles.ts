import type { StaySource, StayStatus } from '@riad/shared';
import type { CSSProperties } from 'react';

/** Stay bars, shared by the room calendar and the Today chart. */
export const STAY_BAR: Record<StayStatus, string> = {
  CHECKED_IN: 'bg-gradient-to-r from-teal-900 to-teal-700 text-white rtl:bg-gradient-to-l',
  PENDING: 'bg-gradient-to-r from-amber-200 to-amber-100 text-amber-950 ring-1 ring-amber-300 rtl:bg-gradient-to-l',
  CHECKED_OUT: 'bg-gradient-to-r from-teal-100 to-teal-100/60 text-teal-900 rtl:bg-gradient-to-l',
  CANCELLED: 'hidden',
};

/** Neutral initials per booking channel (no third-party logos). */
export const SOURCE_BADGE: Record<StaySource, { label: string; className: string }> = {
  BOOKING: { label: 'B', className: 'bg-[#1d4f91] text-white' },
  AIRBNB: { label: 'A', className: 'bg-[#e0565b] text-white' },
  EXPEDIA: { label: 'E', className: 'bg-[#f5c518] text-black' },
  DIRECT: { label: 'D', className: 'bg-white text-teal-900' },
  WALK_IN: { label: 'W', className: 'bg-white text-teal-900' },
  OTHER: { label: '•', className: 'bg-white text-teal-900' },
};

/** Diagonal hatching for past days and rooms out of service. */
export const HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 7px)',
};

/** "Chambre 12" -> "12", "Suite Majorelle" -> "S": the short mark on room tiles. */
export const roomMark = (name: string) => name.replace(/\D/g, '') || name.trim()[0]?.toUpperCase() || '?';
