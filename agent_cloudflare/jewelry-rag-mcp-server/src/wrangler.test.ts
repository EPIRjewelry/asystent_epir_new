// wrangler.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import TOML from '@iarna/toml';

// Define an interface for the expected structure of wrangler.toml for type safety
interface WranglerConfig {
  name: string;
  main: string;
  compatibility_date: string;
  account_id: string;
  workers_dev: boolean;
  d1_databases?: { binding: string; database_name: string; database_id: string }[];
  kv_namespaces?: { binding: string; id: string }[];
  vectorize?: { binding: string; index_name: string }[];
  ai?: { binding: string };
  vars?: { [key: string]: string };
  env?: {
    [key: string]: Partial<WranglerConfig>;
  };
}

describe('Wrangler Configuration (wrangler.toml)', () => {
  let config: WranglerConfig;

  beforeAll(async () => {
    // Resolve the path relative to the test file's location
    const configPath = path.resolve(__dirname, '../wrangler.toml');
    const fileContent = await fs.readFile(configPath, 'utf-8');
    config = TOML.parse(fileContent) as unknown as WranglerConfig;
  });

  it('should have correct top-level properties', () => {
    expect(config.name).toBe('jewelry-rag-mcp-server');
    expect(config.main).toBe('src/index.ts');
    expect(config.compatibility_date).toBe('2025-10-02');
    expect(config.account_id).toBe('73283c24dc79f92edef30dcdbc98f230');
    expect(config.workers_dev).toBe(true);
  });

  describe('Default (Development) Environment Bindings and Variables', () => {
    it('should have the correct D1 database binding', () => {
      const d1Binding = config.d1_databases?.find(db => db.binding === 'DB');
      expect(d1Binding).toBeDefined();
      expect(d1Binding?.database_name).toBe('jewelry-analytics-db');
      expect(d1Binding?.database_id).toBe('6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23');
    });

    it('should have the correct KV namespace bindings', () => {
      const configKv = config.kv_namespaces?.find(kv => kv.binding === 'CONFIG_KV');
      expect(configKv).toBeDefined();
      expect(configKv?.id).toBe('61bccce88f8d4df3a3369d5da8563b51');

      const sessionsKv = config.kv_namespaces?.find(kv => kv.binding === 'SESSIONS_KV');
      expect(sessionsKv).toBeDefined();
      expect(sessionsKv?.id).toBe('08f16276a9b14ca7b3c00404e8e8d0d9');
    });

    it('should have the correct Vectorize index binding', () => {
      const vectorizeBinding = config.vectorize?.find(v => v.binding === 'VECTORIZE_INDEX');
      expect(vectorizeBinding).toBeDefined();
      expect(vectorizeBinding?.index_name).toBe('autorag-epir-chatbot-rag');
    });

    it('should have the AI binding', () => {
      expect(config.ai).toBeDefined();
      expect(config.ai?.binding).toBe('AI');
    });

    it('should have correct development variables', () => {
      expect(config.vars).toBeDefined();
      expect(config.vars?.ENVIRONMENT).toBe('development');
      expect(config.vars?.SHOP_DOMAIN).toBe('epir-art-silver-jewellery.myshopify.com');
    });
  });

  describe('Production Environment (env.production)', () => {
    let prodConfig: Partial<WranglerConfig> | undefined;

    beforeAll(() => {
      prodConfig = config.env?.production;
    });

    it('should define a production environment', () => {
      expect(prodConfig).toBeDefined();
    });

    it('should have the correct properties for production', () => {
        expect(prodConfig?.name).toBe('jewelry-rag-mcp-server-prod');
        expect(prodConfig?.workers_dev).toBe(false);
    });

    it('should have the correct production D1 binding', () => {
      const d1Binding = prodConfig?.d1_databases?.find(db => db.binding === 'DB');
      expect(d1Binding).toBeDefined();
      expect(d1Binding?.database_name).toBe('jewelry-analytics-db-prod');
      expect(d1Binding?.database_id).toBe('your-prod-d1-database-id');
    });

    it('should have the correct production KV bindings', () => {
      const configKv = prodConfig?.kv_namespaces?.find(kv => kv.binding === 'CONFIG_KV');
      expect(configKv).toBeDefined();
      expect(configKv?.id).toBe('your-prod-config-kv-namespace-id');

      const sessionsKv = prodConfig?.kv_namespaces?.find(kv => kv.binding === 'SESSIONS_KV');
      expect(sessionsKv).toBeDefined();
      expect(sessionsKv?.id).toBe('your-prod-sessions-kv-namespace-id');
    });

    it('should have the correct production Vectorize binding', () => {
      const vectorizeBinding = prodConfig?.vectorize?.find(v => v.binding === 'VECTORIZE_INDEX');
      expect(vectorizeBinding).toBeDefined();
      expect(vectorizeBinding?.index_name).toBe('autorag-epir-chatbot-rag-prod');
    });

    it('should have correct production variables', () => {
      expect(prodConfig?.vars).toBeDefined();
      expect(prodConfig?.vars?.ENVIRONMENT).toBe('production');
      expect(prodConfig?.vars?.SHOP_DOMAIN).toBe('epir-art-silver-jewellery.myshopify.com');
    });
  });
});
