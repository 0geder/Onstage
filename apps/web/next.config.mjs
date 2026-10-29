import { fileURLToPath } from 'node:url';

/**
 * Baseline security headers for every response. Script sources are left to
 * Next's defaults (it inlines bootstrap scripts); the CSP here only closes the
 * cheap holes: framing, plugins, and base-tag hijacking.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
];

/** Image hosts: the CDN in production (CDN_HOSTNAME), any https host until it is set. */
const imageHost = process.env.CDN_HOSTNAME;

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
    remotePatterns: [{ protocol: 'https', hostname: imageHost ?? '**' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
