/**
 * worker/test/mcp_tools.test.ts
 * Unit tests for MCP tool schema validation and execution.
 * Zgodność z dokumentacją: OpenAI function-calling, Shopify MCP.
 */

import { describe, it, expect } from 'vitest';
import {
  TOOL_SCHEMAS,
  validateFunctionSignature,
  executeToolValidated,
  getToolSchemasJson
} from '../src/mcp_tools';

describe('MCP Tool Schemas', () => {
  it('should export all required tool schemas', () => {
    expect(TOOL_SCHEMAS.introspect_graphql_schema).toBeDefined();
    expect(TOOL_SCHEMAS.validate_graphql_codeblocks).toBeDefined();
    expect(TOOL_SCHEMAS.validate_theme_codeblocks).toBeDefined();
    expect(TOOL_SCHEMAS.validate_component_codeblocks).toBeDefined();
    expect(TOOL_SCHEMAS.search_shop_catalog).toBeDefined();
    expect(TOOL_SCHEMAS.get_cart).toBeDefined();
    expect(TOOL_SCHEMAS.update_cart).toBeDefined();
    expect(TOOL_SCHEMAS.get_order_status).toBeDefined();
    expect(TOOL_SCHEMAS.get_most_recent_order_status).toBeDefined();
  });

  it('should return valid JSON string from getToolSchemasJson', () => {
    const json = getToolSchemasJson();
    expect(() => JSON.parse(json)).not.toThrow();
    
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].name).toBeDefined();
    expect(parsed[0].description).toBeDefined();
    expect(parsed[0].parameters).toBeDefined();
  });

  it('should include required fields in each schema', () => {
    for (const [toolName, schema] of Object.entries(TOOL_SCHEMAS)) {
      expect(schema.name).toBe(toolName);
      expect(schema.description).toBeDefined();
      expect(typeof schema.description).toBe('string');
      expect(schema.parameters).toBeDefined();
      expect(schema.parameters.type).toBe('object');
      expect(schema.parameters.properties).toBeDefined();
    }
  });
});

describe('validateFunctionSignature', () => {
  it('should reject unknown tool name', () => {
    const result = validateFunctionSignature('unknown_tool', {});
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Unknown tool: unknown_tool');
  });

  it('should accept valid search_shop_catalog args', () => {
    const result = validateFunctionSignature('search_shop_catalog', {
      query: 'diamond ring',
      first: 5
    });
    expect(result.ok).toBe(true);
  });

  it('should reject search_shop_catalog without required query', () => {
    const result = validateFunctionSignature('search_shop_catalog', {
      first: 5
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing required parameter: query');
  });

  it('should accept valid update_cart args', () => {
    const result = validateFunctionSignature('update_cart', {
      cart_id: 'gid://shopify/Cart/123',
      lines: [
        { merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 2 }
      ]
    });
    expect(result.ok).toBe(true);
  });

  it('should reject update_cart with missing required line properties', () => {
    const result = validateFunctionSignature('update_cart', {
      cart_id: 'gid://shopify/Cart/123',
      lines: [
        { merchandiseId: 'gid://shopify/ProductVariant/456' } // missing quantity
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.some(e => e.includes('Missing required property quantity'))).toBe(true);
  });

  it('should reject update_cart with invalid line item type', () => {
    const result = validateFunctionSignature('update_cart', {
      cart_id: 'gid://shopify/Cart/123',
      lines: [
        { merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 'two' } // should be number
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.some(e => e.includes('Invalid type'))).toBe(true);
  });

  it('should accept get_cart with valid cart_id', () => {
    const result = validateFunctionSignature('get_cart', {
      cart_id: 'gid://shopify/Cart/789'
    });
    expect(result.ok).toBe(true);
  });

  it('should reject get_cart without cart_id', () => {
    const result = validateFunctionSignature('get_cart', {});
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing required parameter: cart_id');
  });

  it('should validate introspect_graphql_schema with required endpoint', () => {
    const result = validateFunctionSignature('introspect_graphql_schema', {
      endpoint: 'https://shop.myshopify.com/admin/api/2024-07/graphql.json'
    });
    expect(result.ok).toBe(true);
  });

  it('should reject introspect_graphql_schema without endpoint', () => {
    const result = validateFunctionSignature('introspect_graphql_schema', {
      auth: { token: 'shpat_abc123' }
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Missing required parameter: endpoint');
  });

  it('should validate validate_graphql_codeblocks with required params', () => {
    const result = validateFunctionSignature('validate_graphql_codeblocks', {
      schemaSnapshotId: 'snapshot-123',
      queries: ['query { shop { name } }']
    });
    expect(result.ok).toBe(true);
  });

  it('should reject validate_graphql_codeblocks with non-array queries', () => {
    const result = validateFunctionSignature('validate_graphql_codeblocks', {
      schemaSnapshotId: 'snapshot-123',
      queries: 'not an array'
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.some(e => e.includes('Invalid type'))).toBe(true);
  });

  it('should validate validate_theme_codeblocks with files array', () => {
    const result = validateFunctionSignature('validate_theme_codeblocks', {
      files: [
        { path: 'sections/header.liquid', content: '<div>Header</div>' }
      ],
      validationMode: 'partial'
    });
    expect(result.ok).toBe(true);
  });

  it('should reject validate_theme_codeblocks with invalid validationMode', () => {
    const result = validateFunctionSignature('validate_theme_codeblocks', {
      files: [
        { path: 'sections/header.liquid', content: '<div>Header</div>' }
      ],
      validationMode: 'invalid-mode'
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.some(e => e.includes('Invalid value for validationMode'))).toBe(true);
  });

  it('should validate get_most_recent_order_status with no params', () => {
    const result = validateFunctionSignature('get_most_recent_order_status', {});
    expect(result.ok).toBe(true);
  });

  it('should validate number range for search_shop_catalog.first', () => {
    // Valid range
    expect(validateFunctionSignature('search_shop_catalog', {
      query: 'ring',
      first: 10
    }).ok).toBe(true);

    // Below minimum
    const resultLow = validateFunctionSignature('search_shop_catalog', {
      query: 'ring',
      first: 0
    });
    expect(resultLow.ok).toBe(false);
    expect(resultLow.errors?.some(e => e.includes('below minimum'))).toBe(true);

    // Above maximum
    const resultHigh = validateFunctionSignature('search_shop_catalog', {
      query: 'ring',
      first: 25
    });
    expect(resultHigh.ok).toBe(false);
    expect(resultHigh.errors?.some(e => e.includes('exceeds maximum'))).toBe(true);
  });
});

describe('executeToolValidated', () => {
  it('should execute tool if validation passes', async () => {
    const mockExecute = async (name: string, args: any) => {
      expect(name).toBe('search_shop_catalog');
      expect(args.query).toBe('diamond ring');
      return { products: [{ id: '1', title: 'Diamond Ring' }] };
    };

    const result = await executeToolValidated(
      'search_shop_catalog',
      { query: 'diamond ring', first: 5 },
      mockExecute
    );

    expect(result.ok).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result.products).toHaveLength(1);
  });

  it('should return error if validation fails', async () => {
    const mockExecute = async (name: string, args: any) => {
      throw new Error('Should not be called');
    };

    const result = await executeToolValidated(
      'search_shop_catalog',
      { first: 5 }, // missing required 'query'
      mockExecute
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(-32602);
    expect(result.error?.message).toBe('Invalid tool arguments');
    expect(result.error?.details?.errors).toContain('Missing required parameter: query');
  });

  it('should catch and return tool execution errors', async () => {
    const mockExecute = async (name: string, args: any) => {
      throw new Error('Network timeout');
    };

    const result = await executeToolValidated(
      'search_shop_catalog',
      { query: 'diamond ring', first: 5 },
      mockExecute
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.code).toBe(-32000);
    expect(result.error?.message).toBe('Tool execution failed');
    expect(result.error?.details?.message).toContain('Network timeout');
  });

  it('should validate and execute update_cart successfully', async () => {
    const mockExecute = async (name: string, args: any) => {
      expect(name).toBe('update_cart');
      expect(args.lines).toHaveLength(1);
      return { cart: { id: 'gid://shopify/Cart/123', totalQuantity: 2 } };
    };

    const result = await executeToolValidated(
      'update_cart',
      {
        cart_id: 'gid://shopify/Cart/123',
        lines: [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 2 }]
      },
      mockExecute
    );

    expect(result.ok).toBe(true);
    expect(result.result?.cart?.id).toBe('gid://shopify/Cart/123');
  });

  it('should validate and execute introspect_graphql_schema', async () => {
    const mockExecute = async (name: string, args: any) => {
      expect(name).toBe('introspect_graphql_schema');
      expect(args.endpoint).toContain('graphql.json');
      return { __schema: { types: [] } };
    };

    const result = await executeToolValidated(
      'introspect_graphql_schema',
      {
        endpoint: 'https://shop.myshopify.com/admin/api/2024-07/graphql.json',
        auth: { token: 'shpat_test123' }
      },
      mockExecute
    );

    expect(result.ok).toBe(true);
    expect(result.result?.__schema).toBeDefined();
  });
});

describe('GraphQL Validation Tool (validate_graphql_codeblocks)', () => {
  it('should accept valid GraphQL query validation request', () => {
    const result = validateFunctionSignature('validate_graphql_codeblocks', {
      schemaSnapshotId: 'snapshot-abc',
      queries: [
        'query { shop { name } }',
        'mutation { productCreate(input: {}) { product { id } } }'
      ]
    });
    expect(result.ok).toBe(true);
  });

  it('should reject if queries is not an array', () => {
    const result = validateFunctionSignature('validate_graphql_codeblocks', {
      schemaSnapshotId: 'snapshot-abc',
      queries: 'query { shop { name } }' // should be array
    });
    expect(result.ok).toBe(false);
  });
});

describe('Theme Validation Tool (validate_theme_codeblocks)', () => {
  it('should accept valid theme files', () => {
    const result = validateFunctionSignature('validate_theme_codeblocks', {
      files: [
        { path: 'sections/header.liquid', content: '{{ shop.name }}' },
        { path: 'assets/theme.css', content: 'body { margin: 0; }' }
      ],
      validationMode: 'full'
    });
    expect(result.ok).toBe(true);
  });

  it('should use default validationMode if not provided', () => {
    const result = validateFunctionSignature('validate_theme_codeblocks', {
      files: [
        { path: 'sections/footer.liquid', content: '<footer></footer>' }
      ]
    });
    expect(result.ok).toBe(true);
  });
});
