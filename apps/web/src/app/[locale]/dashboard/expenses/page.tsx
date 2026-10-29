'use client';

import type { CashWalletDto, ExpenseCategoryDto } from '@riad/shared';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ExpenseDialog } from '@/components/expenses/expense-dialog';
import { ExpensesTab } from '@/components/expenses/expenses-tab';
import { RecurringTab } from '@/components/expenses/recurring-tab';
import { SuppliersTab } from '@/components/expenses/suppliers-tab';
import { WalletsTab } from '@/components/expenses/wallets-tab';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type Tab = 'expenses' | 'wallets' | 'recurring' | 'suppliers';

export default function ExpensesPage() {
  const t = useTranslations();
  const { can } = useAuth();
  const canAdd = can('expenses.write', 'expenses.write_petty_cash');
  const manager = can('expenses.write');
  const categories = useApiQuery<ExpenseCategoryDto[]>('/expense-categories');
  const wallets = useApiQuery<CashWalletDto[]>(canAdd ? '/cash-wallets' : null);
  const [tab, setTab] = useState<Tab>('expenses');
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);

  const tabs: Tab[] = ['expenses', ...(canAdd ? (['wallets'] as const) : []), ...(manager ? (['recurring', 'suppliers'] as const) : [])];

  const changed = () => {
    setVersion((v) => v + 1);
    wallets.reload();
  };

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PageHeader
        title={t('nav.expenses')}
        actions={
          canAdd && (
            <Button size="lg" onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              {t('expenses.quickAdd')}
            </Button>
          )
        }
      />

      {tabs.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                'h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                tab === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
              )}
            >
              {t(`expenses.tabs.${k}`)}
            </button>
          ))}
        </div>
      )}

      {categories.data && tab === 'expenses' && (
        <ExpensesTab categories={categories.data} wallets={wallets.data ?? []} version={version} onChanged={changed} />
      )}
      {tab === 'wallets' && <WalletsTab wallets={wallets.data ?? []} onChanged={changed} />}
      {categories.data && tab === 'recurring' && <RecurringTab categories={categories.data} onChanged={changed} />}
      {categories.data && tab === 'suppliers' && <SuppliersTab categories={categories.data} />}

      {canAdd && (
        // Thumb-reachable on phones.
        <Button
          size="icon"
          className="fixed end-5 bottom-5 z-30 size-14 rounded-full shadow-lg md:hidden"
          onClick={() => setAdding(true)}
          aria-label={t('expenses.quickAdd')}
        >
          <Plus className="size-6" />
        </Button>
      )}
      <ExpenseDialog
        open={adding}
        onOpenChange={setAdding}
        onSaved={changed}
        categories={categories.data ?? []}
        wallets={wallets.data ?? []}
      />
    </div>
  );
}
