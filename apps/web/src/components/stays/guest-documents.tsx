'use client';

import type { GuestDto, GuestFilesDto } from '@riad/shared';
import { ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useApiQuery } from '@/lib/use-api';

/**
 * Passport photo (and signature for the main guest) through 5-minute signed URLs, so
 * staff can compare the document with the typed data before confirming.
 */
export function GuestDocuments({ stayId, guest }: { stayId: string; guest: GuestDto }) {
  const t = useTranslations('stays');
  const needed = guest.hasPassportPhoto || (guest.isMain && guest.consentAt);
  const files = useApiQuery<GuestFilesDto>(needed ? `/stays/${stayId}/guests/${guest.id}/files` : null);

  if (!guest.hasPassportPhoto && !files.data?.signatureUrl) {
    return (
      <div className="flex aspect-[3/2] w-full shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-xs text-muted-foreground md:w-48">
        <ImageOff className="size-5" aria-hidden />
        {t('noPhoto')}
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-2 md:w-48">
      {guest.hasPassportPhoto &&
        (files.data?.passportPhotoUrl ? (
          <a href={files.data.passportPhotoUrl} target="_blank" rel="noreferrer" title={t('openPhoto')}>
            <img
              src={files.data.passportPhotoUrl}
              alt={t('passportPhoto')}
              className="aspect-[3/2] w-full rounded-lg border bg-muted object-cover transition-opacity hover:opacity-90"
            />
          </a>
        ) : (
          <div className="aspect-[3/2] w-full animate-pulse rounded-lg bg-muted" />
        ))}
      {files.data?.signatureUrl && (
        <figure className="rounded-lg border bg-white p-1">
          <img src={files.data.signatureUrl} alt={t('signature')} className="h-14 w-full object-contain" />
          <figcaption className="px-1 text-[11px] text-muted-foreground">{t('signature')}</figcaption>
        </figure>
      )}
    </div>
  );
}
