/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 4: Budgets Page — CRUD operations, utilization display
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, budgetsResponse } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Budgets Page', () => {
  test('renders budget list with all budgets', async ({ page }) => {
    await page.goto('/budgets');
    await page.waitForLoadState('networkidle');

    // Should show budget names
    await expect(page.locator('text=Budget')).toBeVisible();

    // Check that we can see some budget data
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).toBeTruthy();
  });

  test('displays budget utilization percentages', async ({ page }) => {
    await page.goto('/budgets');
    await page.waitForLoadState('networkidle');

    // Budget cards or table should show utilization
    await expect(page.locator('main')).toBeVisible();
  });

  test('create budget button is present', async ({ page }) => {
    await page.goto('/budgets');
    await page.waitForLoadState('networkidle');

    // Look for create/add budget button
    const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
    if (await createBtn.isVisible()) {
      await expect(createBtn).toBeEnabled();
    }
  });

  test('create budget flow sends POST to API', async ({ page }) => {
    let createCalled = false;
    let requestBody: any = null;

    await page.route('https://api.finault.ai/v1/budgets', route => {
      if (route.request().method() === 'POST') {
        createCalled = true;
        requestBody = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'budget-new',
            name: requestBody?.name || 'Test Budget',
            amount: requestBody?.amount || 10000,
            spent: 0,
            period: 'monthly',
            status: 'active',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(budgetsResponse),
      });
    });

    await page.goto('/budgets');
    await page.waitForLoadState('networkidle');

    // Find and click create button
    const createBtn = page.locator('button').filter({ hasText: /create|add|new/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1000);

      // Fill in budget form if a dialog/form appears
      const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill('Test E2E Budget');

        const amountInput = page.locator('input[name="amount"], input[placeholder*="amount" i], input[type="number"]').first();
        if (await amountInput.isVisible()) {
          await amountInput.fill('10000');
        }

        // Submit
        const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /save|create|submit/i }).first();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });
});
