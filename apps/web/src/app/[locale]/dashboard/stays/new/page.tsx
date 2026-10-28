'use client';

import {
  guestFormSchema,
  stayFormSchema,
  type Paginated,
  type RoomDto,
  type StayDetailDto,
} from '@riad/shared';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import {
  EMPTY_GUEST,
  emptyStayValues,
  GuestFields,
  guestValuesForSchema,
  StayFields,
  stayToBody,
  type GuestValues,
  type StayValues,
} from '@/components/stays/stay-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction, useApiQuery } from '@/lib/use-api';

export default function NewStayPage() {
  const t = useTranslations();
  const router = useRouter();
  const { can } = useAuth();
  const rooms = useApiQuery<Paginated<RoomDto>>('/rooms?limit=100');
  const [stay, setStay] = useState<StayValues>(emptyStayValues);
  const [guest, setGuest] = useState<GuestValues>(EMPTY_GUEST);
  const [checkInNow, setCheckInNow] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const { run, pending, error } = useAction();

  const canCheckIn = can('checkin.confirm');
  const selectedRoom = rooms.data?.items.find((r) => r.id === stay.roomId);
  const roomBusy = selectedRoom && !['FREE', 'CLEANING'].includes(selectedRoom.status);
  const willCheckIn = canCheckIn && checkInNow && Boolean(stay.roomId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = stayFormSchema.safeParse(stay);
    const g = guestFormSchema.safeParse(guestValuesForSchema(guest));
    const errs: FieldErrors = {
      ...(s.success ? {} : fieldErrors(s.error)),
      ...(g.success
        ? {}
        : Object.fromEntries(Object.entries(fieldErrors(g.error)).map(([k, v]) => [`mainGuest.${k}`, v]))),
    };
    setErrors(errs);
    if (!s.success || !g.success) return;

    const created = await run(() =>
      api<StayDetailDto>('/stays', {
        method: 'POST',
        body: { ...stayToBody(s.data), checkInNow: willCheckIn, mainGuest: g.data },
      }),
    );
    if (created) router.replace(`/dashboard/stays/${created.id}`);
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-3xl flex-col gap-6" noValidate>
      <PageHeader
        title={t('stays.new')}
        actions={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/stays">
              <ArrowLeft className="rtl:rotate-180" aria-hidden />
              {t('common.back')}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('stays.mainGuest')}</CardTitle>
        </CardHeader>
        <CardContent>
          <GuestFields values={guest} errors={errors} onChange={setGuest} errorPrefix="mainGuest." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('stays.stay')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StayFields
            values={stay}
            errors={errors}
            onChange={setStay}
            rooms={rooms.data?.items ?? []}
            roomLabel={t('stays.room')}
          />
          {canCheckIn && (
            <label className="flex min-h-11 items-center gap-3 rounded-lg bg-muted p-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={checkInNow}
                onChange={(e) => setCheckInNow(e.target.checked)}
              />
              <span>
                {t('stays.checkInNow')}
                {!stay.roomId && <span className="block text-xs text-muted-foreground">{t('stays.checkInNowNeedsRoom')}</span>}
              </span>
            </label>
          )}
          {willCheckIn && roomBusy && <FormError message={t('errors.ROOM_NOT_AVAILABLE')} />}
        </CardContent>
      </Card>

      <FormError message={error} />
      <Button type="submit" size="lg" disabled={pending || (willCheckIn && roomBusy)}>
        {willCheckIn ? t('stays.createAndCheckIn') : t('stays.create')}
      </Button>
    </form>
  );
}
