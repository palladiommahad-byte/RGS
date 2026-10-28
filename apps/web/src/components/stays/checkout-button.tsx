'use client';

import type { StaySummaryDto } from '@riad/shared';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAction } from '@/lib/use-api';

/** Confirms, then checks the guest out (room -> cleaning). Invoice/payments arrive in phase 4. */
export function CheckoutButton({
  stay,
  onDone,
  size = 'default',
  compact,
}: {
  stay: Pick<StaySummaryDto, 'id' | 'mainGuest' | 'room'>;
  onDone: () => void;
  size?: 'default' | 'lg';
  /** Small outline button for dense lists. */
  compact?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const { run, pending, error } = useAction();
  const name = stay.mainGuest ? `${stay.mainGuest.firstName} ${stay.mainGuest.lastName}` : '';

  async function confirm() {
    const ok = await run(() => api(`/stays/${stay.id}/checkout`, { method: 'POST' }));
    if (ok) {
      setOpen(false);
      onDone();
    }
  }

  return (
    <>
      <Button
        size={compact ? 'sm' : size}
        variant={compact ? 'outline' : 'default'}
        onClick={() => setOpen(true)}
      >
        <LogOut className="rtl:rotate-180" aria-hidden />
        {t('stays.checkout')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('stays.checkout')}</DialogTitle>
            <DialogDescription>
              {t('stays.checkoutConfirm', { name, room: stay.room?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('stays.checkoutPhase4')}</p>
          <FormError message={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('common.cancel')}</Button>
            </DialogClose>
            <Button onClick={() => void confirm()} disabled={pending}>
              {t('stays.checkout')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
