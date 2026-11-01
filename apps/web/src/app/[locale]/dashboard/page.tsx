'use client';

import {
  addDays,
  monthStartOf,
  todayIso,
  type FinanceDashboardDto,
  type IsoDate,
  type Paginated,
  type RoomDto,
  type StaySummaryDto,
  type TodayDto,
} from '@riad/shared';
import { BedDouble, Brush, CalendarCheck, DoorOpen, LogOut, Plus, RefreshCw, Users, Wrench } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { StaySheet } from '@/components/calendar/stay-sheet';
import { PageHeader } from '@/components/page-header';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { RoomBoard } from '@/components/rooms/room-board';
import { StatCard } from '@/components/stat-card';
import { CheckoutButton } from '@/components/stays/checkout-button';
import { PendingList } from '@/components/stays/pending-list';
import { WeekCalendar, weekStartOf } from '@/components/stays/week-calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NAV_ITEMS } from '@/components/dashboard/nav-items';
import { MovementsTable, RevenueOverview, RoomStatusRing } from '@/components/dashboard/today-widgets';
import { Link, useRouter } from '@/i18n/navigation';
import { formatDate } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

const REFRESH_MS = 60_000;

export default function TodayPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { can, user } = useAuth();
  const canStays = can('stays.read');
  const router = useRouter();
  // Today is the stays desk: others (housekeeping…) start on the first page they may open.
  const landing = canStays ? null : NAV_ITEMS.find((i) => i.href !== '/dashboard' && i.anyOf.length > 0 && can(...i.anyOf));
  useEffect(() => {
    if (landing) router.replace(landing.href);
  }, [landing, router]);
  const [weekStart, setWeekStart] = useState<IsoDate>(() => weekStartOf(todayIso()));
  const [openStay, setOpenStay] = useState<string | null>(null);

  const today = useApiQuery<TodayDto>(canStays ? '/today' : null);
  const rooms = useApiQuery<Paginated<RoomDto>>(can('rooms.read') ? '/rooms?limit=100' : null);
  const week = useApiQuery<Paginated<StaySummaryDto>>(
    canStays ? `/stays?from=${weekStart}&to=${addDays(weekStart, 7)}&limit=100` : null,
  );
  const finance = useApiQuery<FinanceDashboardDto>(
    canStays && can('finance.reports') ? `/finance/dashboard?from=${monthStartOf(todayIso())}&to=${todayIso()}` : null,
  );
  const { reload: reloadToday } = today;
  const { reload: reloadRooms } = rooms;
  const { reload: reloadWeek } = week;

  const reload = () => {
    reloadToday();
    reloadRooms();
    reloadWeek();
  };

  useRealtimeEvent('checkin:new', reload);
  // Check-ins, check-outs and housekeeping on other devices show up at once.
  useRealtimeEvent('rooms:changed', reload);
  useRealtimeEvent('stays:changed', reload);

  // Safety net for missed socket events and changes made from other tabs.
  useEffect(() => {
    const id = setInterval(() => {
      reloadToday();
      reloadRooms();
      reloadWeek();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [reloadToday, reloadRooms, reloadWeek]);

  const d = today.data;
  const date = d?.date ?? todayIso();
  const roomList = rooms.data?.items ?? [];
  const countRooms = (s: RoomDto['status']) => roomList.filter((r) => r.status === s).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  const bookings = d && (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>{t('today.calendar')}</CardTitle>
      </CardHeader>
      <CardContent>
        <WeekCalendar
          weekStart={weekStart}
          today={d.date}
          stays={week.data?.items ?? []}
          rooms={roomList}
          onWeekChange={setWeekStart}
          onOpenStay={setOpenStay}
        />
      </CardContent>
    </Card>
  );
  const pendingCard = d && (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t('today.pending')}</CardTitle>
        {d.pending.length > 0 && <Badge tone="amber">{d.pending.length}</Badge>}
      </CardHeader>
      <CardContent>
        <PendingList stays={d.pending} emptyLabel={t('today.noPending')} />
      </CardContent>
    </Card>
  );
  const ring = rooms.data && <RoomStatusRing rooms={roomList} />;
  const movements = d && <MovementsTable arrivals={d.arrivals} departures={d.departures} inHouse={d.inHouse} className="xl:col-span-2" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <>
            {t(`today.greeting.${greeting}`, { name: firstName })} <span aria-hidden>👋</span>
          </>
        }
        subtitle={t('today.greetingHint', {
          date: formatDate(date, locale, { weekday: 'long', day: 'numeric', month: 'long' }),
          riad: user.riad.name,
        })}
        actions={
          <>
            <Button
              variant="outline"
              onClick={reload}
              disabled={today.loading || rooms.loading}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw aria-hidden />
              <span className="max-sm:sr-only">{t('common.refresh')}</span>
            </Button>
            {can('stays.write') && (
              <Button asChild>
                <Link href="/dashboard/stays/new">
                  <Plus aria-hidden />
                  {t('stays.new')}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* KPI row */}
      {canStays && d ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={BedDouble}
            label={t('today.occupancyRate')}
            value={`${d.rooms.total ? Math.round((d.rooms.occupied / d.rooms.total) * 100) : 0}%`}
            footnote={t('today.roomsOccupied', { occupied: d.rooms.occupied, total: d.rooms.total })}
          />
          <StatCard
            tone="sky"
            icon={CalendarCheck}
            label={t('today.arrivals')}
            value={d.arrivals.length}
            footnote={t('today.pendingCount', { count: d.pending.length })}
          />
          <StatCard
            tone="amber"
            icon={LogOut}
            label={t('today.departures')}
            value={d.departures.length}
            footnote={t('today.overdueCount', {
              count: d.departures.filter((s) => s.checkOutDate < d.date).length,
            })}
          />
          <StatCard
            tone="violet"
            icon={Users}
            label={t('today.inHouse')}
            value={d.inHouse.reduce((n, s) => n + s.adults + s.children, 0)}
            footnote={t('today.staysCount', { count: d.inHouse.length })}
          />
        </div>
      ) : (
        !canStays &&
        rooms.data && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard tone="amber" icon={Brush} label={t('roomStatus.CLEANING')} value={countRooms('CLEANING')} />
            <StatCard tone="emerald" icon={DoorOpen} label={t('roomStatus.FREE')} value={countRooms('FREE')} />
            <StatCard icon={BedDouble} label={t('roomStatus.OCCUPIED')} value={countRooms('OCCUPIED')} />
            <StatCard tone="rose" icon={Wrench} label={t('roomStatus.OUT_OF_SERVICE')} value={countRooms('OUT_OF_SERVICE')} />
          </div>
        )
      )}

      {canStays && d && (
        finance.data ? (
          <>
            {/* Owners and managers: money first, then the desk. */}
            <div className="grid gap-6 xl:grid-cols-3">
              <RevenueOverview months={finance.data.months} className="xl:col-span-2" />
              {ring}
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              {bookings}
              {pendingCard}
            </div>
            {movements && <div className="grid gap-6 xl:grid-cols-1">{movements}</div>}
          </>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-3">
              {bookings}
              {ring}
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              {movements}
              {pendingCard}
            </div>
          </>
        )
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {rooms.data && (
          <Card className={canStays ? 'xl:col-span-2' : 'xl:col-span-3'}>
            <CardHeader>
              <CardTitle>{t('today.roomBoard')}</CardTitle>
            </CardHeader>
            <CardContent>
              <RoomBoard rooms={roomList} inHouse={d?.inHouse} expected={d?.pending} onChanged={reload} />
            </CardContent>
          </Card>
        )}
        {canStays && d && (
          <Card>
            <CardHeader>
              <CardTitle>{t('today.departures')}</CardTitle>
            </CardHeader>
            <CardContent>
              {d.departures.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {t('today.noDepartures')}
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {d.departures.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <Link href={`/dashboard/stays/${s.id}`} className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {s.mainGuest ? `${s.mainGuest.firstName} ${s.mainGuest.lastName}` : '—'}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{s.room?.name}</span>
                          {s.checkOutDate < d.date && <Badge tone="red">{t('today.overdue')}</Badge>}
                        </div>
                      </Link>
                      {can('stays.write') && <CheckoutButton stay={s} onDone={reload} compact />}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {(today.error || rooms.error || week.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t('errors.generic')}
        </p>
      )}

      <StaySheet stayId={openStay} onOpenChange={(o) => !o && setOpenStay(null)} />
    </div>
  );
}
