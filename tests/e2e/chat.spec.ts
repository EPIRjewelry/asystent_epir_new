import { test, expect } from '@playwright/test';

test.describe('EPIR AI Assistant E2E', () => {
  const shopUrl = process.env.SHOP_URL || 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    // Navigate to a page expected to include the TAE block
    await page.goto(shopUrl);
    // Ensure assistant script loaded
    await expect(page.locator('#epir-assistant-section')).toBeVisible();
  });

  test('Basic chat flow - creates user and assistant messages and finalizes', async ({ page }) => {
    const input = page.locator('#assistant-input');
    const send = page.locator('#assistant-send-button');

    await input.fill('Poleć pierścionek');
    await send.click();

    // Expect user message to appear
    await expect(page.locator('.msg.msg-user', { hasText: 'Poleć pierścionek' })).toBeVisible({ timeout: 5000 });

    // Simulate SSE chunks: the page's assistant.js should process them; wait for assistant reply
    await expect(page.locator('.msg.msg-assistant')).toBeVisible({ timeout: 10000 });

    // final assertion: assistant message contains Polish text
    await expect(page.locator('.msg.msg-assistant')).toContainText(/EPIR|jubiler|pierścionek|polec/i);
  });

  test('Streaming SSE tokens arrive and are appended incrementally', async ({ page }) => {
    // Intercept EventSource or fetch where SSE is established to simulate token streaming
    await page.addInitScript(() => {
      // Override EventSource to feed tokens
      const OriginalEventSource = (window as any).EventSource;
      (window as any).EventSource = function (url: string) {
        const es = new OriginalEventSource(url);
        setTimeout(() => {
          es.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ delta: 'EPIR ' }) }));
        }, 100);
        setTimeout(() => {
          es.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ delta: 'jubilerka' }) }));
        }, 300);
        setTimeout(() => {
          es.dispatchEvent(new MessageEvent('message', { data: '[DONE]' }));
        }, 600);
        return es;
      } as any;
    });

    const input = page.locator('#assistant-input');
    const send = page.locator('#assistant-send-button');
    await input.fill('Opowiedz o EPIR');
    await send.click();

    // Check that incremental tokens appear in assistant message
    await expect(page.locator('.msg.msg-assistant')).toContainText('EPIR', { timeout: 2000 });
    await expect(page.locator('.msg.msg-assistant')).toContainText('jubilerka', { timeout: 4000 });
  });

  test('HMAC 401 handling - shows error message', async ({ page }) => {
    // Mock fetch for /apps/epir-assistant/chat to return 401
    await page.route('**/apps/epir-assistant/chat', (route) => {
      route.fulfill({ status: 401, body: 'Unauthorized' });
    });

    await page.fill('#assistant-input', 'Test HMAC');
    await page.click('#assistant-send-button');

    await expect(page.locator('.assistant-status')).toContainText(/Unauthorized|błąd|Przepraszam/i, { timeout: 5000 });
  });

  test('Session persistence and end → conversation saved to DB (simulated)', async ({ page }) => {
    // Simulate DO history and D1 save by stubbing the DO endpoints
    await page.route('https://session/append', (r) => r.fulfill({ status: 200, body: 'ok' }));
    await page.route('https://session/history', (r) => r.fulfill({ status: 200, body: '[]' }));

    await page.fill('#assistant-input', 'Historia test');
    await page.click('#assistant-send-button');

    await expect(page.locator('.msg.msg-user')).toHaveCount(1, { timeout: 3000 });
  });
});
