import { Brush, Check, QrCode } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { LoginForm } from './login-form';

/** Lime-mint accent of the sign-in page, on the brand's dark teal. */
const ACCENT = '#c5f27f';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <main className="min-h-dvh bg-[#e9eeec] p-2 sm:p-3">
      <div className="grid min-h-[calc(100dvh-1rem)] gap-2 sm:min-h-[calc(100dvh-1.5rem)] sm:gap-3 lg:grid-cols-2">
        <Showcase t={t} />
        <section className="relative flex items-center justify-center overflow-hidden rounded-[28px] bg-gradient-to-br from-white to-[#f1f4f3] p-4 sm:p-10">
          <div
            className="pointer-events-none absolute -end-24 -top-24 size-72 rounded-full opacity-60 blur-3xl"
            style={{ background: `radial-gradient(circle, ${ACCENT}, transparent 70%)` }}
            aria-hidden
          />
          <Suspense>
            <LoginForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'auth'>>>;

/** Left panel (large screens): what the app does, with a mock of the reception's day. */
function Showcase({ t }: { t: T }) {
  return (
    <section className="relative hidden overflow-hidden rounded-[28px] bg-[#0b1f1c] p-12 text-white lg:flex lg:flex-col">
      {/* Grid, glow and rings: decoration only. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-32 end-[-6rem] size-[30rem] rounded-full opacity-50 blur-3xl"
        style={{ background: `radial-gradient(circle, ${ACCENT} 0%, #2e6b63 45%, transparent 70%)` }}
        aria-hidden
      />
      <div className="pointer-events-none absolute end-48 top-20 size-6 rounded-full blur-[2px]" style={{ background: ACCENT, boxShadow: `0 0 40px 12px ${ACCENT}` }} aria-hidden />

      <div className="relative flex items-center justify-between">
        <BrandMark name={t('appName')} inverted />
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
          <span className="size-1.5 rounded-full" style={{ background: ACCENT }} aria-hidden />
          {t('badge')}
        </span>
      </div>

      <div className="relative mt-16 max-w-xl">
        <h2 className="text-5xl leading-[1.02] font-semibold tracking-tight xl:text-6xl">
          {t('headline1')}
          <br />
          <span style={{ color: ACCENT }}>{t('headline2')}</span>
        </h2>
        <p className="mt-6 max-w-md text-base leading-relaxed text-white/70">{t('lead')}</p>
      </div>

      {/* Mock of the reception's "today" card. */}
      <div className="relative mt-auto ps-6 pb-4" aria-hidden>
        <div className="absolute -top-8 start-0 size-28 rounded-3xl bg-gradient-to-br from-[#5c948b] to-[#9fc4bd] opacity-80 blur-[1px]" />
        <div className="absolute end-10 -bottom-2 size-24 rounded-full border border-white/20" />
        <div className="relative w-full max-w-md rotate-[-3deg] rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-md rtl:rotate-[3deg]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm text-white/80">{t('cardTitle')}</span>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#0b1f1c]" style={{ background: ACCENT }}>
              {t('cardBadge')}
            </span>
          </div>
          <MockRow icon={QrCode} title={t('cardRow1Title')} sub={t('cardRow1Sub')} action={t('cardRow1Action')} />
          <MockRow icon={Brush} title={t('cardRow2Title')} sub={t('cardRow2Sub')} action={t('cardRow2Action')} done />
        </div>
      </div>
    </section>
  );
}

function MockRow({ icon: Icon, title, sub, action, done }: { icon: typeof QrCode; title: string; sub: string; action: string; done?: boolean }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b1f1c]/60 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10" style={{ color: ACCENT }}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-white/60">{sub}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eef7e2] px-3 py-1 text-xs font-semibold text-[#0b1f1c]">
        {done && <Check className="size-3" />}
        {action}
      </span>
    </div>
  );
}
