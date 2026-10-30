import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@riad/shared'],
  poweredByHeader: false,
  // Docker image: a self-contained server (node server.js) traced from the monorepo root
  // (builds run from apps/web).
  ...(process.env.BUILD_STANDALONE === '1'
    ? { output: 'standalone' as const, outputFileTracingRoot: path.join(process.cwd(), '../..') }
    : {}),
  // The browser talks to the API through this same origin, so auth cookies stay
  // first-party and httpOnly without cross-site CORS.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default withNextIntl(nextConfig);
