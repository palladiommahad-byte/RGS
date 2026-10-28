'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Label + control + translated validation message. */
export function FormField({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('validation');
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {t.has(error) ? t(error) : t('invalid')}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  );
}
