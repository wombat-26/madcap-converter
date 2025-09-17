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