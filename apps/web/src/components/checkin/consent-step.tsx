'use client';

import type { CheckinContextDto } from '@riad/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { SignaturePad } from './signature-pad';

export function ConsentStep({
  context,
  submitting,
  error,
  onBack,
  onSubmit,
}: {
  context: CheckinContextDto;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (data: { signature: string; honeypot: string }) => void;
}) {
  const t = useTranslations('checkin.consent');
  const tc = useTranslations('common');
  const tk = useTranslations('checkin');
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const [tried, setTried] = useState(false);

  function submit() {
    setTried(true);
    if (accepted && signature) onSubmit({ signature, honeypot });
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-semibold">{t('title')}</h2>
      <div className="max-h-64 overflow-y-auto rounded-xl border bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-line">
        {t('text', {
          riad: context.riadName,
          days: context.retentionDays,
          email: context.contactEmail ?? t('atReception'),
        })}
      </div>

      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          aria-invalid={tried && !accepted}
        />
        {t('accept')}
      </label>
      {tried && !accepted && <p className="text-sm text-destructive">{t('acceptRequired')}</p>}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('signHere')}</span>
        <SignaturePad
          onChange={setSignature}
          clearLabel={t('clear')}
          placeholder={t('signLine')}
          invalid={tried && !signature}
        />
        {tried && !signature && <p className="text-sm text-destructive">{t('signatureRequired')}</p>}
      </div>

      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden className="absolute -start-[10000px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>

      <FormError message={error} />
      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={onBack} disabled={submitting}>
          {tc('back')}
        </Button>
        <Button size="lg" className="flex-[2]" onClick={submit} disabled={submitting}>
          {submitting ? tk('submitting') : tk('submit')}
        </Button>
      </div>
    </div>
  );
}
