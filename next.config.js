const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        got: false,
        http: false,
        https: false,
        stream: false,
        crypto: false,
        path: false,
        os: false,
        zlib: false,
        '@telegram-apps/bridge': false,
        aptos: false,
        '@mizuwallet-sdk/core': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
