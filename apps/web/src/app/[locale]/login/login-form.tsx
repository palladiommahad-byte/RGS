'use client';

import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { AnimatedLogo } from '@/components/animated-logo';
import { FormError } from '@/components/form-field';
import { LanguageMenu } from '@/components/language-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Entrance delay for an element animated with .login-rise (login.css). */
const delay = (seconds: number) => ({ '--d': `${seconds}s` }) as CSSProperties;

export function LoginForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgot, setForgot] = useState(false);
  // The card shakes when sign-in fails (look only; the sign-in itself is unchanged).
  const [shake, setShake] = useState(false);

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
      setShake(true);
      if (err instanceof ApiError && err.status === 401) setError(t('invalid'));
      else if (err instanceof ApiError && err.status === 429) setError(t('tooMany'));
      else setError(t('error'));
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      {/* Phones and tablets: the brand panel is hidden, so the logo sits above the card. */}
      <div className="flex items-center justify-between gap-3">
        <AnimatedLogo tone="dark" label={t('appName')} className="lg:invisible" />
        <LanguageMenu className="h-10 bg-card shadow-xs sm:h-10" />
      </div>

      <div className="login-rise" style={delay(0.2)}>
        <div
          className={cn('login-card rounded-3xl border bg-card p-7 sm:p-10', shake && 'login-card-shake')}
          onAnimationEnd={(e) => {
            if (e.animationName === 'login-shake') setShake(false);
          }}
        >
          <div className="mb-8 text-center">
            <p className="text-sm text-muted-foreground">{t('eyebrow')}</p>
            <h1 className="mt-1.5 text-3xl leading-tight font-bold text-primary">{t('welcome')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <div className="login-rise flex flex-col gap-2" style={delay(0.4)}>
              <Label htmlFor="email">{t('email')}</Label>
              <div className="login-field relative">
                <Mail className="login-field-icon pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  dir="ltr"
                  placeholder={t('emailPlaceholder')}
                  className="h-12 rounded-xl bg-white px-11 rtl:text-right"
                />
              </div>
            </div>

            <div className="login-rise flex flex-col gap-2" style={delay(0.5)}>
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
              <div className="login-field relative">
                <Lock className="login-field-icon pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  dir="ltr"
                  placeholder={t('passwordPlaceholder')}
                  className="h-12 rounded-xl bg-white ps-11 pe-11 rtl:text-right"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                  aria-pressed={showPassword}
                  title={showPassword ? t('hidePassword') : t('showPassword')}
                  className="absolute end-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {forgot && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{t('forgotHint')}</p>}
            </div>

            <FormError message={error} />
            <div className="login-rise" style={delay(0.6)}>
              <Button type="submit" size="lg" disabled={pending} className="login-button group h-12 w-full rounded-xl text-base">
                {pending ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden />
                    {t('submitting')}
                  </>
                ) : (
                  <>
                    {t('submit')}
                    <ArrowRight className="transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <p className="login-rise flex items-center justify-center gap-2 text-center text-xs text-muted-foreground" style={delay(0.8)}>
        <Lock className="size-3.5 shrink-0" aria-hidden />
        {t('secure')}
      </p>
    </div>
  );
}
