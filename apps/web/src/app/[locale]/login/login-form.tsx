'use client';

import { STAFF_LOCALES } from '@riad/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { BrandMark } from '@/components/brand-mark';
import { FormError } from '@/components/form-field';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

export function LoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      });
      // Only follow `next` inside our own dashboard (no open redirect).
      const next = search.get('next');
      const target =
        next && next.startsWith(`/${locale}/dashboard`) ? next : `/${locale}/dashboard`;
      router.replace(target);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t('invalid'));
      else if (err instanceof ApiError && err.status === 429) setError(t('tooMany'));
      else setError(t('error'));
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <BrandMark name={t('appName')} className="lg:invisible" />
        <LocaleSwitcher locales={STAFF_LOCALES} />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required dir="ltr" className="bg-card" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t('password')}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
            className="bg-card"
          />
        </div>
        <FormError message={error} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </div>
  );
}
