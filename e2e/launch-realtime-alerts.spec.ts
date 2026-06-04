import { test, expect } from '@playwright/test'
import { clickSidebarButton, loginAndWaitForAdmin, waitForAdminShell } from './e2e-helpers'

const OWNER_EMAIL = process.env.LAUNCH_TEST_OWNER_EMAIL
const OWNER_PASSWORD = process.env.LAUNCH_TEST_OWNER_PASSWORD
const STORE_SLUG = process.env.LAUNCH_TEST_STORE_SLUG

const hasLaunchEnv = Boolean(OWNER_EMAIL && OWNER_PASSWORD && STORE_SLUG)

test.describe('런칭 실시간 알림 smoke', () => {
  test.skip(!hasLaunchEnv, 'LAUNCH_TEST_OWNER_EMAIL/PASSWORD/STORE_SLUG 미설정')

  test('KDS 단독 진입 시 운영 알림 상태가 표시된다', async ({ page }) => {
    await page.addInitScript(() => {
      class MockNotification {
        static permission: NotificationPermission = 'granted'
        static requestPermission = () => Promise.resolve('granted' as NotificationPermission)
      }

      Object.defineProperty(window, 'Notification', {
        value: MockNotification,
        configurable: true,
        writable: true,
      })
    })

    await loginAndWaitForAdmin(page, OWNER_EMAIL!, OWNER_PASSWORD!)
    await page.goto('/admin/kds')

    await expect(page.locator('body')).toContainText(/KDS|신규|조리/, { timeout: 15000 })
    await expect(page.getByLabel(/운영 알림 상태:/)).toBeVisible({ timeout: 10000 })
  })

  test('웨이팅 QR 등록이 관리자 웨이팅 패널에 실시간 표시된다', async ({ browser }) => {
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await loginAndWaitForAdmin(adminPage, OWNER_EMAIL!, OWNER_PASSWORD!)
    await waitForAdminShell(adminPage)
    await clickSidebarButton(adminPage, /웨이팅/)
    await expect(adminPage.getByRole('heading', { name: '웨이팅 관리' })).toBeVisible({ timeout: 10000 })

    const customerContext = await browser.newContext()
    const customerPage = await customerContext.newPage()
    await customerPage.goto(`/waiting/${STORE_SLUG}`, { waitUntil: 'domcontentloaded' })
    await expect(customerPage.getByRole('heading', { name: /연락받을 휴대폰 번호를 입력해 주세요/ })).toBeVisible({ timeout: 15000 })

    for (const digit of ['9', '8', '7', '6', '5', '4', '3', '2']) {
      await customerPage.locator(`button:has-text("${digit}")`).first().click()
    }

    await customerPage.getByRole('button', { name: '다음', exact: true }).click()
    await customerPage.getByRole('button', { name: '대기 등록 완료하기' }).click()
    await expect(customerPage.getByRole('heading', { name: /대기 등록이 완료되었습니다!/ })).toBeVisible({ timeout: 15000 })

    await expect(adminPage.locator('body')).toContainText(/새 대기 등록|9876|대기/, { timeout: 15000 })

    await adminContext.close()
    await customerContext.close()
  })
})
