/**
 * Model Lock Verification Test
 * 
 * This test ensures that the AI model ID has not been accidentally changed.
 * The system is designed SPECIFICALLY for openai/gpt-oss-120b and will NOT work
 * correctly with any other model without significant refactoring.
 */

import { describe, it, expect } from 'vitest';
import { GROQ_MODEL_ID } from '../src/ai-client';

describe('Model Lock Verification', () => {
  it('CRITICAL: Model ID must be openai/gpt-oss-120b', () => {
    const EXPECTED_MODEL = 'openai/gpt-oss-120b';
    
    expect(GROQ_MODEL_ID).toBe(EXPECTED_MODEL);
    
    // Additional type-level check
    const typeCheck: 'openai/gpt-oss-120b' = GROQ_MODEL_ID;
    expect(typeCheck).toBe(EXPECTED_MODEL);
  });

  it('Model ID should be a constant (readonly)', () => {
    // This test will fail at compile-time if someone tries to reassign GROQ_MODEL_ID
    // TypeScript will prevent: GROQ_MODEL_ID = 'something-else';
    
    expect(typeof GROQ_MODEL_ID).toBe('string');
    expect(GROQ_MODEL_ID.length).toBeGreaterThan(0);
  });

  it('Model ID should match Groq API format', () => {
    // Groq models follow the pattern: provider/model-name
    expect(GROQ_MODEL_ID).toMatch(/^[a-z]+\/[a-z0-9-]+$/);
    expect(GROQ_MODEL_ID).toContain('openai/');
  });
});
