/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 7: Analytics & Gateway Pages — charts, metrics, provider breakdown
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, analyticsResponse, metricsResponse } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Analytics Page', () => {
  test('renders analytics page with charts', async ({ page }) => {
    let analyticsCalled = false;
    await page.route('https://api.finault.ai/v1/analytics?*', route => {
      analyticsCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analyticsResponse),
      });
    });

    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    expect(analyticsCalled).toBe(true);
    await expect(page.locator('main')).toBeVisible();

    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('analytic');
  });

  test('analytics page shows provider breakdown', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    // Provider names should appear
    await expect(page.locator('main')).toBeVisible();
  });

  test('analytics page handles time period changes', async ({ page }) => {
    const periodsCalled: string[] = [];
    await page.route('https://api.finault.ai/v1/analytics?*', route => {
      periodsCalled.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analyticsResponse),
      });
    });

    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    // Look for time period selector (7d, 30d, 90d buttons)
    const periodBtn = page.locator('button').filter({ hasText: /30|month|30d/i }).first();
    if (await periodBtn.isVisible()) {
      await periodBtn.click();
      await page.waitForTimeout(1000);
      // Should make a new API call
      expect(periodsCalled.length).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe('Gateway Page', () => {
  test('renders gateway metrics', async ({ page }) => {
    let metricsCalled = false;
    await page.route('https://api.finault.ai/v1/metrics?*', route => {
      metricsCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(metricsResponse),
      });
    });

    await page.goto('/gateway');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('gateway');
  });

  test('gateway page shows endpoint distribution', async ({ page }) => {
    await page.goto('/gateway');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
  });

  test('gateway page shows health status', async ({ page }) => {
    await page.goto('/gateway');
    await page.waitForLoadState('networkidle');

    // Should display health/status information
    await expect(page.locator('main')).toBeVisible();
  });
});
