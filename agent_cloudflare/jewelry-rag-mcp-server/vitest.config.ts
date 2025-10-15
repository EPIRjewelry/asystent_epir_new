import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      // You can add mock bindings here if your tests require them
      // kvNamespaces: ['CONFIG_KV'],
    },
  },
});