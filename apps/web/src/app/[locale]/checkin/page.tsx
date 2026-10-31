import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CheckinFlow } from '@/components/checkin/checkin-flow';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'checkin' });
  return { title: t('pageTitle'), robots: { index: false, follow: false } };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Opened from a room QR code: /checkin?room=<room token> (each room has its own). */
export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const q = await searchParams;
  return <CheckinFlow link={{ room: one(q.room) ?? '' }} />;
}
