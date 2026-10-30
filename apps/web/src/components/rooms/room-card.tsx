'use client';

import { MANUAL_ROOM_STATUSES, type RoomDto, type RoomStatus } from '@riad/shared';
import { BedDouble, Brush, CalendarDays, DoorOpen, Pencil, RefreshCcw, RotateCcw, Trash2, Users, Wrench, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-provider';
import { roomMark } from '@/components/calendar/styles';
import { RoomStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICON: Record<RoomStatus, LucideIcon> = { FREE: DoorOpen, OCCUPIED: BedDouble, CLEANING: Brush, OUT_OF_SERVICE: Wrench };
const ACTIVE: Record<RoomStatus, string> = {
  FREE: 'bg-emerald-600 text-white',
  OCCUPIED: 'bg-teal-900 text-white',
  CLEANING: 'bg-amber-500 text-white',
  OUT_OF_SERVICE: 'bg-stone-500 text-white',
};

/** One room on the Rooms page: status in one tap, the rest as compact actions. */
export function RoomCard({
  room,
  busy,
  onStatus,
  onEdit,
  onRegenerate,
  onRemove,
  onReactivate,
}: {
  room: RoomDto;
  busy: boolean;
  onStatus: (status: RoomStatus) => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
  onReactivate: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const canWrite = can('rooms.write');

  return (
    <article className={cn('flex h-full flex-col gap-4 rounded-2xl border bg-card p-4 transition-shadow hover:shadow-sm', !room.isActive && 'opacity-70')}>
      <header className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold',
            room.status === 'OCCUPIED' ? 'bg-primary text-primary-foreground' : 'bg-teal-100 text-teal-900',
          )}
          aria-hidden
        >
          {roomMark(room.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{room.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{room.type}</p>
        </div>
        {room.isActive ? <RoomStatusBadge status={room.status} /> : <Badge tone="gray">{t('rooms.deactivated')}</Badge>}
      </header>

      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t('rooms.capacityShort')}</dt>
          <dd className="inline-flex items-center gap-1.5 font-medium">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            {t('rooms.persons', { count: room.capacity })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('rooms.priceShort')}</dt>
          <dd className="font-medium tabular-nums">{t('calendar.perNight', { price: formatMoney(room.basePrice, locale) })}</dd>
        </div>
      </dl>

      {room.isActive && can('rooms.status.update') && (
        room.status === 'OCCUPIED' ? (
          <p className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            <BedDouble className="size-4 shrink-0" aria-hidden />
            {t('rooms.occupiedHint')}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label={t('rooms.changeStatus')}>
            {MANUAL_ROOM_STATUSES.map((s) => {
              const Icon = ICON[s];
              const active = room.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy || active}
                  onClick={() => onStatus(s)}
                  className={cn(
                    'flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-medium transition-colors disabled:cursor-default',
                    active ? ACTIVE[s] : 'text-muted-foreground hover:bg-card hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t(`roomStatus.${s}`)}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      <footer className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        {room.isActive && can('stays.read') ? (
          <Link href={`/dashboard/calendar?room=${room.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'text-teal-800' })}>
            <CalendarDays aria-hidden />
            {t('nav.calendar')}
          </Link>
        ) : (
          <span />
        )}
        {canWrite &&
          (room.isActive ? (
            <div className="flex">
              <IconAction label={t('common.edit')} onClick={onEdit} icon={Pencil} />
              <IconAction label={t('rooms.regenerateQr')} onClick={onRegenerate} icon={RefreshCcw} />
              <IconAction label={t('common.delete')} onClick={onRemove} icon={Trash2} danger />
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={onReactivate}>
              <RotateCcw aria-hidden />
              {t('rooms.reactivate')}
            </Button>
          ))}
      </footer>
    </article>
  );
}

function IconAction({ label, onClick, icon: Icon, danger }: { label: string; onClick: () => void; icon: LucideIcon; danger?: boolean }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label} className={cn('size-10', danger && 'text-destructive hover:text-destructive')}>
      <Icon className="size-4" />
    </Button>
  );
}
