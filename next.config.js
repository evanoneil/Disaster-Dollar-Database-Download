/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  transpilePackages: ['recharts', 'date-fns'],
  webpack: (config) => {
    // This is needed for Netlify builds
    config.resolve.fallback = { ...config.resolve.fallback };
    return config;
  },
};

module.exports = nextConfig; 