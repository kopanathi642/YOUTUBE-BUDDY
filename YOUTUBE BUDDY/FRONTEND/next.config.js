/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', '@react-three/fiber', '@react-three/drei'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
    ],
    formats: ['image/webp', 'image/avif'],
  },
  webpack: (config, { dev }) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];

    // Optimize bundle splitting
    if (!dev) {
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        three: {
          test: /[\\/]node_modules[\\/](three|@react-three)[\\/]/,
          name: 'three-vendor',
          chunks: 'all',
          priority: 10,
        },
        firebase: {
          test: /[\\/]node_modules[\\/]firebase[\\/]/,
          name: 'firebase-vendor',
          chunks: 'all',
          priority: 10,
        },
        recharts: {
          test: /[\\/]node_modules[\\/]recharts[\\/]/,
          name: 'recharts-vendor',
          chunks: 'all',
          priority: 10,
        },
      };
    }

    return config;
  },
  // Enable compression and caching
  compress: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
