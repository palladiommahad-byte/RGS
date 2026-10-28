'use client';

import { MANUAL_ROOM_STATUSES, type RoomDto, type RoomStatus } from '@riad/shared';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormError } from '@/components/form-field';
import { ROOM_DOT, ROOM_TILE } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAction } from '@/lib/use-api';
import { cn } from '@/lib/utils';

/** Big one-tap status buttons (housekeeping on a phone). */
export function RoomStatusDialog({
  room,
  onClose,
  onChanged,
}: {
  room: RoomDto | null;
  onClose: () => void;
  onChanged: (room: RoomDto) => void;
}) {
  const t = useTranslations();
  const { run, pending, error, setError } = useAction();

  async function choose(status: RoomStatus) {
    if (!room) return;
    const updated = await run(() =>
      api<RoomDto>(`/rooms/${room.id}/status`, { method: 'PATCH', body: { status } }),
    );
    if (updated) {
      onChanged(updated);
      onClose();
    }
  }

  return (
    <Dialog
      open={room !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{room?.name}</DialogTitle>
          <DialogDescription>{t('rooms.changeStatus')}</DialogDescription>
        </DialogHeader>
        {room?.status === 'OCCUPIED' ? (
          <p className="text-sm text-muted-foreground">{t('rooms.occupiedHint')}</p>
        ) : (
          <div className="grid gap-3">
            {MANUAL_ROOM_STATUSES.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="lg"
                disabled={pending}
                onClick={() => void choose(s)}
                className={cn('justify-between border-2', ROOM_TILE[s])}
                aria-pressed={room?.status === s}
              >
                <span className="flex items-center gap-2.5">
                  <span className={cn('size-2.5 rounded-full', ROOM_DOT[s])} aria-hidden />
                  {t(`roomStatus.${s}`)}
                </span>
                {room?.status === s && <Check aria-hidden />}
              </Button>
            ))}
          </div>
        )}
        <FormError message={error} />
      </DialogContent>
    </Dialog>
  );
}
