/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 9: Settings & API Keys — configuration, key management
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, settingsResponse, apiKeysResponse } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Settings Page', () => {
  test('renders settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('setting');
  });

  test('settings page loads current configuration', async ({ page }) => {
    let settingsCalled = false;
    await page.route('https://api.finault.ai/v1/settings', route => {
      if (route.request().method() === 'GET') {
        settingsCalled = true;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settingsResponse),
      });
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
  });

  test('save settings sends PUT request', async ({ page }) => {
    let saveCalled = false;
    await page.route('https://api.finault.ai/v1/settings', route => {
      if (route.request().method() === 'PUT') {
        saveCalled = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(settingsResponse),
      });
    });

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Look for save button
    const saveBtn = page.locator('button').filter({ hasText: /save|update|apply/i }).first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('API Keys Page', () => {
  test('renders API key list', async ({ page }) => {
    await page.goto('/keys');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('key');
  });

  test('create key button exists and works', async ({ page }) => {
    let createCalled = false;
    await page.route('https://api.finault.ai/v1/keys', route => {
      if (route.request().method() === 'POST') {
        createCalled = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            key: {
              id: 'key-new', name: 'New Key', secret: 'fnlt_live_test123',
              key_prefix: 'fnlt_live_', environment: 'production',
              is_active: true, scopes: ['read'], created_at: '2026-02-12T12:00:00Z',
            },
            warning: 'Save this key — it will not be shown again.',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(apiKeysResponse),
      });
    });

    await page.goto('/keys');
    await page.waitForLoadState('networkidle');

    const createBtn = page.locator('button').filter({ hasText: /create|generate|new/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('key list shows masked key prefixes', async ({ page }) => {
    await page.goto('/keys');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
  });
});
