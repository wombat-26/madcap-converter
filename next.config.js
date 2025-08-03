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
  }
}

export default nextConfig