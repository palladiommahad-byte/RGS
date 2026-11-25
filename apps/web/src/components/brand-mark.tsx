import { cn } from '@/lib/utils';

/** Riad logo (uploaded in Settings), else the Riad Manager emblem, next to the name. */
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
        // On a white tile: the navy emblem must stay visible on dark backgrounds too.
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg bg-white p-0.5',
            !inverted && 'ring-1 ring-border',
          )}
        >
          <img src="/brand/riad-manager-mark.png" alt="" className="size-full object-contain" />
        </span>
      )}
      <span data-brand-name className="truncate text-lg font-semibold tracking-tight">{name}</span>
    </span>
  );
}
