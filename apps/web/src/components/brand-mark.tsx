import { Hotel } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Logo mark + riad name. A riad logo upload (settings) can replace the icon later. */
export function BrandMark({
  name,
  className,
  inverted,
}: {
  name: string;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          inverted ? 'bg-white text-primary' : 'bg-primary text-primary-foreground',
        )}
      >
        <Hotel className="size-5" aria-hidden />
      </span>
      <span className="truncate text-lg font-semibold tracking-tight">{name}</span>
    </span>
  );
}
