import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'

// .env 자동 로드 (dotenv 없이 Node 네이티브)
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key && !(key in process.env)) process.env[key] = val
  }
} catch { /* .env 없으면 무시 */ }

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const shouldStartLocalWebServer = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseURL)

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  workers: 2,
  retries: 1,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', {
      outputFolder: 'test-reports/html',
      open: 'never',
    }],
    ['json', {
      outputFile: 'test-reports/results.json',
    }],
  ],
  projects: [
    // Desktop — all admin/staff/security specs
    {
      name: 'desktop',
      testMatch: /.*\.spec\.ts/,
    },
    // iPhone 14 Pro (2022) — 393x852
    {
      name: 'iphone-14',
      use: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true },
      testMatch: ['**/order-detail.spec.ts', '**/order-gaps.spec.ts', '**/waiting.spec.ts'],
    },
    // iPhone 15/16 Pro Max (2023-2024) — 430x932
    {
      name: 'iphone-16-max',
      use: { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
      testMatch: ['**/order-detail.spec.ts', '**/order-gaps.spec.ts', '**/waiting.spec.ts'],
    },
    // Samsung Galaxy S23/S24 (2023-2024) — 360x780
    {
      name: 'galaxy-s24',
      use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true },
      testMatch: ['**/order-detail.spec.ts', '**/order-gaps.spec.ts', '**/waiting.spec.ts'],
    },
    // Samsung Galaxy Z Fold (2023-2025) — 344x882 (folded outer)
    {
      name: 'galaxy-fold',
      use: { viewport: { width: 344, height: 882 }, isMobile: true, hasTouch: true },
      testMatch: ['**/order-detail.spec.ts', '**/order-gaps.spec.ts', '**/waiting.spec.ts'],
    },
    // iPad / Tablet (staff POS use) — 810x1080
    {
      name: 'tablet-staff',
      use: { viewport: { width: 810, height: 1080 }, isMobile: false, hasTouch: true },
      testMatch: ['**/order-flow.spec.ts', '**/staff.spec.ts'],
    },
  ],
  webServer: shouldStartLocalWebServer
    ? {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      }
    : undefined,
})
