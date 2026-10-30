'use client';

import type { Paginated, RoomDto, RoomStatus } from '@riad/shared';
import { Plus, QrCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { Pagination } from '@/components/pagination';
import { RoomCard } from '@/components/rooms/room-card';
import { RoomFormDialog } from '@/components/rooms/room-form-dialog';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAction, useApiQuery } from '@/lib/use-api';

const LIMIT = 50;

export default function RoomsPage() {
  const t = useTranslations();
  const { can } = useAuth();
  const canWrite = can('rooms.write');
  const [page, setPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<RoomDto | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const action = useAction();

  const query = useApiQuery<Paginated<RoomDto>>(
    `/rooms?page=${page}&limit=${LIMIT}${showInactive ? '&includeInactive=true' : ''}`,
  );

  // Statuses change on their own (check-in, check-out) and from other devices.
  useRealtimeEvent('rooms:changed', query.reload);

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

  async function setStatus(room: RoomDto, status: RoomStatus) {
    if (await action.run(() => api(`/rooms/${room.id}/status`, { method: 'PATCH', body: { status } }))) query.reload();
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

      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {query.data?.items.map((room) => (
          <li key={room.id}>
            <RoomCard
              room={room}
              busy={action.pending}
              onStatus={(status) => void setStatus(room, status)}
              onEdit={() => openForm(room)}
              onRegenerate={() => void regenerate(room)}
              onRemove={() => void remove(room)}
              onReactivate={() => void reactivate(room)}
            />
          </li>
        ))}
      </ul>

      {query.data && (
        <Pagination page={page} limit={LIMIT} total={query.data.total} onPage={setPage} />
      )}

      <RoomFormDialog open={formOpen} room={editing} onOpenChange={setFormOpen} onSaved={() => query.reload()} />
    </div>
  );
}
