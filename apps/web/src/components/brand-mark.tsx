import { Hotel } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Riad logo (uploaded in Settings) or a default icon, next to the riad name. */
export function BrandMark({
  name,
  className,
  inverted,
  logoVersion,
}: {
  name: string;
  /** Set when the riad has a logo; served by the API to signed-in staff. */
  logoVersion?: string | null;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {logoVersion ? (
        <img src={`/api/v1/riad/logo?v=${logoVersion}`} alt="" className="size-9 shrink-0 rounded-lg object-contain" />
      ) : (
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            inverted ? 'bg-white text-primary' : 'bg-primary text-primary-foreground',
          )}
        >
          <Hotel className="size-5" aria-hidden />
        </span>
      )}
      <span className="truncate text-lg font-semibold tracking-tight">{name}</span>
    </span>
  );
}
