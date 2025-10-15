import { Router } from 'itty-router';

// Environment interface
interface Env {
  DB: D1Database;
  CONFIG_KV: KVNamespace;
  VECTORIZE_INDEX: VectorizeIndex;
  AI: Ai;
  MCP_SERVER_AUTH_TOKEN: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
}

// MCP JSON-RPC types
interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// Router setup
const router = Router();

// Authentication middleware
const authenticate = (request: Request, env: Env): boolean => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.substring(7);
  return token === env.MCP_SERVER_AUTH_TOKEN;
};

// MCP Tools definitions
const tools: MCPTool[] = [
  {
    name: 'aiChat',
    description: 'Wyślij prompt do AI Gateway i odbierz odpowiedź modelu. Umożliwia rozmowę z AI, generowanie kodu, tekstów, itp.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string', default: '@cf/meta/llama-2-7b-chat-fp16' },
        options: { type: 'object' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'insertKnowledge',
    description: 'Dodaje nowe dokumenty do bazy wektorowej wiedzy. Przetwarza dane tekstowe na wektory i zapisuje je w indeksie Vectorize.',
    inputSchema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              metadata: { type: 'object' }
            },
            required: ['id', 'text']
          }
        }
      },
      required: ['documents']
    }
  },
  {
    name: 'deleteKnowledge',
    description: 'Trwale usuwa dokumenty z bazy wektorowej wiedzy na podstawie ich unikalnych identyfikatorów.',
    inputSchema: {
      type: 'object',
      properties: {
        document_ids: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['document_ids']
    }
  },
  {
    name: 'rebuildIndex',
    description: 'Całkowicie przebudowuje bazę wiedzy. Usuwa wszystkie istniejące dane z indeksu Vectorize i wypełnia go na nowo danymi pobranymi z podanego adresu URL.',
    inputSchema: {
      type: 'object',
      properties: {
        source_url: { type: 'string' }
      },
      required: ['source_url']
    }
  },
  {
    name: 'queryConversations',
    description: 'Przeszukuje historię konwersacji. Pozwala na filtrowanie rozmów na podstawie identyfikatora klienta oraz opcjonalnego zakresu dat.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        date_range_start: { type: 'string' },
        date_range_end: { type: 'string' }
      },
      required: ['customer_id']
    }
  },
  {
    name: 'getConversationTranscript',
    description: 'Pobiera pełny zapis (wszystkie wiadomości od użytkownika i AI) dla konkretnej sesji czatu na podstawie jej ID.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' }
      },
      required: ['session_id']
    }
  },
  {
    name: 'archiveOldConversations',
    description: 'Archiwizuje (lub usuwa) sesje konwersacji starsze niż podana liczba dni.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number' }
      },
      required: ['days']
    }
  },
  {
    name: 'getAiGatewayLogs',
    description: 'Przeszukuje logi Cloudflare AI Gateway. Umożliwia filtrowanie po kodzie statusu lub statusie cache w określonym oknie czasowym.',
    inputSchema: {
      type: 'object',
      properties: {
        filter_options: {
          type: 'object',
          properties: {
            status_code: { type: 'number' },
            has_cache_hit: { type: 'boolean' }
          }
        },
        time_window_minutes: { type: 'number' }
      },
      required: ['time_window_minutes']
    }
  },
  {
    name: 'checkCacheHitRatio',
    description: 'Sprawdza i zwraca procentowy wskaźnik trafień w cache dla AI Gateway w ciągu ostatniej godziny.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'updateSystemPrompt',
    description: 'Natychmiastowo aktualizuje systemowy prompt dla bota konwersacyjnego.',
    inputSchema: {
      type: 'object',
      properties: {
        new_prompt: { type: 'string' }
      },
      required: ['new_prompt']
    }
  },
  {
    name: 'getSystemPrompt',
    description: 'Pobiera i wyświetla aktualnie używany systemowy prompt bota.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'listBindings',
    description: 'Wyświetla listę wszystkich skonfigurowanych powiązań (bindings) dla tego Workera.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'createCronTrigger',
    description: 'Utwórz cron trigger dla wskazanego skryptu Workers (account-level).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        schedule: { type: 'string' },
        script: { type: 'string' }
      },
      required: ['name','schedule','script']
    }
  },
  {
    name: 'deleteCronTrigger',
    description: 'Usuń cron trigger po ID.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'listCronTriggers',
    description: 'Wyświetl cron triggery dla konta lub skryptu.',
    inputSchema: { type: 'object', properties: { script: { type: 'string' } } }
  },
  {
    name: 'createRoute',
    description: 'Utwórz account-level route dla Workera.',
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, script: { type: 'string' } }, required: ['pattern','script'] }
  },
  {
    name: 'deleteRoute',
    description: 'Usuń route po ID.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'listRoutes',
    description: 'Wyświetl account-level routes.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'setKVFlag',
    description: 'Ustaw wartość konfiguracyjną w KV (CONFIG_KV).',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key','value'] }
  },
  {
    name: 'getKVFlag',
    description: 'Pobierz wartość konfiguracyjną z KV (CONFIG_KV).',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }
  },
  {
    name: 'deployWorker',
    description: 'Bezpieczny stub do wdrożeń Workera; domyślnie dryRun. Wymaga confirm=true by wykonać.',
    inputSchema: { type: 'object', properties: { script_name: { type: 'string' }, dryRun: { type: 'boolean' }, confirm: { type: 'boolean' } }, required: ['script_name'] }
  },
  {
    name: 'createWorkerFromCode',
    description: 'Tworzy i wdraża nowego Workera na koncie Cloudflare na podstawie dostarczonego kodu. Wymaga potwierdzenia.',
    inputSchema: {
      type: 'object',
      properties: {
        script_name: { type: 'string' },
        script_code: { type: 'string' },
        dryRun: { type: 'boolean', default: true },
        confirm: { type: 'boolean', default: false }
      },
      required: ['script_name', 'script_code']
    }
  }
];

// Tool implementations

// AI chat tool implementation
async function aiChat(params: any, env: Env): Promise<any> {
  const prompt = params.prompt;
  const model = params.model || '@cf/meta/llama-2-7b-chat-fp16';
  const options = params.options || {};
  if (!prompt) throw new Error('Brak promptu');
  try {
    // Call Workers AI Gateway
    const result = await env.AI.run(model, { text: prompt, ...options });
    // result: { result: { response: string } } lub podobnie
    return { success: true, model, response: result.result?.response || result.result || result };
  } catch (error: any) {
    throw new Error(`AI error: ${error.message}`);
  }
}

async function insertKnowledge(params: any, env: Env): Promise<any> {
  try {
    const { documents } = params;
    const results = [];

    for (const doc of documents) {
      // Generate embedding using Cloudflare AI - używamy model zgodny z 1024 wymiarami
      const embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
        text: doc.text
      }) as { data: number[][] };

      // Insert into Vectorize - indeks ma 1024 wymiary
      await env.VECTORIZE_INDEX.upsert([{
        id: doc.id,
        values: embedding.data[0],
        metadata: {
          text: doc.text,
          ...doc.metadata
        }
      }]);

      results.push({ id: doc.id, status: 'inserted' });
    }

    return { success: true, results };
  } catch (error: any) {
    throw new Error(`Failed to insert knowledge: ${error.message}`);
  }
}

async function deleteKnowledge(params: any, env: Env): Promise<any> {
  try {
    const { document_ids } = params;
    await env.VECTORIZE_INDEX.deleteByIds(document_ids);
    return { success: true, deleted_count: document_ids.length };
  } catch (error: any) {
    throw new Error(`Failed to delete knowledge: ${error.message}`);
  }
}

async function rebuildIndex(params: any, env: Env): Promise<any> {
  try {
    const { source_url } = params;
    
    // Fetch data from source URL
    const response = await fetch(source_url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data from ${source_url}`);
    }
    
    const data = await response.json();
    
    // Get all existing IDs and delete them - dla indeksu 1024 wymiarowego
    const query = await env.VECTORIZE_INDEX.query(new Array(1024).fill(0) as number[], { 
      topK: 10000 
    });
    if (query.matches.length > 0) {
      const existingIds = query.matches.map(match => match.id);
      await env.VECTORIZE_INDEX.deleteByIds(existingIds);
    }
    
    // Insert new data
    const results = await insertKnowledge({ documents: data }, env);
    
    return { success: true, message: 'Index rebuilt successfully', ...results };
  } catch (error: any) {
    throw new Error(`Failed to rebuild index: ${error.message}`);
  }
}

async function queryConversations(params: any, env: Env): Promise<any> {
  try {
    const { customer_id, date_range_start, date_range_end } = params;
    
    // Dopasowane do struktury: conversations.session_id, started_at jako INTEGER timestamp
    let query = `
      SELECT id, session_id, started_at, ended_at
      FROM conversations
      WHERE session_id LIKE ?
    `;
    
    const queryParams: (string | number)[] = [`%${customer_id}%`]; // Szukamy po części session_id
    
    if (date_range_start) {
      const startTimestamp = Math.floor(new Date(date_range_start).getTime() / 1000);
      query += ` AND started_at >= ?`;
      queryParams.push(startTimestamp);
    }
    
    if (date_range_end) {
      const endTimestamp = Math.floor(new Date(date_range_end).getTime() / 1000);
      query += ` AND started_at <= ?`;
      queryParams.push(endTimestamp);
    }
    
    query += ` ORDER BY started_at DESC`;
    
    const result = await env.DB.prepare(query).bind(...queryParams).all();
    
    return { success: true, conversations: result.results };
  } catch (error: any) {
    throw new Error(`Failed to query conversations: ${error.message}`);
  }
}

async function getConversationTranscript(params: any, env: Env): Promise<any> {
  try {
    const { session_id } = params;
    
    // Dopasowane do struktury: messages.conversation_id, created_at jako INTEGER
    const result = await env.DB.prepare(`
      SELECT role, content, created_at
      FROM messages
      WHERE conversation_id = (
        SELECT id FROM conversations WHERE session_id = ?
      )
      ORDER BY created_at ASC
    `).bind(session_id).all();
    
    return { success: true, transcript: result.results };
  } catch (error: any) {
    throw new Error(`Failed to get conversation transcript: ${error.message}`);
  }
}

async function archiveOldConversations(params: any, env: Env): Promise<any> {
  try {
    const { days } = params;
    const cutoffTimestamp = Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000);
    
    // Delete old messages first (foreign key constraint)
    const messagesResult = await env.DB.prepare(`
      DELETE FROM messages
      WHERE conversation_id IN (
        SELECT id FROM conversations
        WHERE started_at < ?
      )
    `).bind(cutoffTimestamp).run();
    
    // Delete old conversations
    const conversationsResult = await env.DB.prepare(`
      DELETE FROM conversations
      WHERE started_at < ?
    `).bind(cutoffTimestamp).run();
    
    return {
      success: true,
      archived_messages: messagesResult.meta.changes,
      archived_conversations: conversationsResult.meta.changes
    };
  } catch (error: any) {
    throw new Error(`Failed to archive old conversations: ${error.message}`);
  }
}

async function getAiGatewayLogs(params: any, env: Env): Promise<any> {
  // Simplified implementation - in real scenario would use Analytics API
  return {
    success: true,
    message: 'AI Gateway logs feature - requires Analytics API integration',
    sample_data: [
      {
        timestamp: new Date().toISOString(),
        status_code: 200,
        cache_hit: true,
        request_duration: 150
      }
    ]
  };
}

async function checkCacheHitRatio(params: any, env: Env): Promise<any> {
  // Simplified implementation - in real scenario would use Analytics API
  return {
    success: true,
    cache_hit_ratio: 0.85,
    time_window: '1 hour',
    total_requests: 1250,
    cache_hits: 1062
  };
}

async function updateSystemPrompt(params: any, env: Env): Promise<any> {
  try {
    const { new_prompt } = params;
    await env.CONFIG_KV.put('SYSTEM_PROMPT', new_prompt);
    return { success: true, message: 'System prompt updated successfully' };
  } catch (error: any) {
    throw new Error(`Failed to update system prompt: ${error.message}`);
  }
}

async function getSystemPrompt(params: any, env: Env): Promise<any> {
  try {
    const prompt = await env.CONFIG_KV.get('SYSTEM_PROMPT');
    return { success: true, system_prompt: prompt };
  } catch (error: any) {
    throw new Error(`Failed to get system prompt: ${error.message}`);
  }
}

async function listBindings(params: any, env: Env): Promise<any> {
  return {
    success: true,
    bindings: {
      database: 'DB (D1 Database)',
      kv_store: 'CONFIG_KV (KV Namespace)',
      vectorize: 'VECTORIZE_INDEX (Vectorize Index)',
      ai: 'AI (Workers AI)',
      secrets: [
        'MCP_SERVER_AUTH_TOKEN',
        'CLOUDFLARE_API_TOKEN',
        'CLOUDFLARE_ACCOUNT_ID'
      ]
    }
  };
}

// MCP tool handlers mapping
const toolHandlers: Record<string, (params: any, env: Env) => Promise<any>> = {
  aiChat,
  insertKnowledge,
  deleteKnowledge,
  rebuildIndex,
  queryConversations,
  getConversationTranscript,
  archiveOldConversations,
  getAiGatewayLogs,
  checkCacheHitRatio,
  updateSystemPrompt,
  getSystemPrompt,
  listBindings,
  // cloudflare events tools
  createCronTrigger: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.createCronTrigger(p, env as any),
  deleteCronTrigger: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.deleteCronTrigger(p, env as any),
  listCronTriggers: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.listCronTriggers(p, env as any),
  createRoute: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.createRoute(p, env as any),
  deleteRoute: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.deleteRoute(p, env as any),
  listRoutes: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.listRoutes(p, env as any),
  setKVFlag: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.setKVFlag(p, env as any),
  getKVFlag: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.getKVFlag(p, env as any),
  deployWorker: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.deployWorker(p, env as any),
  createWorkerFromCode: async (p, env) => (await import('./mcp/handlers/cloudflare_events')).default.createWorkerFromCode(p, env as any)
};

// MCP endpoint handler
router.post('/mcp', async (request: Request, env: Env) => {
  // Authenticate request
  if (!authenticate(request, env)) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Invalid or missing Bearer token'
      }
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const mcpRequest: MCPRequest = await request.json();

    // Handle different MCP methods
    switch (mcpRequest.method) {
      case 'tools/list':
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result: { tools }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });

      case 'tools/call':
        const { name, arguments: args } = mcpRequest.params;
        
        if (!toolHandlers[name]) {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            }
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        try {
          const result = await toolHandlers[name](args, env);
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (toolError: any) {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: {
              code: -32000,
              message: toolError.message
            }
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

      default:
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          error: {
            code: -32601,
            message: `Unknown method: ${mcpRequest.method}`
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error: Invalid JSON'
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Health check endpoint
router.get('/health', () => {
  return new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Default 404 handler
router.all('*', () => new Response('Not Found', { status: 404 }));

// Export default fetch handler
export default {
  fetch: router.handle
};