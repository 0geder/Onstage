import { withSentryConfig } from '@sentry/nextjs/config';
import { fileURLToPath } from 'node:url';

/** The CMS is never public content: no framing, no indexing, no sniffing. */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image; tracing starts at the
  // monorepo root so workspace packages are included.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // The shared package ships TypeScript-compiled CJS from the workspace.
  transpilePackages: ['@onstage/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: process.env.CDN_HOSTNAME ?? '**' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Uploads source maps so reports show real file names and lines. Without
// SENTRY_AUTH_TOKEN (local builds) the upload is skipped and nothing else changes.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_ADMIN ?? process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
});
