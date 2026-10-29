'use client';

import type { EmployeeBadgeDto } from '@riad/shared';
import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { QrSvg } from '@/components/qr-svg';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/lib/use-api';

/**
 * Printable staff badges. The QR holds only a random token (no name, no HR data); a lost
 * badge is replaced from the employee's sheet ("New badge"), which disables the old one.
 */
export default function BadgesPage() {
  const t = useTranslations();
  const { user, can } = useAuth();
  const badges = useApiQuery<EmployeeBadgeDto[]>(can('hr.write') ? '/hr/employees/badges' : null);

  if (!can('hr.write')) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('hr.badges.title')}
        subtitle={t('hr.badges.hint')}
        actions={
          <Button onClick={() => window.print()}>
            <Printer aria-hidden />
            {t('common.print')}
          </Button>
        }
      />
      {badges.data?.length === 0 && <p className="text-muted-foreground">{t('hr.employees.empty')}</p>}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-4">
        {badges.data?.map((b) => (
          <li
            key={b.id}
            className="flex break-inside-avoid flex-col items-center gap-2 rounded-2xl border-2 bg-white p-5 text-center text-black"
          >
            <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">{user.riad.name}</span>
            <span className="text-lg font-semibold">{b.name}</span>
            <span className="text-sm text-stone-600">{b.position}</span>
            <QrSvg value={b.token} className="size-40" />
            <span className="text-xs font-medium">{t('hr.badges.scan')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
