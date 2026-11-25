'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const OPEN_PX = 144;

/**
 * Phones: slide the card towards the start (left, or right in Arabic) to show the actions
 * behind it; slide back or tap the card to close. Without `actions` it is a plain wrapper.
 */
export function SwipeActions({
  actions,
  children,
  className,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);

  if (!actions) return <div className={className}>{children}</div>;

  // Left in LTR, right in RTL: the actions sit at the end side.
  const sign = () => (typeof document !== 'undefined' && document.dir === 'rtl' ? 1 : -1);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]!;
    start.current = { x: t.clientX, y: t.clientY, base: offset, horizontal: null };
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0]!;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (s.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!s.horizontal) return; // vertical scroll: leave it to the page
    moved.current = true;
    setDragging(true);
    const open = Math.min(OPEN_PX, Math.max(0, s.base + dx * sign()));
    setOffset(open);
  };
  const onTouchEnd = () => {
    if (start.current?.horizontal) setOffset((o) => (o > OPEN_PX / 2 ? OPEN_PX : 0));
    start.current = null;
    setDragging(false);
  };

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      <div className="absolute inset-y-0 end-0 flex items-stretch gap-1.5 p-1.5" style={{ width: OPEN_PX }} aria-hidden={offset === 0}>
        {actions}
      </div>
      <div
        className={cn('relative', !dragging && 'transition-transform duration-200')}
        style={{ transform: `translateX(${offset * sign()}px)`, touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={(e) => {
          // A swipe is not a tap; a tap on an open card closes it.
          if (moved.current || offset > 0) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
            if (!dragging) setOffset(0);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
