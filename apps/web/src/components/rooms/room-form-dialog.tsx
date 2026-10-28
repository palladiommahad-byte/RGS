'use client';

import { parseMadToCentimes, roomFormSchema, type RoomDto } from '@riad/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { centimesToInput } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction } from '@/lib/use-api';

type Values = { name: string; type: string; capacity: string; basePriceMad: string };

const EMPTY: Values = { name: '', type: '', capacity: '2', basePriceMad: '' };

/** Create (room = undefined) or edit a room. */
export function RoomFormDialog({
  open,
  room,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  room?: RoomDto;
  onOpenChange: (open: boolean) => void;
  onSaved: (room: RoomDto) => void;
}) {
  const t = useTranslations();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setError(null);
    setValues(
      room
        ? {
            name: room.name,
            type: room.type,
            capacity: String(room.capacity),
            basePriceMad: centimesToInput(room.basePrice),
          }
        : EMPTY,
    );
  }, [open, room, setError]);

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = roomFormSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const body = {
      name: parsed.data.name,
      type: parsed.data.type,
      capacity: parsed.data.capacity,
      basePrice: parseMadToCentimes(parsed.data.basePriceMad),
    };
    const saved = await run(() =>
      room
        ? api<RoomDto>(`/rooms/${room.id}`, { method: 'PATCH', body })
        : api<RoomDto>('/rooms', { method: 'POST', body }),
    );
    if (saved) {
      onSaved(saved);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{room ? t('rooms.edit') : t('rooms.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField id="room-name" label={t('rooms.name')} error={errors.name}>
            <Input id="room-name" value={values.name} onChange={set('name')} aria-invalid={!!errors.name} />
          </FormField>
          <FormField id="room-type" label={t('rooms.type')} error={errors.type} hint={t('rooms.typeHint')}>
            <Input id="room-type" value={values.type} onChange={set('type')} aria-invalid={!!errors.type} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="room-capacity" label={t('rooms.capacity')} error={errors.capacity}>
              <Input
                id="room-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={values.capacity}
                onChange={set('capacity')}
                aria-invalid={!!errors.capacity}
              />
            </FormField>
            <FormField id="room-price" label={t('rooms.basePrice')} error={errors.basePriceMad}>
              <Input
                id="room-price"
                inputMode="decimal"
                value={values.basePriceMad}
                onChange={set('basePriceMad')}
                aria-invalid={!!errors.basePriceMad}
                dir="ltr"
              />
            </FormField>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
