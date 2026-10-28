import { redirect } from 'next/navigation';
import { use } from 'react';
import { isStaffLocale } from '@/i18n/routing';

// Internal tool: there is no public site, the root goes straight to the dashboard.
export default function RootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  redirect(`/${isStaffLocale(locale) ? locale : 'fr'}/dashboard`);
}
