import { cn } from '@/lib/utils';

/**
 * The EvoRiad logo in the colour of the theme: blue with the blue theme, green otherwise.
 * Both images are in the page and CSS shows one (`theme-blue:`, globals.css), so the right
 * colour paints from the first frame.
 */
export function AppLogo({ mark, alt = '', className }: { mark?: boolean; alt?: string; className?: string }) {
  const file = mark ? ['evoriad-mark', 'svg'] : ['evoriad-logo', 'png'];
  return (
    <>
      <img src={`/brand/${file[0]}.${file[1]}`} alt={alt} className={cn(className, 'theme-blue:hidden')} />
      <img src={`/brand/${file[0]}-blue.${file[1]}`} alt={alt} className={cn(className, 'hidden theme-blue:block')} />
    </>
  );
}
