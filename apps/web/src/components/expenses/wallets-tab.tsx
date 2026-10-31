'use client';

import type { CashMovementDto, CashWalletDto, Paginated } from '@riad/shared';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Plus, Scale, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { FormError, FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useAction, useApiQuery } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { AmountDialog } from './amount-dialog';

/** Petty cash: one card per wallet with its balance; managers top up and correct. */
export function WalletsTab({ wallets, onChanged }: { wallets: CashWalletDto[]; onChanged: () => void }) {
  const t = useTranslations();
  const { can } = useAuth();
  const manager = can('expenses.write');
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {manager && (
        <Button className="self-start" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          {t('wallets.new')}
        </Button>
      )}
      {wallets.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{t('wallets.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {wallets.map((w) => (
            <WalletCard key={w.id} wallet={w} manager={manager} onChanged={onChanged} />
          ))}
        </div>
      )}
      <NewWalletDialog open={creating} onOpenChange={setCreating} onDone={onChanged} />
    </div>
  );
}

function WalletCard({ wallet, manager, onChanged }: { wallet: CashWalletDto; manager: boolean; onChanged: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [dialog, setDialog] = useState<'topup' | 'adjust' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const history = useApiQuery<Paginated<CashMovementDto>>(showHistory ? `/cash-wallets/${wallet.id}/movements?limit=20` : null);
  const m = (c: number) => formatMoney(c, locale);
  const { reload } = history;
  useEffect(() => {
    if (showHistory) reload();
  }, [wallet.balance, showHistory, reload]);

  const move = (path: 'top-up' | 'adjust') => (amount: number, note: string | undefined) =>
    api(`/cash-wallets/${wallet.id}/${path}`, { method: 'POST', body: { amount, note } }).then(onChanged);

  return (
    <Card className={cn(!wallet.isActive && 'opacity-60')}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-teal-100 text-teal-900">
              <Wallet className="size-5" aria-hidden />
            </span>
            <div>
              <div className="font-semibold">{wallet.name}</div>
              <div className="text-sm text-muted-foreground">{wallet.holder.name}</div>
            </div>
          </div>
          {!wallet.isActive && <Badge tone="gray">{t('rooms.deactivated')}</Badge>}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{t('wallets.balance')}</div>
          <div className={cn('text-3xl font-semibold tabular-nums', wallet.balance === 0 && 'text-amber-700')}>{m(wallet.balance)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {manager && wallet.isActive && (
            <>
              <Button size="sm" onClick={() => setDialog('topup')}>
                <ArrowDownLeft aria-hidden />
                {t('wallets.topUp')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('adjust')}>
                <Scale aria-hidden />
                {t('wallets.adjust')}
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
            <ChevronDown className={cn('transition-transform', showHistory && 'rotate-180')} aria-hidden />
            {t('wallets.history')}
          </Button>
        </div>
        {showHistory && (
          <ul className="flex flex-col divide-y border-t">
            {history.data?.items.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t('wallets.noMovements')}</li>}
            {history.data?.items.map((mv) => (
              <li key={mv.id} className="flex items-center gap-3 py-2.5 text-sm">
                {mv.amount >= 0 ? (
                  <ArrowDownLeft className="size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <ArrowUpRight className="size-4 shrink-0 text-amber-700" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {mv.expense
                      ? (mv.expense.supplier ?? mv.expense.category)
                      : mv.payment
                        ? [mv.payment.guestName, mv.payment.roomName].filter(Boolean).join(' · ') || t(`wallets.movement.${mv.type}`)
                        : t(`wallets.movement.${mv.type}`)}
                    {mv.note && <span className="text-muted-foreground"> · {mv.note}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(mv.createdAt, locale)}
                    {mv.createdBy && ` · ${mv.createdBy.name}`}
                  </div>
                </div>
                <span className={cn('shrink-0 font-medium whitespace-nowrap tabular-nums', mv.amount >= 0 ? 'text-emerald-700' : '')}>
                  {mv.amount > 0 ? '+' : ''}
                  {m(mv.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AmountDialog
        open={dialog === 'topup'}
        onOpenChange={(o) => setDialog(o ? 'topup' : null)}
        title={t('wallets.topUpTitle', { name: wallet.holder.name })}
        onSubmit={move('top-up')}
      />
      <AmountDialog
        open={dialog === 'adjust'}
        onOpenChange={(o) => setDialog(o ? 'adjust' : null)}
        title={t('wallets.adjustTitle')}
        description={t('wallets.adjustHint')}
        signed
        noteRequired
        onSubmit={move('adjust')}
      />
    </Card>
  );
}

function NewWalletDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const t = useTranslations();
  const holders = useApiQuery<{ id: string; name: string }[]>(open ? '/cash-wallets/holders' : null);
  const [holderId, setHolderId] = useState('');
  const [name, setName] = useState('');
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setHolderId('');
    setName(t('wallets.defaultName'));
    setError(null);
  }, [open, setError, t]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!holderId || !name.trim()) return;
    const ok = await run(() => api('/cash-wallets', { method: 'POST', body: { holderId, name: name.trim() } }));
    if (ok !== undefined) {
      onOpenChange(false);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('wallets.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField id="w-holder" label={t('wallets.holder')}>
            <Select id="w-holder" value={holderId} onChange={(e) => setHolderId(e.target.value)} required>
              <option value="">—</option>
              {holders.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="w-name" label={t('rooms.name')}>
            <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !holderId}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
