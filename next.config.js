/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/performance',
        destination: '/strategy-models',
        permanent: true,
      },
      {
        source: '/performance/:slug',
        destination: '/strategy-models/:slug',
        permanent: true,
      },
      {
        source: '/performance/:slug/:portfolio',
        destination: '/strategy-models/:slug/:portfolio',
        permanent: true,
      },
      {
        source: '/platform/performance',
        destination: '/strategy-models',
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
        destination: '/whitepaper',
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
