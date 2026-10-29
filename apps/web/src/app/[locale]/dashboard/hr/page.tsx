'use client';

import { todayIso, type EmployeeDto, type LeaveDto, type Paginated } from '@riad/shared';
import { CalendarClock, IdCard, ScanLine, Users, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AttendanceTab } from '@/components/hr/attendance-tab';
import { EmployeesTab } from '@/components/hr/employees-tab';
import { LeavesTab } from '@/components/hr/leaves-tab';
import { PayrollTab } from '@/components/hr/payroll-tab';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { formatMoney } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type Tab = 'employees' | 'attendance' | 'leaves' | 'payroll';
const TABS: Tab[] = ['employees', 'attendance', 'leaves', 'payroll'];

export default function HrPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { can } = useAuth();
  const allowed = can('hr.read');
  const canWrite = can('hr.write');
  const [tab, setTab] = useState<Tab>('employees');
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const staff = useApiQuery<Paginated<EmployeeDto>>(allowed ? '/hr/employees?limit=100' : null);
  const pending = useApiQuery<Paginated<LeaveDto>>(allowed ? '/hr/leaves?status=PENDING&limit=1' : null);

  if (!allowed) return <p className="text-muted-foreground">{t('dashboard.forbidden')}</p>;

  const changed = () => {
    staff.reload();
    pending.reload();
  };
  const salaryMass = staff.data?.items.reduce((n, e) => n + e.baseSalary, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.hr')}
        subtitle={t('hr.subtitle')}
        actions={
          <>
            <Link href="/staff/clock" className={buttonVariants({ variant: 'outline' })}>
              <ScanLine aria-hidden />
              {t('nav.clock')}
            </Link>
            {canWrite && (
              <Link href="/dashboard/hr/badges" className={buttonVariants()}>
                <IdCard aria-hidden />
                {t('hr.badges.title')}
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard highlight icon={Users} label={t('hr.stats.active')} value={staff.data?.total ?? '—'} />
        <StatCard icon={Wallet} label={t('hr.stats.salaryMass')} value={staff.data ? formatMoney(salaryMass, locale) : '—'} footnote={t('hr.stats.salaryMassHint')} />
        <StatCard icon={CalendarClock} label={t('hr.stats.pendingLeaves')} value={pending.data?.total ?? '—'} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'h-11 shrink-0 rounded-full border px-5 text-sm font-medium transition-colors',
                tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {t(`hr.tabs.${k}`)}
            </button>
          ))}
        </div>
        {(tab === 'attendance' || tab === 'payroll') && (
          <Input type="month" aria-label={t('hr.month')} value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        )}
      </div>

      {tab === 'employees' && <EmployeesTab canWrite={canWrite} onChanged={changed} />}
      {tab === 'attendance' && <AttendanceTab month={month} canWrite={canWrite} />}
      {tab === 'leaves' && <LeavesTab canWrite={canWrite} onChanged={changed} />}
      {tab === 'payroll' && <PayrollTab month={month} canWrite={canWrite} onChanged={changed} />}
    </div>
  );
}
