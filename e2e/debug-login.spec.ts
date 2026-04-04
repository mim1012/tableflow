import { test } from '@playwright/test'

test.skip('check CSS and superadmin', async ({ page }) => {
  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('requestfailed', req => errors.push(`FETCH_FAIL: ${req.url()} ${req.failure()?.errorText}`))

  await page.goto('http://localhost:3000/login')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'e2e-recordings/debug-login.png' })

  await page.fill('input[type="email"]', 'dksk0359@gmail.com')
  await page.fill('input[type="password"]', 'TestAdmin1234!')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/superadmin**', { timeout: 15000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'e2e-recordings/debug-superadmin.png' })

  console.log('=== URL ===', page.url())
  console.log('=== ERRORS ===')
  for (const e of errors) console.log(e)
})
