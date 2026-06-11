import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/core/i18n/config';
import { defaultLocale, locales } from '@/config/locale';

const intlMiddleware = createMiddleware(routing);

function localePrefix(locale?: string) {
  return locale && locale !== defaultLocale ? `/${locale}` : '';
}

function getLegacyPath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const locale = locales.includes(segments[0]) ? segments.shift() : undefined;
  return { locale, segments };
}

export default function middleware(request: NextRequest) {
  const { locale, segments } = getLegacyPath(request.nextUrl.pathname);

  if (segments.join('/') === 'dashboard') {
    const url = request.nextUrl.clone();
    url.pathname = `${localePrefix(locale)}/create`;
    url.hash = '';
    return NextResponse.redirect(url);
  }

  if (segments.join('/') === 'dashboard/create') {
    const url = request.nextUrl.clone();
    url.pathname = `${localePrefix(locale)}/create`;
    url.hash = '';
    return NextResponse.redirect(url);
  }

  if (segments.join('/') === 'dashboard/lyric-videos/upload') {
    const url = request.nextUrl.clone();
    url.pathname = `${localePrefix(locale)}/create`;
    url.hash = '';
    return NextResponse.redirect(url);
  }

  if (segments.join('/') === 'dashboard/lyric-videos') {
    const url = request.nextUrl.clone();
    url.pathname = `${localePrefix(locale)}/creations`;
    url.hash = '';
    return NextResponse.redirect(url);
  }

  if (
    segments[0] === 'dashboard' &&
    segments[1] === 'lyric-videos' &&
    segments[2] &&
    segments[3] === 'preview' &&
    segments.length === 4
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `${localePrefix(locale)}/lyric-videos/${segments[2]}/preview`;
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Match all pathnames except API routes, static files, etc.
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
