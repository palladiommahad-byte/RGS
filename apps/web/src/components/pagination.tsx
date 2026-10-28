'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function Pagination({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('common');
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={t('pagination')}>
      <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="rtl:rotate-180" aria-hidden />
        {t('previous')}
      </Button>
      <span className="text-sm text-muted-foreground">{t('pageOf', { page, pages })}</span>
      <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('next')}
        <ChevronRight className="rtl:rotate-180" aria-hidden />
      </Button>
    </nav>
  );
}
