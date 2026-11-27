import { BedDouble, CalendarCheck, QrCode, Sparkles, Users, Wallet } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { AnimatedLogo } from '@/components/animated-logo';
import { LoginForm } from './login-form';
import './login.css';

const FEATURES = [
  { key: 'featureRooms', Icon: BedDouble },
  { key: 'featureStays', Icon: CalendarCheck },
  { key: 'featureCash', Icon: Wallet },
  { key: 'featureStaff', Icon: Users },
] as const;

/** Heights (%) of the decorative occupancy chart: an illustration, not real data. */
const BARS = [38, 52, 45, 66, 58, 82, 74, 94];

/** Entrance delay for an element animated with .login-rise. */
const delay = (seconds: number) => ({ '--d': `${seconds}s` }) as React.CSSProperties;

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <main className="login-page flex min-h-dvh bg-background">
      <Showcase t={t} />
      <section className="login-form-side flex flex-1 items-center justify-center p-5 sm:p-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'auth'>>>;

/** Left panel (large screens): animated logo, what the app does and a decorative preview. */
function Showcase({ t }: { t: T }) {
  return (
    <section className="login-brand relative hidden flex-col justify-between gap-8 overflow-hidden p-12 text-white lg:flex lg:w-1/2">
      <div className="absolute inset-0" aria-hidden>
        <div className="login-grid absolute inset-0" />
        <div className="login-blob login-blob-a" />
        <div className="login-blob login-blob-b" />
        <div className="login-blob login-blob-c" />
      </div>

      <div className="relative z-10 flex items-center justify-between gap-4">
        <AnimatedLogo tone="light" label={t('appName')} />
        <span className="login-rise login-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-white/90" style={delay(0.9)}>
          <span className="login-pulse size-1.5 rounded-full bg-green-300" aria-hidden />
          {t('badge')}
        </span>
      </div>

      <div className="relative z-10">
        <h1 className="mb-5 text-4xl leading-tight font-bold xl:text-5xl">
          <span className="login-rise block" style={delay(0.35)}>
            {t('headline1')}
          </span>
          <span className="login-rise block text-white/85" style={delay(0.5)}>
            {t('headline2')}
          </span>
        </h1>
        <p className="login-rise max-w-lg text-lg text-white/80" style={delay(0.7)}>
          {t('lead')}
        </p>

        <ul className="mt-7 flex flex-wrap gap-2.5">
          {FEATURES.map(({ key, Icon }, i) => (
            <li
              key={key}
              className="login-rise login-glass flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-white"
              style={delay(0.85 + i * 0.1)}
            >
              <Icon className="size-4" aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>

        {/* Decorative preview of the app (no real figures). */}
        <div className="login-showcase mt-10 flex max-w-xl items-end gap-4" aria-hidden>
          <div className="login-rise flex-1" style={delay(1.15)}>
            <div className="login-float login-glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between text-xs font-medium text-white/85">
                <span>{t('cardOccupancy')}</span>
                <svg viewBox="0 0 80 24" className="h-5 w-20 rtl:-scale-x-100" fill="none">
                  <path className="login-line" d="M2 20L14 15L26 17L38 9L50 12L62 5L78 3" stroke="#bef264" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex h-24 items-end gap-2">
                {BARS.map((height, i) => (
                  <span
                    key={i}
                    className="login-bar flex-1 rounded-t-md bg-gradient-to-t from-white/35 to-white/95"
                    style={{ height: `${height}%`, ...delay(1.3 + i * 0.08) }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex w-56 flex-col gap-4">
            {[
              { label: t('cardCheckin'), Icon: QrCode, wait: 1.45, float: '-2s' },
              { label: t('cardRoom'), Icon: Sparkles, wait: 1.65, float: '-4s' },
            ].map(({ label, Icon, wait, float }) => (
              <div key={label} className="login-rise" style={delay(wait)}>
                <div className="login-float login-glass flex items-center gap-3 rounded-2xl p-3.5" style={{ '--f': float } as React.CSSProperties}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="flex-1 text-sm leading-tight font-medium text-white">{label}</span>
                  <span className="login-pulse size-2 shrink-0 rounded-full bg-green-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="relative z-10 text-sm text-white/60">
        © {new Date().getFullYear()} {t('appName')}. {t('rights')}
      </p>
    </section>
  );
}
