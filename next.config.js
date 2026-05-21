/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ['recharts', 'date-fns'],
  webpack: (config) => {
    // This is needed for Netlify builds
    config.resolve.fallback = { ...config.resolve.fallback };
    return config;
  },
};

module.exports = nextConfig;
