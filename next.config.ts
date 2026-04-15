import type { NextConfig } from 'next';
import createMDX from '@next/mdx';
import createNextIntlPlugin from 'next-intl/plugin';

const withMDX = createMDX();

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/core/i18n/request.ts',
});

const nextConfig: NextConfig = {
  output: process.env.DOCKER ? 'standalone' : undefined,
  reactStrictMode: false,
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
};

export default withNextIntl(withMDX(nextConfig));
