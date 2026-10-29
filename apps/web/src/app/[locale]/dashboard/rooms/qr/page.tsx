'use client';

import type { Paginated, RoomDto } from '@riad/shared';
import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { QrSvg } from '@/components/qr-svg';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/lib/use-api';

/**
 * Printable QR sheet: one entrance code plus one per room. Codes point to /checkin without
 * a locale, so each guest's phone language picks EN/FR/ES/AR automatically.
 */
export default function RoomQrPage() {
  const t = useTranslations();
  const { user, can } = useAuth();
  const rooms = useApiQuery<Paginated<RoomDto>>(can('rooms.write') ? '/rooms?limit=100' : null);
  const links = useApiQuery<{ entranceKey: string }>(can('rooms.write') ? '/rooms/checkin-links' : null);
  const [base, setBase] = useState('');

  useEffect(() => {
    setBase((process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, ''));
  }, []);

  if (!can('rooms.write')) {
    return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;
  }

  const entranceKey = links.data?.entranceKey;
  const cards = [
    ...(entranceKey
      ? [{ key: 'entrance', title: t('qr.entrance'), url: `${base}/checkin?r=${encodeURIComponent(entranceKey)}` }]
      : []),
    ...(rooms.data?.items ?? []).map((r) => ({
      key: r.id,
      title: r.name,
      url: `${base}/checkin?room=${encodeURIComponent(r.qrToken ?? '')}`,
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('qr.title')}
        subtitle={t('qr.hint')}
        actions={
          <Button onClick={() => window.print()}>
            <Printer aria-hidden />
            {t('common.print')}
          </Button>
        }
      />
      <p className="text-xs text-muted-foreground print:hidden" dir="ltr">
        {t('qr.baseUrl', { url: base })}
      </p>
      {base && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-6">
          {cards.map((c) => (
            <li
              key={c.key}
              className="flex break-inside-avoid flex-col items-center gap-3 rounded-2xl border-2 bg-white p-6 text-center text-black"
            >
              <span className="text-sm font-medium text-stone-500">{user.riad.name}</span>
              <span className="text-xl font-semibold">{c.title}</span>
              <QrSvg value={c.url} />
              <span className="text-sm font-medium">{t('qr.scan')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
