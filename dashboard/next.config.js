/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Environment variables for Cloudflare Pages
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.finault.ai',
    NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://finault-gateway-gold.finault.workers.dev',
  },
  // Disable server-side features for static export
  trailingSlash: true,
}

module.exports = nextConfig
