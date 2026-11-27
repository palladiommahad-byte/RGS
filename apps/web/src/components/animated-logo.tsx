import { cn } from '@/lib/utils';

/**
 * The EvoRiad logo as vector art (same "E" as /brand/evoriad-mark.svg), in the theme
 * colour, so its four pieces can assemble on screen. Animations: login/login.css.
 * 'light' sits on the coloured brand panel (white tile), 'dark' on a light page.
 */
export function AnimatedLogo({ tone = 'light', label, className }: { tone?: 'light' | 'dark'; label: string; className?: string }) {
  const light = tone === 'light';
  const letter = { fill: light ? 'var(--primary)' : '#ffffff' };
  return (
    <div className={cn('evo-logo flex items-center gap-3.5', className)} role="img" aria-label={label}>
      <span className="evo-mark relative block size-14 shrink-0 sm:size-16">
        <span className={cn('evo-ring absolute inset-0 rounded-[22%]', !light && 'evo-ring-dark')} aria-hidden />
        <svg viewBox="0 0 816 816" className="relative size-full drop-shadow-lg" aria-hidden>
          <rect className="evo-tile" width="816" height="816" rx="168" style={{ fill: light ? '#ffffff' : 'var(--primary)' }} />
          <path className="evo-piece evo-piece-top" style={letter} d="M159 176H637V244C637 280 624 305 601 305H216V266Z" />
          <path className="evo-piece evo-piece-stem" style={letter} d="M216 300H354V649H216Z" />
          <path className="evo-piece evo-piece-mid" style={letter} d="M352 351H595V481H352Z" />
          <path className="evo-piece evo-piece-bottom" style={letter} d="M352 520H637V649H352Z" />
        </svg>
      </span>
      <span className={cn('evo-name text-[2rem] leading-none tracking-tight sm:text-[2.15rem]', light ? 'text-white' : 'text-foreground')} dir="ltr" aria-hidden>
        <span className="font-bold">Evo</span>
        <span className="font-normal">Riad</span>
      </span>
    </div>
  );
}
