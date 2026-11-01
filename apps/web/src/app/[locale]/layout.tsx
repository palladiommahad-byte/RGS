import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { isRtl, routing } from '@/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Riad', template: '%s · Riad' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the layout use env(safe-area-inset-*) on phones with a notch / home bar.
  viewportFit: 'cover',
  // Phone browser bar in the page background colour.
  themeColor: '#f3f6f5',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? 'rtl' : 'ltr'}
      className={`${inter.variable} ${plexArabic.variable}`}
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
