import { notFound } from 'next/navigation';
import { use } from 'react';
import { SECTION_KEYS } from '@/components/dashboard/nav-items';
import { SectionPlaceholder } from './section-placeholder';

export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  if (!SECTION_KEYS.includes(section)) notFound();
  return <SectionPlaceholder section={section} />;
}
