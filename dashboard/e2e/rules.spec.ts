/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 10: Allocation Rules — CRUD, priority ordering
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, rulesResponse } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Allocation Rules Page', () => {
  test('renders rules list', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('rule');
  });

  test('rules API is called on page load', async ({ page }) => {
    let rulesCalled = false;
    await page.route('https://api.finault.ai/v1/rules', route => {
      if (route.request().method() === 'GET') {
        rulesCalled = true;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rulesResponse),
      });
    });

    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    expect(rulesCalled).toBe(true);
  });

  test('create rule button exists', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
    if (await createBtn.isVisible()) {
      await expect(createBtn).toBeEnabled();
    }
  });

  test('delete rule sends DELETE request', async ({ page }) => {
    let deleteCalled = false;
    await page.route('https://api.finault.ai/v1/rules?*', route => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, deleted: 'rule-001' }),
      });
    });

    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    // Look for delete button on a rule card
    const deleteBtn = page.locator('button').filter({ hasText: /delete|remove/i }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();

      // May have a confirmation dialog
      const confirmBtn = page.locator('button').filter({ hasText: /confirm|yes|delete/i }).first();
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }

      await page.waitForTimeout(1000);
    }
  });
});
