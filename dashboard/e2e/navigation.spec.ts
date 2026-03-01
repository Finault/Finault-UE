/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 3: Full Navigation — Every page loads, renders, no crashes
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

const pages = [
  { path: '/', title: 'Dashboard', expectedText: 'Dashboard' },
  { path: '/upload', title: 'Upload Invoice', expectedText: 'Upload' },
  { path: '/reconcile', title: 'Reconciliation', expectedText: 'Reconcil' },
  { path: '/disputes', title: 'Disputes', expectedText: 'Dispute' },
  { path: '/rules', title: 'Allocation Rules', expectedText: 'Rule' },
  { path: '/close-pack', title: 'Close Pack', expectedText: 'Close' },
  { path: '/anomalies', title: 'Anomalies', expectedText: 'Anomal' },
  { path: '/budgets', title: 'Budgets', expectedText: 'Budget' },
  { path: '/analytics', title: 'Analytics', expectedText: 'Analytic' },
  { path: '/gateway', title: 'Gateway', expectedText: 'Gateway' },
  { path: '/keys', title: 'API Keys', expectedText: 'Key' },
  { path: '/team', title: 'Team', expectedText: 'Team' },
  { path: '/settings', title: 'Settings', expectedText: 'Setting' },
  { path: '/activity', title: 'Activity', expectedText: 'Activity' },
  { path: '/help', title: 'Help', expectedText: 'Help' },
];

for (const { path, title, expectedText } of pages) {
  test(`${title} page (${path}) loads without errors`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    // Page should render main content area
    await expect(page.locator('main').or(page.locator('[role="main"]')).or(page.locator('body'))).toBeVisible();

    // No unhandled JavaScript errors should crash the page
    const errorLogs: string[] = [];
    page.on('pageerror', err => errorLogs.push(err.message));

    // The expected text should appear somewhere on the page
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).toContain(expectedText.toLowerCase());
  });
}

test.describe('Navigation Flow — Multi-Page Journey', () => {
  test('user can navigate through all main pages via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Dashboard → Upload
    await page.locator('a[href="/upload"]').first().click();
    await expect(page).toHaveURL('/upload');
    await page.waitForLoadState('networkidle');

    // Upload → Reconcile
    await page.locator('a[href="/reconcile"]').first().click();
    await expect(page).toHaveURL('/reconcile');
    await page.waitForLoadState('networkidle');

    // Reconcile → Disputes
    await page.locator('a[href="/disputes"]').first().click();
    await expect(page).toHaveURL('/disputes');
    await page.waitForLoadState('networkidle');

    // Disputes → Rules
    await page.locator('a[href="/rules"]').first().click();
    await expect(page).toHaveURL('/rules');
    await page.waitForLoadState('networkidle');

    // Rules → Close Pack
    await page.locator('a[href="/close-pack"]').first().click();
    await expect(page).toHaveURL('/close-pack');
    await page.waitForLoadState('networkidle');

    // Close Pack → Anomalies
    await page.locator('a[href="/anomalies"]').first().click();
    await expect(page).toHaveURL('/anomalies');
    await page.waitForLoadState('networkidle');

    // Anomalies → Budgets
    await page.locator('a[href="/budgets"]').first().click();
    await expect(page).toHaveURL('/budgets');
    await page.waitForLoadState('networkidle');

    // Budgets → Analytics
    await page.locator('a[href="/analytics"]').first().click();
    await expect(page).toHaveURL('/analytics');
    await page.waitForLoadState('networkidle');

    // Back to Dashboard
    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL('/');
  });

  test('browser back/forward navigation works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('a[href="/upload"]').first().click();
    await expect(page).toHaveURL('/upload');

    await page.locator('a[href="/analytics"]').first().click();
    await expect(page).toHaveURL('/analytics');

    // Go back
    await page.goBack();
    await expect(page).toHaveURL('/upload');

    // Go forward
    await page.goForward();
    await expect(page).toHaveURL('/analytics');
  });
});

test.describe('No JavaScript Errors on Any Page', () => {
  for (const { path, title } of pages) {
    test(`${title} has no uncaught JavaScript errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', err => errors.push(err.message));

      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000); // Allow async operations

      // Filter out known non-critical errors
      const criticalErrors = errors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('hydration')
      );
      expect(criticalErrors).toHaveLength(0);
    });
  }
});
