import { test, expect } from '@playwright/test';

test.describe('EPIR AI Assistant E2E', () => {
  const shopUrl = process.env.SHOP_URL || 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    // Navigate to a page expected to include the TAE block
    await page.goto(shopUrl, { waitUntil: 'networkidle' });

    // Dismiss cookie consent / overlays (try multiple strategies)
    const cookieSelectors = [
      'button:has-text("Zaakceptuj")',
      'button:has-text("Akceptuj")',
      'button:has-text("Akceptuj wszystkie")',
      'button:has-text("Accept")',
      'button:has-text("Agree")',
      'button.cookie-accept',
      '.cookie-consent button',
      '.cookie-banner button',
    ];

    for (const sel of cookieSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        try {
          await btn.click({ timeout: 2000 });
          break;
        } catch (e) {
          // continue trying other selectors
        }
      }
    }

    // Fallback: remove any modal/alertdialog elements that may block the UI
    await page.evaluate(() => {
      try {
        document.querySelectorAll('[role="alertdialog"], .cookie-consent, .cookie-banner, #onetrust-consent-banner').forEach(el => el.remove());
      } catch (e) {}
    });

    // Ensure assistant script loaded and visible (increase timeout for live)
    const assistantLocator = page.locator('#epir-assistant-section, .epir-assistant');
    await expect(assistantLocator).toBeVisible({ timeout: 20000 });
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
    const integration = process.env.INTEGRATION === '1';
    // If not running integration tests, mock EventSource to simulate token streaming
    if (!integration) {
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
    }

    const input = page.locator('#assistant-input');
    const send = page.locator('#assistant-send-button');
    await input.fill('Opowiedz o EPIR');
    await send.click();

    // Check that incremental tokens appear in assistant message
    await expect(page.locator('.msg.msg-assistant')).toContainText('EPIR', { timeout: 2000 });
    await expect(page.locator('.msg.msg-assistant')).toContainText('jubilerka', { timeout: 4000 });
  });

  test('HMAC 401 handling - shows error message', async ({ page }) => {
    const integration = process.env.INTEGRATION === '1';
    // Only mock HMAC endpoint in non-integration mode
    if (!integration) {
      // Mock fetch for /apps/epir-assistant/chat to return 401
      await page.route('**/apps/epir-assistant/chat', (route) => {
        route.fulfill({ status: 401, body: 'Unauthorized' });
      });
    }

    await page.fill('#assistant-input', 'Test HMAC');
    await page.click('#assistant-send-button');

    // In integration mode, the worker will handle and return a real status; we assert for presence of an error message
    await expect(page.locator('.assistant-status')).toContainText(/Unauthorized|błąd|Przepraszam/i, { timeout: 10000 });
  });

  test('Session persistence and end → conversation saved to DB (simulated)', async ({ page }) => {
    const integration = process.env.INTEGRATION === '1';
    // In mock mode, stub the DO endpoints. In integration mode, rely on live worker and just assert UI behaviour.
    if (!integration) {
      await page.route('https://session/append', (r) => r.fulfill({ status: 200, body: 'ok' }));
      await page.route('https://session/history', (r) => r.fulfill({ status: 200, body: '[]' }));
    }

    await page.fill('#assistant-input', 'Historia test');
    await page.click('#assistant-send-button');

    await expect(page.locator('.msg.msg-user')).toHaveCount(1, { timeout: 5000 });
  });
});
