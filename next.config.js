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
        source: '/strategy-model',
        destination: '/strategy-models',
        permanent: true,
      },
      {
        source: '/strategy-model/:path+',
        destination: '/strategy-models/:path+',
        permanent: true,
      },
      {
        source: '/experiment-research',
        destination: '/strategy-models',
        permanent: true,
      },
      {
        source: '/platform/your-portfolio',
        destination: '/platform/your-portfolios',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
