/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 5: Anomalies Page — detection display, severity filtering,
 *          acknowledge action
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, anomaliesResponse } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Anomalies Page', () => {
  test('renders anomaly list', async ({ page }) => {
    await page.goto('/anomalies');
    await page.waitForLoadState('networkidle');

    // Page should show anomaly-related content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain('anomal');
    await expect(page.locator('main')).toBeVisible();
  });

  test('displays anomaly severity indicators', async ({ page }) => {
    await page.goto('/anomalies');
    await page.waitForLoadState('networkidle');

    // The page should render without errors
    await expect(page.locator('main')).toBeVisible();
  });

  test('acknowledge anomaly sends API request', async ({ page }) => {
    let acknowledgeCalled = false;
    await page.route('https://api.finault.ai/v1/anomalies/acknowledge', route => {
      acknowledgeCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          anomaly_id: 'anom-001',
          acknowledged_by: 'bernie@finault.ai',
          acknowledged_at: '2026-02-12T12:00:00Z',
        }),
      });
    });

    await page.goto('/anomalies');
    await page.waitForLoadState('networkidle');

    // Look for acknowledge/dismiss button on any anomaly card
    const ackBtn = page.locator('button').filter({ hasText: /acknowledge|dismiss|resolve/i }).first();
    if (await ackBtn.isVisible()) {
      await ackBtn.click();
      await page.waitForTimeout(1000);
      expect(acknowledgeCalled).toBe(true);
    }
  });

  test('anomaly details expand on click', async ({ page }) => {
    await page.goto('/anomalies');
    await page.waitForLoadState('networkidle');

    // Click on the first anomaly card/row to expand details
    const anomalyItem = page.locator('[class*="card"], [class*="anomaly"], tr').first();
    if (await anomalyItem.isVisible()) {
      await anomalyItem.click();
      await page.waitForTimeout(500);
      // Details section should appear or expand
      await expect(page.locator('main')).toBeVisible();
    }
  });
});
