import { test, expect } from '@playwright/test';

test('hello world test', async ({ page }) => {
    await page.goto('http://localhost:3000'); // Replace with your application's URL
    const title = await page.title();
    expect(title).toBe('Expected Title'); // Replace with the expected title of your application
});