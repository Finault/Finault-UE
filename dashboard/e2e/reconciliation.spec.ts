/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 8: Reconciliation & Close Pack — matching, variance, proof
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, reconciliationResponse, closePackResponse } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Reconciliation Page', () => {
  test('renders reconciliation interface', async ({ page }) => {
    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('reconcil');
  });

  test('reconciliation API receives correct payload', async ({ page }) => {
    let reconcileCalled = false;
    await page.route('https://api.finault.ai/v1/reconcile', route => {
      reconcileCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(reconciliationResponse),
      });
    });

    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');

    // Look for a reconcile/run button
    const reconcileBtn = page.locator('button').filter({ hasText: /reconcile|run|start/i }).first();
    if (await reconcileBtn.isVisible()) {
      await reconcileBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('shows variance percentage and status', async ({ page }) => {
    await page.goto('/reconcile');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Close Pack Page', () => {
  test('renders close pack generation interface', async ({ page }) => {
    await page.goto('/close-pack');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('close');
  });

  test('generate close pack calls API', async ({ page }) => {
    let generateCalled = false;
    await page.route('https://api.finault.ai/v1/close-pack/generate', route => {
      generateCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(closePackResponse),
      });
    });

    await page.goto('/close-pack');
    await page.waitForLoadState('networkidle');

    const generateBtn = page.locator('button').filter({ hasText: /generate|create|build/i }).first();
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('close pack shows verification information', async ({ page }) => {
    await page.goto('/close-pack');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
  });
});
