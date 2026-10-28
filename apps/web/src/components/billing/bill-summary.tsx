'use client';

import type { BillDto } from '@riad/shared';
import { TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const rate = (bp: number) => `${bp / 100} %`;

/** HT / TVA / taxes / TTC breakdown, then paid and balance. */
export function BillSummary({ bill, compact }: { bill: BillDto; compact?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const m = (c: number) => formatMoney(c, locale);
  const { totals } = bill;

  const rows: [string, number][] = [
    [t('bill.totalHt'), totals.totalHt],
    ...bill.tvaByRate.filter((g) => g.tva > 0).map((g): [string, number] => [t('bill.tva', { rate: rate(g.rate) }), g.tva]),
  ];
  if (totals.taxeSejour) rows.push([t('bill.taxeSejour'), totals.taxeSejour]);
  if (totals.tpt) rows.push([t('bill.tpt'), totals.tpt]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {!compact && (
        <ul className="flex flex-col gap-1.5">
          {bill.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {l.kind === 'ACCOMMODATION'
                  ? `${t('bill.accommodation')} · ${t('stays.nightsCount', { count: l.quantity })}`
                  : l.kind === 'EXTRA'
                    ? `${l.label}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`
                    : l.kind === 'TAXE_SEJOUR'
                      ? t('bill.taxeSejour')
                      : t('bill.tpt')}
              </span>
              <span className="tabular-nums">{m(l.totalTtc)}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className={cn('flex flex-col gap-1.5', !compact && 'border-t pt-3')}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-muted-foreground">
            <dt>{label}</dt>
            <dd className="tabular-nums">{m(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t pt-2 text-base font-semibold">
          <dt>{t('bill.totalTtc')}</dt>
          <dd className="tabular-nums">{m(totals.totalTtc)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-muted-foreground">
          <dt>{t('bill.paid')}</dt>
          <dd className="tabular-nums">{m(bill.paid)}</dd>
        </div>
        <div
          className={cn(
            'mt-1 flex items-center justify-between gap-3 rounded-lg px-3 py-2 font-semibold',
            bill.balance > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800',
          )}
        >
          <dt>{bill.balance > 0 ? t('bill.balance') : bill.balance < 0 ? t('bill.credit') : t('bill.settled')}</dt>
          <dd className="tabular-nums">{m(Math.abs(bill.balance))}</dd>
        </div>
      </dl>
      {bill.invoice ? (
        <p className="text-xs text-muted-foreground">
          {t('bill.frozen', { number: bill.invoice.number, date: formatDate(bill.invoice.issuedAt.slice(0, 10), locale) })}
        </p>
      ) : (
        bill.missingRates.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {t('bill.missingRates', { codes: bill.missingRates.map((c) => t(`taxCode.${c}`)).join(', ') })}{' '}
              {t('bill.accountant')}
            </span>
          </p>
        )
      )}
    </div>
  );
}
