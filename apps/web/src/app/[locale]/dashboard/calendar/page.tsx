'use client';

import { isIsoDate, todayIso, type IsoDate, type Paginated, type RoomDto, type StaySummaryDto } from '@riad/shared';
import { BedDouble } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { RoomCalendar, viewRange, type CalendarView } from '@/components/calendar/room-calendar';
import { RoomPanel } from '@/components/calendar/room-panel';
import { StaySheet } from '@/components/calendar/stay-sheet';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

const VIEWS: CalendarView[] = ['month', 'week', 'day'];

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarScreen />
    </Suspense>
  );
}

/** Rooms on the left; the selected room's stays on a month / week / day calendar. */
function CalendarScreen() {
  const t = useTranslations();
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const allowed = can('stays.read');
  const rooms = useApiQuery<Paginated<RoomDto>>(allowed ? '/rooms?limit=100' : null);
  const active = (rooms.data?.items ?? []).filter((r) => r.isActive);

  // Room, view and date live in the URL, so a link or a reload shows the same calendar.
  const roomId = params.get('room') ?? active[0]?.id ?? null;
  const view = (VIEWS as string[]).includes(params.get('view') ?? '') ? (params.get('view') as CalendarView) : 'month';
  const dateParam = params.get('date');
  const cursor = dateParam && isIsoDate(dateParam) ? dateParam : todayIso();
  const room = active.find((r) => r.id === roomId) ?? null;
  const [panelOpen, setPanelOpen] = useState(true);
  const [openStay, setOpenStay] = useState<string | null>(null);

  const { from, to } = viewRange(view, cursor);
  const stays = useApiQuery<Paginated<StaySummaryDto>>(room ? `/stays?roomId=${room.id}&from=${from}&to=${to}&limit=100` : null);

  // A guest's new QR check-in shows up without a reload.
  useRealtimeEvent('checkin:new', stays.reload);

  const update = (next: Partial<{ room: string; view: CalendarView; date: IsoDate }>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) p.set(k, v);
    router.replace(`${pathname}?${p}`, { scroll: false });
  };

  if (!allowed) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.calendar')} subtitle={t('calendar.subtitle')} />

      {/* Phones: a room picker instead of the side panel. */}
      <div className="lg:hidden">
        <Select aria-label={t('calendar.rooms')} value={roomId ?? ''} onChange={(e) => update({ room: e.target.value })}>
          {active.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.type}
            </option>
          ))}
        </Select>
      </div>

      <div className={cn('grid gap-4', panelOpen ? 'lg:grid-cols-[280px_minmax(0,1fr)]' : 'lg:grid-cols-[auto_minmax(0,1fr)]')}>
        <div className="max-lg:hidden">
          {panelOpen ? (
            <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-hidden [&>aside]:max-h-[calc(100dvh-2rem)]">
              <RoomPanel rooms={active} selectedId={roomId} onSelect={(id) => update({ room: id })} onCollapse={() => setPanelOpen(false)} />
            </div>
          ) : (
            <Button variant="outline" size="icon" onClick={() => setPanelOpen(true)} aria-label={t('calendar.showRooms')} title={t('calendar.showRooms')}>
              <BedDouble className="size-5" />
            </Button>
          )}
        </div>

        {room ? (
          <RoomCalendar
            room={room}
            stays={stays.data?.items ?? []}
            view={view}
            cursor={cursor}
            canCreate={can('stays.write')}
            onViewChange={(v) => update({ view: v })}
            onCursorChange={(d) => update({ date: d })}
            onOpenStay={setOpenStay}
            onNewStay={(d) => router.push(`/dashboard/stays/new?roomId=${room.id}&checkIn=${d}`)}
          />
        ) : (
          rooms.data && <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">{t('calendar.noRooms')}</p>
        )}
      </div>

      <StaySheet stayId={openStay} onOpenChange={(o) => !o && setOpenStay(null)} />
    </div>
  );
}
