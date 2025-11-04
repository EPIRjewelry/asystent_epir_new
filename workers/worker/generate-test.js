const crypto = require('crypto');

const secret = '8afcc53512826bc6677fde490b1ca99e';
const shop = 'dev-store.myshopify.com';
const ts = Math.floor(Date.now() / 1000);

// Build message (sorted keys)
const message = `shop=${shop}timestamp=${ts}`;

// Compute HMAC
const sig = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
  .update(message, 'utf8')
  .digest('hex');

console.log(`Timestamp: ${ts}`);
console.log(`Message: ${message}`);
console.log(`Signature: ${sig}`);
console.log('');
console.log('Non-streaming test:');
console.log(`curl.exe -i -X POST "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/chat?shop=${shop}&timestamp=${ts}&signature=${sig}" -H "Content-Type: application/json" --data-raw "{\\"message\\":\\"Czym się zajmujecie?\\",\\"stream\\":false}"`);
console.log('');
console.log('Streaming test:');
console.log(`curl.exe -N -X POST "https://epir-art-jewellery-worker.krzysztofdzugaj.workers.dev/chat?shop=${shop}&timestamp=${ts}&signature=${sig}" -H "Content-Type: application/json" --data-raw "{\\"message\\":\\"Opowiedz o jubilerstwie\\",\\"stream\\":true}"`);
