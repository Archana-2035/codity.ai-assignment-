import { test, expect } from '@playwright/test';

test('has title and can login', async ({ page }) => {
  // Go to the live deployed frontend
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Distributed Job Scheduler/);

  // Assuming it redirects to /login if not authenticated
  await expect(page).toHaveURL(/.*login/);

  // Fill in login credentials
  await page.locator('input[type="email"]').fill('admin@djs.dev');
  await page.locator('input[type="password"]').fill('Admin@1234');
  
  // Click the sign in button
  await page.getByRole('button', { name: /Sign In/i }).click();

  // Should redirect to dashboard
  await expect(page).toHaveURL('/');
  
  // Verify Dashboard overview renders
  await expect(page.getByText('System Dashboard')).toBeVisible();
  
  // Navigate to Queues page
  await page.getByRole('link', { name: 'Queues' }).click();
  await expect(page).toHaveURL(/.*queues/);
  await expect(page.getByRole('heading', { name: 'Queues' })).toBeVisible();
});
