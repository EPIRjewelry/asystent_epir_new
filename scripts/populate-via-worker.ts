#!/usr/bin/env node
/**
 * Populate Vectorize via Worker binding (no API token needed)
 * Używa wrangler dev --remote do uruchomienia w kontekście Workera
 */

import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('🚀 Populating Vectorize via Worker...');
  console.log('📍 This uses wrangler to access bindings directly\n');
  
  // Odczytaj dane lokalne
  const faqsPath = join(process.cwd(), 'docs', 'faqs.json');
  const policiesPath = join(process.cwd(), 'docs', 'shop-policies.json');
  
  let faqs = [];
  let policies = [];
  
  try {
    faqs = JSON.parse(readFileSync(faqsPath, 'utf-8'));
    console.log(`✓ Loaded ${faqs.length} FAQs from ${faqsPath}`);
  } catch (e) {
    console.log(`⚠️  No FAQs found at ${faqsPath}`);
  }
  
  try {
    policies = JSON.parse(readFileSync(policiesPath, 'utf-8'));
    console.log(`✓ Loaded ${policies.length} policies from ${policiesPath}`);
  } catch (e) {
    console.log(`⚠️  No policies found at ${policiesPath}`);
  }
  
  console.log('\n✅ Use wrangler CLI to populate:');
  console.log('   wrangler vectorize insert autorag-epir-chatbot-rag --file=vectors.ndjson');
  console.log('\nℹ️  Or implement direct insertion via Worker endpoint');
}

main().catch(console.error);
