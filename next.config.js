/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/platform/performance',
        destination: '/performance',
        permanent: true,
      },
      {
        source: '/experiment-research',
        destination: '/strategy-model',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
