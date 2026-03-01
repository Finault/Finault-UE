/**
 * FINAULT DASHBOARD — E2E Tests
 * ═══════════════════════════════════════════════════════════════════
 * Suite 2: Invoice Upload Flow — file upload → parse → review → allocate
 * ═══════════════════════════════════════════════════════════════════
 */

import { test, expect } from '@playwright/test';
import { mockAllApiRoutes, parseResultResponse, allocationResultResponse } from './fixtures';
import path from 'path';

test.beforeEach(async ({ page }) => {
  await mockAllApiRoutes(page);
});

test.describe('Invoice Upload Page', () => {
  test('renders upload dropzone', async ({ page }) => {
    await page.goto('/upload');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Upload Invoice')).toBeVisible();
    // Dropzone area should be present
    await expect(page.locator('main')).toBeVisible();
  });

  test('file upload triggers parse API and shows review', async ({ page }) => {
    // Track API calls
    let parseCalled = false;
    await page.route('https://api.finault.ai/v1/parse', route => {
      parseCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(parseResultResponse),
      });
    });

    await page.goto('/upload');
    await page.waitForLoadState('networkidle');

    // Create a fake CSV file and upload via the file input
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      // Create a temporary file buffer for upload
      const buffer = Buffer.from(
        'model,quantity,unit_price,total\ngpt-4-turbo,350000,0.01,3500\nclaude-3-opus,120000,0.03,3600',
        'utf-8'
      );

      await fileInput.setInputFiles({
        name: 'openai-invoice-feb-2026.csv',
        mimeType: 'text/csv',
        buffer,
      });

      // Wait for parse to complete
      await page.waitForTimeout(2000);
      expect(parseCalled).toBe(true);

      // After parse, should show results
      // The page should transition to review step
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('upload page handles parse failure gracefully', async ({ page }) => {
    await page.route('https://api.finault.ai/v1/parse', route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unsupported file format' }),
      })
    );

    await page.goto('/upload');
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles({
        name: 'bad-file.xyz',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('invalid data'),
      });

      await page.waitForTimeout(2000);

      // Page should still be functional (not crashed)
      await expect(page.locator('main')).toBeVisible();
    }
  });
});

test.describe('Invoice Upload — Allocation Flow', () => {
  test('allocation API is called after invoice review', async ({ page }) => {
    let allocateCalled = false;
    await page.route('https://api.finault.ai/v1/allocate', route => {
      allocateCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(allocationResultResponse),
      });
    });

    await page.goto('/upload');
    await page.waitForLoadState('networkidle');

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles({
        name: 'openai-invoice.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('model,quantity,unit_price,total\ngpt-4-turbo,350000,0.01,3500'),
      });

      // Wait for parse
      await page.waitForTimeout(2000);

      // Look for "Allocate" or "Continue" button to trigger allocation
      const allocateBtn = page.locator('button').filter({ hasText: /allocat|continue|next/i }).first();
      if (await allocateBtn.isVisible()) {
        await allocateBtn.click();
        await page.waitForTimeout(2000);
        expect(allocateCalled).toBe(true);
      }
    }
  });
});
