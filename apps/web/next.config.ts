import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:4000';
const dev = process.env.NODE_ENV !== 'production';

/**
 * En-têtes de sécurité. Next injecte des scripts en ligne pour l'hydratation :
 * 'unsafe-inline' reste nécessaire pour script-src sans nonce ; tout le reste est verrouillé sur notre origine.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // WebSocket sur la même origine (wss en prod) ; en dev l'API écoute sur :4000
  `connect-src 'self'${dev ? ' http://localhost:4000 ws://localhost:4000 ws://localhost:3000' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(dev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
];

const config: NextConfig = {
  // Image Docker minimale (serveur Node autonome)
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  poweredByHeader: false,
  transpilePackages: ['@cryptomeme/shared'],
  // Même origine pour l'API → les cookies httpOnly fonctionnent sans CORS.
  // En production, le reverse proxy (Caddy) envoie /api et /socket.io directement à l'API.
  rewrites: () => Promise.resolve([{ source: '/api/:path*', destination: `${API}/api/:path*` }]),
  headers: () => Promise.resolve([{ source: '/:path*', headers: securityHeaders }]),
};

// Traductions : configuration lue dans i18n/request.ts
export default createNextIntlPlugin('./i18n/request.ts')(config);
