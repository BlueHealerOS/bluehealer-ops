import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Content Security Policy for the whole app (Engineering context, section 8). Added to built pages only: the dev server
 * injects inline scripts for hot reload, which this policy would block. The Microsoft hosts are the sign-in and Graph
 * endpoints the app already uses; there are no third-party script or font origins.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com",
  "frame-src https://login.microsoftonline.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const csp = (): Plugin => ({
  name: 'bh-csp',
  apply: 'build',
  transformIndexHtml: { order: 'pre', handler: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`) },
});

export default defineConfig({
  base: '/bluehealer-ops/',
  plugins: [react(), tailwindcss(), csp()],
  build: { sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
