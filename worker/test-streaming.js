#!/usr/bin/env node

/**
 * Test script for streaming chat functionality
 * 
 * Usage:
 *   node test-streaming.js [worker-url] [message]
 * 
 * Example:
 *   node test-streaming.js https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev "Tell me about your jewelry"
 */

const crypto = require('crypto');

const SHOPIFY_APP_SECRET = process.env.SHOPIFY_APP_SECRET || '8afcc53512826bc6677fde490b1ca99e';
const WORKER_URL = process.argv[2] || 'https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev';
const MESSAGE = process.argv[3] || 'Czym się zajmujecie?';

function generateHMAC(params, body, secret) {
  // Sort params alphabetically
  const sortedKeys = Object.keys(params).sort();
  const parts = sortedKeys.map(k => `${k}=${params[k]}`);
  const message = parts.join('') + body;
  
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(message, 'utf8')
    .digest('hex');
}

async function testStreaming() {
  console.log('Testing Streaming Chat Functionality');
  console.log('=====================================\n');
  
  const shop = 'dev-store.myshopify.com';
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    message: MESSAGE,
    stream: true
  });
  
  const params = {
    shop: shop,
    timestamp: timestamp.toString()
  };
  
  const signature = generateHMAC(params, body, SHOPIFY_APP_SECRET);
  
  const url = `${WORKER_URL}/chat?shop=${shop}&timestamp=${timestamp}&signature=${signature}`;
  
  console.log('Request URL:', url);
  console.log('Request Body:', body);
  console.log('\nStreaming Response:\n---');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body
    });
    
    if (!response.ok) {
      console.error(`HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const contentType = response.headers.get('content-type');
    console.log('Content-Type:', contentType);
    console.log('---\n');
    
    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          
          if (dataStr === '[DONE]') {
            console.log('\n[DONE]\n');
            continue;
          }
          
          try {
            const data = JSON.parse(dataStr);
            
            if (data.session_id && !data.content) {
              console.log(`Session ID: ${data.session_id}\n`);
            } else if (data.content) {
              // Show only final content for cleaner output
              if (data.done) {
                console.log('\nFinal Response:');
                console.log(data.content);
                console.log(`\nSession ID: ${data.session_id}`);
              }
            } else if (data.error) {
              console.error('\nError:', data.error);
            }
          } catch (e) {
            console.log('Raw data:', dataStr);
          }
        } else {
          console.log('Line:', line);
        }
      }
    }
    
    console.log('\n✅ Streaming test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

async function testNonStreaming() {
  console.log('\n\nTesting Non-Streaming (Fallback) Functionality');
  console.log('===============================================\n');
  
  const shop = 'dev-store.myshopify.com';
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    message: MESSAGE,
    stream: false
  });
  
  const params = {
    shop: shop,
    timestamp: timestamp.toString()
  };
  
  const signature = generateHMAC(params, body, SHOPIFY_APP_SECRET);
  
  const url = `${WORKER_URL}/chat?shop=${shop}&timestamp=${timestamp}&signature=${signature}`;
  
  console.log('Request URL:', url);
  console.log('Request Body:', body);
  console.log('\nResponse:\n---');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body
    });
    
    if (!response.ok) {
      console.error(`HTTP Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    console.log('\n✅ Non-streaming test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

// Run tests
(async () => {
  await testStreaming();
  await testNonStreaming();
})();
