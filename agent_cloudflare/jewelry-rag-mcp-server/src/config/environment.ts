import { config } from 'dotenv';

config();

export const ENV = {
    PORT: process.env.PORT || 3000,
    MCP_SERVER_AUTH_TOKEN: process.env.MCP_SERVER_AUTH_TOKEN || '',
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || '',
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    VECTORIZE_SERVICE_URL: process.env.VECTORIZE_SERVICE_URL || 'https://api.cloudflare.com/v1/vectorize',
    CACHE_SERVICE_URL: process.env.CACHE_SERVICE_URL || 'https://api.cloudflare.com/v1/cache',
};