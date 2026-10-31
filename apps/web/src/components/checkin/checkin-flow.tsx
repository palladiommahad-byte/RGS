'use client';

import {
  addDays,
  guestFormSchema,
  PUBLIC_LOCALES,
  todayIso,
  type CheckinContextDto,
  type CheckinDoneDto,
} from '@riad/shared';
import type { CountryCode } from 'libphonenumber-js';
import { BedDouble, CircleCheckBig, KeyRound, Loader2, ScanLine, Wifi } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { guestValuesForSchema } from '@/components/stays/stay-form';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { checkinApi, type CheckinLink } from '@/lib/checkin-api';
import { alpha3ToAlpha2 } from '@/lib/countries';
import { ConsentStep } from './consent-step';
import { ContactStep, toE164, type ContactValues } from './contact-step';
import { emptyDraft, PassportStep, type GuestDraft } from './passport-step';

type Step =
  | { kind: 'intro' }
  | { kind: 'passport'; index: number }
  | { kind: 'contact' }
  | { kind: 'consent' }
  | { kind: 'done'; result: CheckinDoneDto };

/**
 * Guest self check-in: main passport -> contact & stay -> other adults -> consent &
 * signature -> confirmation. Everything stays in memory until the final submit.
 */
export function CheckinFlow({ link }: { link: CheckinLink }) {
  const t = useTranslations('checkin');
  const locale = useLocale();
  const [context, setContext] = useState<CheckinContextDto | null>(null);
  const [contextError, setContextError] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [guests, setGuests] = useState<GuestDraft[]>([emptyDraft()]);
  const [contact, setContact] = useState<ContactValues>({
    country: 'FR',
    phone: '',
    email: '',
    adults: 1,
    children: 0,
    checkOutDate: addDays(todayIso(), 1),
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    checkinApi
      .context<CheckinContextDto>(link)
      .then(setContext)
      .catch(() => setContextError(true));
  }, [link]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const totalSteps = 2 + contact.adults; // main passport, contact, other adults, consent
  const current =
    step.kind === 'passport' ? (step.index === 0 ? 1 : step.index + 2) : step.kind === 'contact' ? 2 : totalSteps;

  function setGuest(index: number, draft: GuestDraft) {
    setGuests((list) => {
      const next = [...list];
      next[index] = draft;
      return next;
    });
  }

  function afterMainPassport() {
    // Default the phone country from the passport nationality.
    const a2 = alpha3ToAlpha2(guests[0]?.values.nationality);
    if (a2 && !contact.phone) setContact((c) => ({ ...c, country: a2 as CountryCode }));
    setStep({ kind: 'contact' });
  }

  function afterContact() {
    setGuests((list) => {
      const next = list.slice(0, contact.adults);
      while (next.length < contact.adults) next.push(emptyDraft());
      return next;
    });
    setStep(contact.adults > 1 ? { kind: 'passport', index: 1 } : { kind: 'consent' });
  }

  async function submit({ signature, honeypot }: { signature: string; honeypot: string }) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await checkinApi.submit<CheckinDoneDto>({
        ...link,
        website: honeypot || undefined,
        locale: (PUBLIC_LOCALES as readonly string[]).includes(locale) ? locale : 'en',
        phone: toE164(contact),
        email: contact.email.trim() || undefined,
        adults: contact.adults,
        children: contact.children,
        checkOutDate: contact.checkOutDate,
        consent: true,
        signature,
        guests: guests.slice(0, contact.adults).map((g) => ({
          ...guestFormSchema.parse(guestValuesForSchema(g.values)),
          photoRef: g.photoRef,
          mrzRaw: g.mrzRaw,
        })),
      });
      setStep({ kind: 'done', result });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic';
      setSubmitError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pt-5 pb-10">
      <header className="flex items-center justify-between gap-3">
        <BrandMark name={context?.riadName ?? ''} />
        <LocaleSwitcher locales={PUBLIC_LOCALES} className="shrink-0" short />
      </header>

      {contextError ? (
        <Message title={t('invalidLink')} />
      ) : !context ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground" aria-busy>
          <Loader2 className="size-8 animate-spin" aria-hidden />
        </div>
      ) : step.kind === 'done' ? (
        <Done result={step.result} />
      ) : (
        <main className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6">
          {step.kind !== 'intro' && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('step', { current, total: totalSteps })}
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(current / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

          {step.kind === 'intro' && (
            <Intro context={context} onStart={() => setStep({ kind: 'passport', index: 0 })} />
          )}
          {step.kind === 'passport' && (
            <PassportStep
              key={step.index}
              link={link}
              title={step.index === 0 ? t('passport.mainTitle') : t('passport.guestTitle', { n: step.index + 1 })}
              draft={guests[step.index] ?? emptyDraft()}
              onChange={(d) => setGuest(step.index, d)}
              onBack={() =>
                setStep(step.index === 0 ? { kind: 'intro' } : step.index === 1 ? { kind: 'contact' } : { kind: 'passport', index: step.index - 1 })
              }
              onNext={() =>
                step.index === 0
                  ? afterMainPassport()
                  : setStep(step.index + 1 < contact.adults ? { kind: 'passport', index: step.index + 1 } : { kind: 'consent' })
              }
            />
          )}
          {step.kind === 'contact' && (
            <ContactStep
              values={contact}
              onChange={setContact}
              onBack={() => setStep({ kind: 'passport', index: 0 })}
              onNext={afterContact}
            />
          )}
          {step.kind === 'consent' && (
            <ConsentStep
              context={context}
              submitting={submitting}
              error={submitError}
              onBack={() => setStep(contact.adults > 1 ? { kind: 'passport', index: contact.adults - 1 } : { kind: 'contact' })}
              onSubmit={(d) => void submit(d)}
            />
          )}
        </main>
      )}
    </div>
  );
}

function Intro({ context, onStart }: { context: CheckinContextDto; onStart: () => void }) {
  const t = useTranslations('checkin');
  const items = [
    { icon: ScanLine, text: t('introPassport') },
    { icon: KeyRound, text: t('introReception') },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('welcome', { riad: context.riadName })}</h1>
        <p className="mt-2 text-muted-foreground">{t('intro')}</p>
      </div>
      {context.roomName && (
        <p className="flex items-center gap-2 rounded-lg bg-teal-100/60 px-3 py-2 text-sm font-medium text-teal-900">
          <BedDouble className="size-4" aria-hidden />
          {t('room', { room: context.roomName })}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-teal-900">
              <Icon className="size-[18px]" aria-hidden />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <Button size="lg" onClick={onStart}>
        {t('start')}
      </Button>
    </div>
  );
}

function Done({ result }: { result: CheckinDoneDto }) {
  const t = useTranslations('checkin.done');
  return (
    <main className="flex flex-col items-center gap-5 rounded-2xl border bg-card p-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <CircleCheckBig className="size-9" aria-hidden />
      </span>
      <div>
        {result.checkedIn ? (
          <>
            <h1 className="text-2xl font-semibold">{t('checkedInTitle')}</h1>
            <p className="mt-2 text-muted-foreground">{t('checkedIn', { room: result.roomName ?? '' })}</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{t('title')}</h1>
            <p className="mt-2 text-muted-foreground">{t('reception')}</p>
          </>
        )}
      </div>
      {result.wifiInfo && (
        <div className="flex w-full items-start gap-3 rounded-xl bg-primary p-4 text-start text-primary-foreground">
          <Wifi className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <div className="text-sm text-white/75">{t('wifi')}</div>
            <div className="font-medium whitespace-pre-line">{result.wifiInfo}</div>
          </div>
        </div>
      )}
    </main>
  );
}

function Message({ title }: { title: string }) {
  return <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">{title}</p>;
}
