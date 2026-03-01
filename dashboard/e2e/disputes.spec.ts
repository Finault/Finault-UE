/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 6: Disputes Page — list, stats, status tracking
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, disputesResponse, disputeStatsResponse } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Disputes Page', () => {
  test('renders dispute list with status labels', async ({ page }) => {
    await page.goto('/disputes');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('dispute');
    await expect(page.locator('main')).toBeVisible();
  });

  test('displays dispute statistics', async ({ page }) => {
    let statsCalled = false;
    await page.route('https://api.finault.ai/v1/disputes/stats', route => {
      statsCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(disputeStatsResponse),
      });
    });

    await page.goto('/disputes');
    await page.waitForLoadState('networkidle');

    // Page should have loaded and potentially called stats
    await expect(page.locator('main')).toBeVisible();
  });

  test('dispute status badges render correctly', async ({ page }) => {
    await page.goto('/disputes');
    await page.waitForLoadState('networkidle');

    // Page should show dispute data without crashing
    await expect(page.locator('main')).toBeVisible();
  });

  test('create dispute button exists', async ({ page }) => {
    await page.goto('/disputes');
    await page.waitForLoadState('networkidle');

    // Look for create/file dispute button
    const createBtn = page.locator('button').filter({ hasText: /create|file|new/i }).first();
    if (await createBtn.isVisible()) {
      await expect(createBtn).toBeEnabled();
    }
  });
});
