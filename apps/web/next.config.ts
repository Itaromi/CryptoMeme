import type { NextConfig } from 'next';

const API = process.env.API_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  transpilePackages: ['@cryptomeme/shared'],
  // Même origine pour l'API → les cookies httpOnly fonctionnent sans CORS
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};
export default config;
