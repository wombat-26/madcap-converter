/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  typescript: {
    tsconfigPath: './tsconfig.ui.json'
  },
  // Server-side rendering for API routes
  images: {
    domains: ['*'],
    unoptimized: true
  }
}

export default nextConfig