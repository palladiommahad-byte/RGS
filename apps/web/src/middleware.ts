import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { isStaffLocale, routing } from './i18n/routing';

const intl = createMiddleware(routing);

const STAFF_PREFIXES = ['/dashboard', '/login'];

export default function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const match = /^\/([a-z]{2})(\/.*)?$/.exec(pathname);
  const locale = match?.[1];
  const rest = match?.[2] ?? '/';

  if (locale && (routing.locales as readonly string[]).includes(locale)) {
    // No public site: the locale root is the staff dashboard.
    if (rest === '/') {
      const staff = isStaffLocale(locale) ? locale : 'fr';
      return NextResponse.redirect(new URL(`/${staff}/dashboard`, req.url));
    }
    const isStaffArea = STAFF_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
    // The staff area is only available in French and Arabic.
    if (isStaffArea && !isStaffLocale(locale)) {
      return NextResponse.redirect(new URL(`/fr${rest}${search}`, req.url));
    }
    // Fast path: no session cookie at all -> straight to login. The API still
    // authenticates every request; this only avoids rendering an empty dashboard.
    if (rest.startsWith('/dashboard') && !req.cookies.has('has_session')) {
      const url = new URL(`/${locale}/login`, req.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }
  return intl(req);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
