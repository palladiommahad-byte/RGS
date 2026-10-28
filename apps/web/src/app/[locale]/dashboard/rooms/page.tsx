'use client';

import type { Paginated, RoomDto } from '@riad/shared';
import { Pencil, Plus, QrCode, RefreshCcw, Trash2, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { RoomFormDialog } from '@/components/rooms/room-form-dialog';
import { RoomStatusDialog } from '@/components/rooms/room-status-dialog';
import { RoomStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';

const LIMIT = 50;

export default function RoomsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const canWrite = can('rooms.write');
  const [page, setPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<RoomDto | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [statusRoom, setStatusRoom] = useState<RoomDto | null>(null);
  const action = useAction();

  const query = useApiQuery<Paginated<RoomDto>>(
    `/rooms?page=${page}&limit=${LIMIT}${showInactive ? '&includeInactive=true' : ''}`,
  );

  function openForm(room?: RoomDto) {
    setEditing(room);
    setFormOpen(true);
  }

  async function regenerate(room: RoomDto) {
    if (!window.confirm(t('rooms.regenerateConfirm', { name: room.name }))) return;
    if (await action.run(() => api(`/rooms/${room.id}/qr-token`, { method: 'POST' }))) query.reload();
  }

  async function remove(room: RoomDto) {
    if (!window.confirm(t('rooms.deleteConfirm', { name: room.name }))) return;
    if (await action.run(() => api(`/rooms/${room.id}`, { method: 'DELETE' }))) query.reload();
  }

  async function reactivate(room: RoomDto) {
    const body = { isActive: true };
    if (await action.run(() => api(`/rooms/${room.id}`, { method: 'PATCH', body }))) query.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.rooms')}
        actions={
          canWrite && (
            <>
              <Button variant="outline" asChild>
                <Link href="/dashboard/rooms/qr">
                  <QrCode aria-hidden />
                  {t('rooms.printQr')}
                </Link>
              </Button>
              <Button onClick={() => openForm()}>
                <Plus aria-hidden />
                {t('rooms.new')}
              </Button>
            </>
          )
        }
      />

      {canWrite && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={showInactive}
            onChange={(e) => {
              setShowInactive(e.target.checked);
              setPage(1);
            }}
          />
          {t('rooms.showInactive')}
        </label>
      )}

      <FormError message={action.error} />

      {query.data && query.data.items.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{t('rooms.empty')}</p>
      )}

      <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {query.data?.items.map((room) => (
          <li key={room.id}>
            <Card className="gap-3 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{room.name}</h2>
                  <p className="text-sm text-muted-foreground">{room.type}</p>
                </div>
                {room.isActive ? (
                  <RoomStatusBadge status={room.status} />
                ) : (
                  <Badge tone="gray">{t('rooms.deactivated')}</Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-4" aria-hidden />
                  {t('rooms.persons', { count: room.capacity })}
                </span>
                <span className="font-medium">{formatMoney(room.basePrice, locale)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {room.isActive && can('rooms.status.update') && (
                  <Button variant="secondary" size="sm" onClick={() => setStatusRoom(room)}>
                    {t('rooms.changeStatus')}
                  </Button>
                )}
                {canWrite && room.isActive && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => openForm(room)}>
                      <Pencil aria-hidden />
                      {t('common.edit')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void regenerate(room)}>
                      <RefreshCcw aria-hidden />
                      {t('rooms.regenerateQr')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => void remove(room)}
                    >
                      <Trash2 aria-hidden />
                      {t('common.delete')}
                    </Button>
                  </>
                )}
                {canWrite && !room.isActive && (
                  <Button variant="outline" size="sm" onClick={() => void reactivate(room)}>
                    {t('rooms.reactivate')}
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {query.data && (
        <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />
      )}

      <RoomFormDialog open={formOpen} room={editing} onOpenChange={setFormOpen} onSaved={() => query.reload()} />
      <RoomStatusDialog room={statusRoom} onClose={() => setStatusRoom(null)} onChanged={() => query.reload()} />
    </div>
  );
}
