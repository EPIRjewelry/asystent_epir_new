// Test setup: ensure environment variables used by code are present during vitest runs
process.env.SHOP_DOMAIN = process.env.SHOP_DOMAIN || 'test-shop.myshopify.com';
process.env.SHOPIFY_STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN || 'mock-storefront-token-12345';
process.env.SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || 'mock-admin-token-12345';
process.env.SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || 'mock-admin-token-12345';
process.env.SHOPIFY_APP_SECRET = process.env.SHOPIFY_APP_SECRET || 'mock-app-secret-12345';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'mock-groq-key-12345';
process.env.WORKER_ORIGIN = process.env.WORKER_ORIGIN || 'https://test-worker.workers.dev';

// Some modules read process.env at import-time; forcing a small delay isn't necessary here but keep file for future global mocks

export {};
