import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-secondary text-secondary-foreground',
        teal: 'bg-teal-100 text-teal-900',
        green: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
        blue: 'bg-teal-900 text-white',
        amber: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
        red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
        gray: 'bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-200',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge };
