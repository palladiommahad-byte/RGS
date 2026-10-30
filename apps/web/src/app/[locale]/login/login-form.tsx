'use client';

import { STAFF_LOCALES } from '@riad/shared';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [forgot, setForgot] = useState(false);

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
    <div className="relative flex w-full max-w-sm flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <BrandMark name={t('appName')} className="lg:invisible" />
        <LocaleSwitcher locales={STAFF_LOCALES} />
      </div>

      <div>
        <p className="text-sm text-muted-foreground">{t('eyebrow')}</p>
        <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t('email')}</Label>
          <div className="relative">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              dir="ltr"
              placeholder={t('emailPlaceholder')}
              className="h-12 rounded-xl bg-white pe-11"
            />
            <Mail className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">{t('password')}</Label>
            <button
              type="button"
              onClick={() => setForgot((f) => !f)}
              aria-expanded={forgot}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t('forgot')}
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              dir="ltr"
              placeholder={t('passwordPlaceholder')}
              className="h-12 rounded-xl bg-white pe-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              title={showPassword ? t('hidePassword') : t('showPassword')}
              className="absolute end-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {forgot && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t('forgotHint')}</p>}
        </div>

        <FormError message={error} />
        <Button type="submit" size="lg" disabled={pending} className="h-12 rounded-xl bg-[#0b1f1c] text-white shadow-lg shadow-black/10 hover:bg-[#134e48]">
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>

      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        {t('secure')}
      </p>
    </div>
  );
}
