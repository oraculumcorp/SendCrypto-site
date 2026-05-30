import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile',
  }),
  site: 'https://sendcrypto.io',
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    ssr: {
      external: ['node:async_hooks', 'node:crypto'],
    },
  },
  security: {
    checkOrigin: true,
  },
});
