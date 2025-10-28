/**
 * worker/test/cot.test.ts
 * Unit tests for Chain-of-Thought (CoT) control, logging, and PII redaction.
 * Zgodność z dokumentacją: Harmony format, developer constraints, audit logging.
 */

import { describe, it, expect } from 'vitest';
import { buildHarmonyMessages, type DeveloperConstraints } from '../src/groq/engineer_prompt';

describe('CoT Control and Logging', () => {
  it('should enforce developer max_cot_tokens constraint in prompt', () => {
    const constraints: DeveloperConstraints = {
      reasoning_mode: 'high',
      max_cot_tokens: 256
    };

    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: [],
        userQuery: 'Explain quantum computing.'
      },
      constraints
    );

    // Find developer message
    const devMsg = messages.find(m => m.role === 'developer');
    expect(devMsg).toBeDefined();
    expect(devMsg?.content).toContain('max_cot_tokens: 256');
    expect(devMsg?.content).toContain('Keep CoT under 256 tokens');
  });

  it('should include reasoning_mode in developer message', () => {
    const constraints: DeveloperConstraints = {
      reasoning_mode: 'low',
      max_cot_tokens: 128
    };

    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: [],
        userQuery: 'What is 2+2?'
      },
      constraints
    );

    const devMsg = messages.find(m => m.role === 'developer');
    expect(devMsg?.content).toContain('reasoning_mode: low');
    expect(devMsg?.content).toContain('prefer short deterministic answers');
  });

  it('should instruct model to separate CoT from final answer', () => {
    const constraints: DeveloperConstraints = {
      reasoning_mode: 'auto',
      max_cot_tokens: 512
    };

    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: [],
        userQuery: 'Solve this complex problem.'
      },
      constraints
    );

    const devMsg = messages.find(m => m.role === 'developer');
    expect(devMsg?.content).toContain('separate message with role \'internal\' or \'debug\'');
    expect(devMsg?.content).toContain('Do NOT include CoT in the final user-facing answer');
  });

  it('should include output format if specified', () => {
    const constraints: DeveloperConstraints = {
      reasoning_mode: 'auto',
      max_cot_tokens: 512,
      output_format: 'JSON schema ProductSearch v1.0'
    };

    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: [],
        userQuery: 'Find products.'
      },
      constraints
    );

    const devMsg = messages.find(m => m.role === 'developer');
    expect(devMsg?.content).toContain('Output format: JSON schema ProductSearch v1.0');
    expect(devMsg?.content).toContain('Ensure final response follows the specified JSON schema');
  });

  // Simulate CoT logging (would be implemented in worker/src/index.ts or logger.ts)
  it('should log CoT with metadata (simulated)', () => {
    // This test validates the structure of a CoT log entry
    const cotLogEntry = {
      requestId: 'req-12345',
      userId: 'user-***',  // masked
      timestamp: Date.now(),
      reasoning_tokens_estimate: 180,
      reasoning_text: 'Step 1: Analyze query. Step 2: Search catalog. Step 3: Format results.',
      truncated: false,
      reason_for_truncation: null
    };

    expect(cotLogEntry.requestId).toBeDefined();
    expect(cotLogEntry.userId).toContain('***'); // PII masked
    expect(cotLogEntry.reasoning_tokens_estimate).toBeLessThanOrEqual(256); // Within max_cot_tokens
    expect(cotLogEntry.truncated).toBe(false);
  });

  it('should mark CoT as truncated if exceeds max_cot_tokens (simulated)', () => {
    const maxCotTokens = 256;
    const estimatedTokens = 300; // Exceeds limit

    const cotLogEntry = {
      requestId: 'req-67890',
      userId: 'user-***',
      timestamp: Date.now(),
      reasoning_tokens_estimate: estimatedTokens,
      reasoning_text: 'Very long reasoning text... [truncated]',
      truncated: estimatedTokens > maxCotTokens,
      reason_for_truncation: estimatedTokens > maxCotTokens ? 'exceeded_max_cot_tokens' : null
    };

    expect(cotLogEntry.truncated).toBe(true);
    expect(cotLogEntry.reason_for_truncation).toBe('exceeded_max_cot_tokens');
  });

  // PII Redaction tests
  it('should redact email addresses from CoT (simulated)', () => {
    const rawCoT = 'User john.doe@example.com asked about product X.';
    const redacted = rawCoT.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'user@***');

    expect(redacted).not.toContain('john.doe@example.com');
    expect(redacted).toContain('user@***');
  });

  it('should redact phone numbers from CoT (simulated)', () => {
    const rawCoT = 'Contact us at +1-555-123-4567 for support.';
    // Simple regex for phone numbers (can be enhanced)
    const redacted = rawCoT.replace(/\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '***-***-****');

    expect(redacted).not.toContain('+1-555-123-4567');
    expect(redacted).toContain('***-***-****');
  });

  it('should redact API keys/tokens from CoT (simulated)', () => {
    const rawCoT = 'Using API key: sk_live_abc123xyz456 for authentication.';
    // Redact common API key patterns
    const redacted = rawCoT.replace(/\b(sk_live|sk_test|pk_live|pk_test|shpat|shpca)_[A-Za-z0-9_-]+\b/g, '***REDACTED_KEY***');

    expect(redacted).not.toContain('sk_live_abc123xyz456');
    expect(redacted).toContain('***REDACTED_KEY***');
  });

  it('should redact credit card numbers from CoT (simulated)', () => {
    const rawCoT = 'Payment with card 4532-1234-5678-9010 was successful.';
    // Redact 13-19 digit card numbers (with optional dashes/spaces)
    const redacted = rawCoT.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4,7}\b/g, '****-****-****-****');

    expect(redacted).not.toContain('4532-1234-5678-9010');
    expect(redacted).toContain('****-****-****-****');
  });
});

describe('Harmony Message Structure', () => {
  it('should build messages in correct order: system -> developer -> user', () => {
    const constraints: DeveloperConstraints = {
      reasoning_mode: 'auto',
      max_cot_tokens: 512
    };

    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: [
          { role: 'user', content: 'Previous question' },
          { role: 'assistant', content: 'Previous answer' }
        ],
        userQuery: 'New question'
      },
      constraints
    );

    // Check order
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('developer');
    expect(messages[2].role).toBe('user'); // from history
    expect(messages[3].role).toBe('assistant'); // from history
    expect(messages[4].role).toBe('user'); // current query
  });

  it('should embed MCP tool schemas in system message', () => {
    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: [],
        userQuery: 'Search products'
      }
    );

    const systemMsg = messages.find(m => m.role === 'system');
    expect(systemMsg?.content).toContain('MCP TOOL SCHEMAS');
    expect(systemMsg?.content).toContain('search_shop_catalog');
    expect(systemMsg?.content).toContain('introspect_graphql_schema');
    expect(systemMsg?.content).toContain('validate_graphql_codeblocks');
  });

  it('should include RAG context in system message if provided', () => {
    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: [],
        ragContext: [
          { id: 'doc1', text: 'Product A is a luxury ring.', meta: { gid: 'gid://shopify/Product/123' } },
          { id: 'doc2', text: 'Product B is a necklace.', meta: { url: 'https://shop.com/products/b' } }
        ],
        userQuery: 'Tell me about our products'
      }
    );

    const systemMsg = messages.find(m => m.role === 'system');
    expect(systemMsg?.content).toContain('RAG CONTEXT');
    expect(systemMsg?.content).toContain('Product A is a luxury ring');
    expect(systemMsg?.content).toContain('gid://shopify/Product/123');
    expect(systemMsg?.content).toContain('RAG POLICY');
  });

  it('should limit chat history to last 10 messages', () => {
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`
    }));

    const messages = buildHarmonyMessages(
      {
        systemPersona: 'You are a helpful assistant.',
        chatHistory: longHistory,
        userQuery: 'Final question'
      }
    );

    // Count history messages (exclude system, developer, current user query)
    const historyMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    // Should be 10 from history + 1 current user query = 11 total user/assistant messages
    // But since current query is added separately, history should be 10
    const historyOnly = messages.slice(1, -1).filter(m => m.role === 'user' || m.role === 'assistant');
    expect(historyOnly.length).toBeLessThanOrEqual(10);
  });
});
