'use client';

import {
  CHECKIN_ROOM_STATUSES,
  nightsBetween,
  todayIso,
  guestFormSchema,
  parseMadToCentimes,
  STAY_SOURCES,
  stayFormSchema,
  type GuestDto,
  type RoomBookedDetails,
  type RoomDto,
  type StayDetailDto,
} from '@riad/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import { centimesToInput, formatDate } from '@/lib/format';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction } from '@/lib/use-api';
import {
  EMPTY_GUEST,
  GuestFields,
  guestToUpdateBody,
  guestToValues,
  guestValuesForSchema,
  StayFields,
  stayToBody,
  stayToValues,
  type GuestValues,
  type StayValues,
} from './stay-form';

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void };

function Footer({ pending, label }: { pending: boolean; label: string }) {
  const t = useTranslations('common');
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button type="button" variant="outline">
          {t('cancel')}
        </Button>
      </DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? t('saving') : label}
      </Button>
    </DialogFooter>
  );
}

const amount = /^\d+([.,]\d{1,2})?$/;

/** PENDING -> CHECKED_IN: assign a room and confirm the commercial terms. */
export function ConfirmStayDialog({
  stay,
  rooms,
  open,
  onOpenChange,
  onDone,
}: DialogProps & { stay: StayDetailDto; rooms: RoomDto[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const available = rooms.filter((r) => CHECKIN_ROOM_STATUSES.includes(r.status));
  // Here before the booked day: the stay will start today, so it gets longer.
  const today = todayIso();
  const early = stay.checkInDate > today;
  const [roomId, setRoomId] = useState('');
  const [source, setSource] = useState<string>(stay.source);
  const [externalRef, setExternalRef] = useState('');
  const [price, setPrice] = useState('');
  const [commission, setCommission] = useState('0');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    const requested = stay.requestedRoom && available.find((r) => r.id === stay.requestedRoom!.id);
    const room = requested ?? available[0];
    setRoomId(room?.id ?? '');
    setSource(stay.source);
    setExternalRef(stay.externalRef ?? '');
    setPrice(
      stay.pricePerNight > 0 ? centimesToInput(stay.pricePerNight) : room ? centimesToInput(room.basePrice) : '',
    );
    setCommission(centimesToInput(stay.otaCommission));
    setErrors({});
    setError(null);
    // Reset only when the dialog opens, not on every background reload.
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: FieldErrors = {};
    if (!roomId) errs.roomId = 'required';
    if (!amount.test(price.trim())) errs.price = 'invalid_amount';
    if (!amount.test(commission.trim())) errs.commission = 'invalid_amount';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await run(() =>
      api(`/stays/${stay.id}/confirm`, {
        method: 'POST',
        body: {
          roomId,
          source,
          externalRef: externalRef.trim() || undefined,
          pricePerNight: parseMadToCentimes(price),
          otaCommission: parseMadToCentimes(commission),
        },
      }),
    );
    if (ok) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('stays.confirmTitle')}</DialogTitle>
          <DialogDescription>{t('stays.confirmDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {early && (
            <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              {t('stays.earlyArrival', {
                booked: formatDate(stay.checkInDate, locale),
                nights: nightsBetween(today, stay.checkOutDate),
              })}
            </p>
          )}
          <FormField id="confirm-room" label={t('stays.room')} error={errors.roomId}>
            <Select id="confirm-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">—</option>
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {t(`roomStatus.${r.status}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="confirm-price" label={t('stays.pricePerNight')} error={errors.price}>
              <Input id="confirm-price" inputMode="decimal" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />
            </FormField>
            <FormField id="confirm-source" label={t('stays.source')}>
              <Select id="confirm-source" value={source} onChange={(e) => setSource(e.target.value)}>
                {STAY_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`source.${s}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="confirm-ref" label={t('stays.externalRef')}>
              <Input id="confirm-ref" dir="ltr" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
            </FormField>
            <FormField id="confirm-commission" label={t('stays.otaCommission')} error={errors.commission}>
              <Input
                id="confirm-commission"
                inputMode="decimal"
                dir="ltr"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </FormField>
          </div>
          <FormError message={error} />
          <Footer pending={pending} label={t('stays.confirm')} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditStayDialog({
  stay,
  rooms,
  open,
  onOpenChange,
  onDone,
}: DialogProps & { stay: StayDetailDto; rooms: RoomDto[] }) {
  const t = useTranslations();
  const [values, setValues] = useState<StayValues>(() => stayToValues(stay));
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();
  // Extra nights collide with another stay in this room: who, and the rooms free instead.
  const [booked, setBooked] = useState<RoomBookedDetails | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(stayToValues(stay));
    setErrors({});
    setError(null);
    setBooked(null);
  }, [open, stay, setError]);

  // A checked-in guest can only move to a room that is free (or their current one).
  const roomChoices =
    stay.status === 'CHECKED_IN'
      ? rooms.filter((r) => r.id === stay.room?.id || CHECKIN_ROOM_STATUSES.includes(r.status))
      : rooms;

  async function save(next: StayValues) {
    const parsed = stayFormSchema.safeParse(next);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBooked(null);
    const ok = await run(async () => {
      try {
        return await api(`/stays/${stay.id}`, { method: 'PATCH', body: stayToBody(parsed.data) });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ROOM_BOOKED') setBooked(e.details as RoomBookedDetails);
        throw e;
      }
    });
    if (ok) {
      onOpenChange(false);
      onDone();
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save(values);
  }

  /** Same dates, another room. */
  function moveTo(roomId: string) {
    const next = { ...values, roomId };
    setValues(next);
    void save(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('stays.edit')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <StayFields
            idPrefix="edit"
            values={values}
            errors={errors}
            onChange={setValues}
            rooms={roomChoices}
            roomLabel={stay.status === 'CHECKED_IN' ? t('stays.roomMove') : t('stays.requestedRoom')}
          />
          {booked ? (
            <RoomBookedPanel details={booked} pending={pending} onMove={moveTo} />
          ) : (
            <FormError message={error} />
          )}
          <Footer pending={pending} label={t('common.save')} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoomBookedPanel({ details, pending, onMove }: { details: RoomBookedDetails; pending: boolean; onMove: (roomId: string) => void }) {
  const t = useTranslations('stays.booked');
  const locale = useLocale();
  const c = details.conflict;
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-medium">
        {t('conflict', { guest: c.guestName ?? t('anotherGuest'), from: formatDate(c.checkInDate, locale), to: formatDate(c.checkOutDate, locale) })}
      </p>
      {details.freeRooms.length > 0 ? (
        <>
          <p>{t('moveHint')}</p>
          <div className="flex flex-wrap gap-2">
            {details.freeRooms.map((r) => (
              <Button key={r.id} type="button" size="sm" variant="outline" className="bg-white" disabled={pending} onClick={() => onMove(r.id)}>
                {t('moveTo', { room: r.name })}
                <span className="text-xs text-muted-foreground">{r.type}</span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p>{t('noFreeRoom')}</p>
      )}
    </div>
  );
}

/** Add a companion (guest undefined) or edit an existing guest. */
export function GuestDialog({
  stayId,
  guest,
  open,
  onOpenChange,
  onDone,
}: DialogProps & { stayId: string; guest?: GuestDto }) {
  const t = useTranslations();
  const [values, setValues] = useState<GuestValues>(EMPTY_GUEST);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setValues(guest ? guestToValues(guest) : EMPTY_GUEST);
    setErrors({});
    setError(null);
  }, [open, guest, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = guestFormSchema.safeParse(guestValuesForSchema(values));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const ok = await run(() =>
      guest
        ? api(`/stays/${stayId}/guests/${guest.id}`, { method: 'PATCH', body: guestToUpdateBody(parsed.data) })
        : api(`/stays/${stayId}/guests`, { method: 'POST', body: parsed.data }),
    );
    if (ok) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{guest ? t('stays.editGuest') : t('stays.addGuest')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <GuestFields idPrefix="dlg-guest" values={values} errors={errors} onChange={setValues} />
          <FormError message={error} />
          <Footer pending={pending} label={t('common.save')} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
