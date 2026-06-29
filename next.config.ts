import type { NextConfig } from 'next';
import createMDX from '@next/mdx';
import createNextIntlPlugin from 'next-intl/plugin';

const withMDX = createMDX();

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/core/i18n/request.ts',
});

const noindexHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const noindexNoarchiveHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'Cache-Control', value: 'private, no-store' },
];

const authNoindexSources = [
  '/forgot-password',
  '/reset-password',
  '/sign-in',
  '/sign-up',
  '/verify-email',
  '/zh/forgot-password',
  '/zh/reset-password',
  '/zh/sign-in',
  '/zh/sign-up',
  '/zh/verify-email',
];

const privateNoindexSources = [
  '/admin',
  '/admin/:path*',
  '/create',
  '/create/:path*',
  '/creations',
  '/creations/:path*',
  '/dashboard',
  '/dashboard/:path*',
  '/lyric-videos',
  '/lyric-videos/:path*',
  '/settings',
  '/settings/:path*',
  '/zh/admin',
  '/zh/admin/:path*',
  '/zh/create',
  '/zh/create/:path*',
  '/zh/creations',
  '/zh/creations/:path*',
  '/zh/dashboard',
  '/zh/dashboard/:path*',
  '/zh/lyric-videos',
  '/zh/lyric-videos/:path*',
  '/zh/settings',
  '/zh/settings/:path*',
];

const nextConfig: NextConfig = {
  output: process.env.DOCKER ? 'standalone' : undefined,
  reactStrictMode: false,
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  async headers() {
    return [
      ...authNoindexSources.map((source) => ({
        source,
        headers: noindexHeaders,
      })),
      ...privateNoindexSources.map((source) => ({
        source,
        headers: noindexHeaders,
      })),
      {
        source: '/api/lyric-videos/:id/exports/:exportId/download',
        headers: noindexNoarchiveHeaders,
      },
      {
        // Prevent MIME-sniffing site-wide: a mislabeled/uploaded file
        // (e.g. an SVG/HTML) cannot be reinterpreted as an executable doc.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default withNextIntl(withMDX(nextConfig));
