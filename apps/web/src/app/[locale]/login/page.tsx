import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { BedDouble, CalendarCheck, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { LoginForm } from './login-form';

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  const points = [
    { icon: CalendarCheck, text: t('pointStays') },
    { icon: BedDouble, text: t('pointRooms') },
    { icon: ShieldCheck, text: t('pointSecure') },
  ];

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col">
        {/* Decorative arches, a nod to riad architecture. */}
        <div className="pointer-events-none absolute -end-24 -bottom-24 size-[28rem] rounded-t-full border-[3rem] border-white/5" aria-hidden />
        <div className="pointer-events-none absolute end-24 -bottom-40 size-[22rem] rounded-t-full border-[2rem] border-white/5" aria-hidden />
        <BrandMark name={t('appName')} inverted />
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">{t('tagline')}</h2>
          <ul className="mt-8 flex flex-col gap-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/85">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex items-center justify-center bg-background p-4 sm:p-8">
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
