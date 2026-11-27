import { AppLogo } from '@/components/app-logo';
import { cn } from '@/lib/utils';

/** Riad logo (uploaded in Settings), else the EvoRiad mark, next to the name. */
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
        <AppLogo mark className={cn('size-9 shrink-0', inverted && 'rounded-[22%] ring-1 ring-white/25')} />
      )}
      <span data-brand-name className="truncate text-lg font-semibold tracking-tight">{name}</span>
    </span>
  );
}
