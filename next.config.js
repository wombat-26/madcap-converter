import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pkg = require('./package.json')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  typescript: {
    tsconfigPath: './tsconfig.ui.json',
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || pkg.version,
  },
  // Server-side rendering for API routes
  images: {
    domains: ['*'],
    unoptimized: true
  },
  // Webpack dev server configuration for stability
  webpack: (config, { dev }) => {
    if (dev) {
      // Optimize for large batch operations
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: /node_modules/,
      }
      // Increase memory allocation for webpack
      config.infrastructureLogging = {
        level: 'error'
      }
    }
    return config
  },
  // Experimental features for large file handling
  experimental: {
    largePageDataBytes: 128 * 1024, // 128KB
  },
}

export default nextConfig
