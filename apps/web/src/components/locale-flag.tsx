/** Round flag for a UI language (drawn inline: emoji flags don't show on every device). */
export function LocaleFlag({ locale, className }: { locale: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <clipPath id={`flag-${locale}`}>
          <circle cx="12" cy="12" r="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#flag-${locale})`}>{FLAGS[locale] ?? <rect width="24" height="24" fill="#cbd5e1" />}</g>
      <circle cx="12" cy="12" r="11.5" fill="none" stroke="rgb(0 0 0 / 0.12)" />
    </svg>
  );
}

const FLAGS: Record<string, React.ReactNode> = {
  // United Kingdom
  en: (
    <>
      <rect width="24" height="24" fill="#012169" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="5" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#C8102E" strokeWidth="2" />
      <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="7" />
      <path d="M12 0v24M0 12h24" stroke="#C8102E" strokeWidth="4" />
    </>
  ),
  // France
  fr: (
    <>
      <rect width="8" height="24" fill="#002395" />
      <rect x="8" width="8" height="24" fill="#fff" />
      <rect x="16" width="8" height="24" fill="#ED2939" />
    </>
  ),
  // Spain
  es: (
    <>
      <rect width="24" height="24" fill="#AA151B" />
      <rect y="6" width="24" height="12" fill="#F1BF00" />
    </>
  ),
  // Morocco (Arabic)
  ar: (
    <>
      <rect width="24" height="24" fill="#C1272D" />
      <path
        d="M12 7.1 15.23 17.05 6.77 10.9h10.46L8.77 17.05z"
        fill="none"
        stroke="#006233"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </>
  ),
};
