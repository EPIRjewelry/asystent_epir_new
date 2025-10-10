/**
 * Shopify MCP Client - wywołuje oficjalny endpoint MCP Shopify
 * https://{shop_domain}/api/mcp
 * 
 * Używa Storefront API (publiczne, nie wymaga Admin Token)
 * Wymaga tylko SHOPIFY_STOREFRONT_TOKEN jako secret
 */

export interface Env {
  SHOP_DOMAIN?: string;
  SHOPIFY_STOREFRONT_TOKEN?: string;
}

interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id: string | number;
}

interface McpResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number;
}

/**
 * Wywołuje narzędzie MCP Shopify (search_shop_catalog, get_shop_policies, etc.)
 * @param toolName Nazwa narzędzia (np. "search_shop_catalog")
 * @param args Argumenty narzędzia
 * @param env Env z SHOP_DOMAIN i SHOPIFY_STOREFRONT_TOKEN
 * @returns Wynik MCP (result.content[0].text lub error)
 */
export async function callShopifyMcpTool(
  toolName: string,
  args: Record<string, any>,
  env: Env
): Promise<string> {
  if (!env.SHOP_DOMAIN) {
    throw new Error('SHOP_DOMAIN not configured in wrangler.toml [vars]');
  }

  if (!env.SHOPIFY_STOREFRONT_TOKEN) {
    throw new Error('SHOPIFY_STOREFRONT_TOKEN not set (use: wrangler secret put SHOPIFY_STOREFRONT_TOKEN)');
  }

  const mcpEndpoint = `https://${env.SHOP_DOMAIN}/api/mcp`;
  
  const request: McpRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    },
    id: Date.now()
  };

  console.log(`[Shopify MCP] Calling ${toolName} at ${mcpEndpoint}`, args);

  const response = await fetch(mcpEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': env.SHOPIFY_STOREFRONT_TOKEN
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '<no body>');
    throw new Error(`Shopify MCP HTTP ${response.status}: ${text}`);
  }

  const mcpResponse: McpResponse = await response.json();

  if (mcpResponse.error) {
    throw new Error(
      `Shopify MCP error ${mcpResponse.error.code}: ${mcpResponse.error.message}`
    );
  }

  // Standardowy format wyniku MCP
  if (mcpResponse.result?.content && Array.isArray(mcpResponse.result.content)) {
    const textContent = mcpResponse.result.content.find((c: any) => c.type === 'text');
    if (textContent?.text) {
      return String(textContent.text);
    }
  }

  // Fallback: zwróć raw result jako JSON string
  return JSON.stringify(mcpResponse.result || {});
}

/**
 * Wyszukuje produkty w katalogu Shopify przez MCP endpoint
 */
export async function searchShopCatalogMcp(
  query: string,
  env: Env,
  context?: string
): Promise<string> {
  return callShopifyMcpTool('search_shop_catalog', { query, context }, env);
}

/**
 * Pobiera polityki sklepu przez MCP endpoint
 */
export async function getShopPoliciesMcp(
  policyTypes: string[],
  env: Env
): Promise<string> {
  return callShopifyMcpTool('get_shop_policies', { policy_types: policyTypes }, env);
}
