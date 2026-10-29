'use client';

import { changePasswordSchema } from '@riad/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';
import { FormError, FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { fieldErrors, type FieldErrors } from '@/lib/forms';
import { useAction } from '@/lib/use-api';

/** The signed-in user changes their own password; other devices are signed out. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);
  const { run, pending, error, setError } = useAction();

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setErrors({});
    setError(null);
    setDone(false);
  }, [open, setError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({ current, next, confirm });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    if (await run(() => api('/auth/change-password', { method: 'POST', body: { current, next } }))) setDone(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('account.changePassword')}</DialogTitle>
        </DialogHeader>
        {done ? (
          <>
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{t('account.changed')}</p>
            <DialogFooter>
              <DialogClose asChild>
                <Button>{t('common.close')}</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FormField id="pw-current" label={t('account.current')} error={errors.current}>
              <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </FormField>
            <FormField id="pw-next" label={t('account.next')} error={errors.next} hint={t('account.rules')}>
              <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </FormField>
            <FormField id="pw-confirm" label={t('account.confirm')} error={errors.confirm}>
              <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </FormField>
            <FormError message={error} />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('common.cancel')}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
