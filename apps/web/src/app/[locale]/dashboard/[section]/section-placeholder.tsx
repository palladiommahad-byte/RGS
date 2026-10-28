'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-provider';
import { NAV_ITEMS } from '@/components/dashboard/nav-items';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

/** Temporary page for modules delivered in later phases. */
export function SectionPlaceholder({ section }: { section: string }) {
  const t = useTranslations();
  const { can } = useAuth();
  const item = NAV_ITEMS.find((i) => i.key === section)!;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t(`nav.${item.key}`)}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-normal text-muted-foreground">
            {can(...item.anyOf)
              ? t('dashboard.comingInPhase', { phase: item.phase })
              : t('dashboard.forbidden')}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}
