import { test, expect } from '@playwright/test'
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  deleteStoresWithTestTag,
  fillDateRange,
  clickSidebarButton,
  completePasswordChange,
  deleteStoreBySlug,
  markStoreTestData,
  login,
  loginAndWaitForAdmin,
  loginAndWaitForPasswordChange,
  requireEnv,
  sidebarBtn,
  getSupabaseConfig,
  supabaseGet,
  getServiceRoleHeaders,
} from './e2e-helpers'

requireEnv('TEST_SUPERADMIN_EMAIL')
requireEnv('TEST_SUPERADMIN_PASSWORD')

type StoreRow = { id: string }

const ts = Date.now()
const STORE_NAME = `직원테스트매장${ts}`
const STORE_SLUG = `staff-test-${ts}`
const OWNER_EMAIL = `staff-owner-${ts}@tableflow.com`
const OWNER_PASSWORD = 'Test1234!@'
const OWNER_NEW_PASSWORD = 'Test5678!@'
const STAFF_EMAIL = `staff-member-${ts}@tableflow.com`
const STAFF_PASSWORD = 'Staff1234!@'
const STAFF_NEW_PASSWORD = 'Staff5678!@'

const today = new Date().toISOString().split('T')[0]
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

test.describe.configure({ mode: 'serial' })

test.describe('직원 관리 E2E (SC-011~SC-013, SC-020)', () => {
  test('1. 슈퍼어드민 — 매장 생성', async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL!, SUPERADMIN_PASSWORD!)
    await expect(page).toHaveURL('/superadmin', { timeout: 10000 })

    await expect(page.getByRole('button', { name: '매장 추가' })).toBeVisible()
    await page.getByRole('button', { name: '매장 추가' }).click()

    await expect(page.getByPlaceholder('예) 맛있는 식당')).toBeVisible()
    await page.getByPlaceholder('예) 맛있는 식당').fill(STORE_NAME)
    await page.getByPlaceholder('예) tasty-restaurant').fill(STORE_SLUG)
    await page.getByPlaceholder('owner@example.com').fill(OWNER_EMAIL)
    await page.getByPlaceholder('8자 이상').fill(OWNER_PASSWORD)
    await fillDateRange(page, today, nextYear)
    await page.getByRole('button', { name: '매장 생성' }).click()

    await expect(page.getByRole('cell', { name: STORE_NAME })).toBeVisible({ timeout: 10000 })
    await markStoreTestData(STORE_SLUG)
  })

  test('2. 점주 첫 로그인 → 비번 변경', async ({ page }) => {
    await loginAndWaitForPasswordChange(page, OWNER_EMAIL, OWNER_PASSWORD)
    await completePasswordChange(page, OWNER_NEW_PASSWORD)
    await expect(page.getByRole('button', { name: '매장 관리' })).toBeVisible()
  })

  test('SC-011: 직원 계정 생성', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /직원/)

    const addBtn = page.locator('button').filter({ hasText: '직원 추가' }).first()
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    await expect(page.getByPlaceholder('홍길동')).toBeVisible()
    await page.getByPlaceholder('홍길동').fill('테스트직원')
    await page.getByPlaceholder('staff@example.com').fill(STAFF_EMAIL)
    await page.getByPlaceholder('특수문자 포함 8자 이상').fill(STAFF_PASSWORD)

    await page.locator('button[type="submit"]').filter({ hasText: '직원 추가' }).click()

    // 성공 토스트 또는 이메일 노출 확인
    await expect(page.locator('body')).toContainText(/직원 계정이 생성됐습니다|생성됐습니다/, { timeout: 15000 })
  })

  test('SC-012: 직원 — 메뉴 관리 탭 접근 불가', async ({ page }) => {
    await login(page, STAFF_EMAIL, STAFF_PASSWORD)
    await page.waitForURL(/\/(admin|change-password)/, { timeout: 10000 })

    if (page.url().includes('change-password')) {
      await completePasswordChange(page, STAFF_NEW_PASSWORD)
    }

    await expect(sidebarBtn(page, /매장 관리/)).toHaveCount(0, { timeout: 5000 })
    await expect(sidebarBtn(page, /메뉴 관리/)).toHaveCount(0, { timeout: 5000 })
  })

  test('SC-013: 직원 — 매장 설정 접근 불가', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#email', STAFF_EMAIL)

    const passwords = [STAFF_PASSWORD, STAFF_NEW_PASSWORD]
    let loggedIn = false
    for (const pw of passwords) {
      await page.fill('#password', pw)
      await page.getByRole('button', { name: '로그인' }).click()
      // Wait for navigation to a success URL; timeout means wrong password
      try {
        await page.waitForURL(/\/(admin|change-password)/, { timeout: 8000 })
        if (page.url().includes('/change-password')) {
          await completePasswordChange(page, STAFF_NEW_PASSWORD)
        }
        loggedIn = true
        break
      } catch {
        // Still on /login — wrong password, try next
      }
    }

    expect(loggedIn, '직원 계정으로 로그인해야 SC-013을 진행할 수 있습니다.').toBeTruthy()
    await expect(sidebarBtn(page, /설정|직원 관리/)).toHaveCount(0, { timeout: 5000 })
    await expect(page.locator('body')).toContainText('직원', { ignoreCase: true })
  })

  test('SC-032: 직원 계정 비활성화 (삭제)', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /직원/)

    // 직원 관리 화면 로딩 대기
    await expect(page.locator('body')).toContainText('직원 관리', { timeout: 10000 })
    await expect(page.locator('body')).toContainText('활성', { timeout: 8000 })

    // Trash2 삭제 버튼은 <td> 안에 있음 — 테이블 셀 내의 버튼만 찾기
    const deleteBtn = page.locator('td button').first()
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })

    // confirm 다이얼로그 자동 수락
    page.once('dialog', (dialog) => dialog.accept())
    await deleteBtn.click()

    // 삭제 성공 toast 확인
    await expect(page.locator('body')).toContainText('직원이 삭제됐습니다', { timeout: 8000 })
  })

  test('SC-029: 인증된 점주 / 접근 → /admin 리다이렉트', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    // 미들웨어: 인증된 점주가 / 접근 시 /admin 으로 리다이렉트
    await page.goto('/')
    await expect(page).toHaveURL('/admin', { timeout: 10000 })
  })

  test('SC-002: 점주 — /superadmin 접근 차단', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.goto('/superadmin')
    await page.waitForLoadState('networkidle')
    // SuperAdminRoute must never render superadmin UI for a store owner.
    // Check both the action button and the store table — two independent superadmin indicators.
    await expect(page.locator('button').filter({ hasText: '매장 추가' })).toHaveCount(0, { timeout: 5000 })
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('SC-005/006: 비로그인 — 보호 경로 접근 차단', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL('/login', { timeout: 5000 })

    await page.goto('/change-password')
    await expect(page).toHaveURL('/login', { timeout: 5000 })
  })

  test('SC-028: 매장 설정에서 비밀번호 변경', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /설정/)  // desktop: '매장 설정', mobile nav: '설정'

    // 비밀번호 변경 카드 확인
    await expect(page.locator('body')).toContainText('비밀번호 변경', { timeout: 8000 })

    // 새 비밀번호 입력
    await page.locator('input[type="password"]').nth(0).fill('NewPass1234!@')
    await page.locator('input[type="password"]').nth(1).fill('NewPass1234!@')

    // 변경 버튼 클릭
    await page.locator('button[type="submit"]').filter({ hasText: '비밀번호 변경' }).click()

    // 성공 toast 확인
    await expect(page.locator('body')).toContainText('비밀번호가 변경되었습니다', { timeout: 8000 })
  })

  // ────────────────────────────────────────────────────────────────
  // SB-002~005: 구독 체크 fail-closed
  // ────────────────────────────────────────────────────────────────

  test('SB-002: 만료 매장 관리자 접근 차단', async ({ page, browser }) => {
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정 — service role로 stores PATCH 불가')

    const { url: supabaseUrl } = getSupabaseConfig()
    const headers = { ...serviceHeaders!, Prefer: 'return=representation' }

    // 스토어 ID 조회 (서비스 롤로 직접 조회)
    const storeRes = await fetch(
      `${supabaseUrl}/rest/v1/stores?select=id&slug=eq.${encodeURIComponent(STORE_SLUG)}&limit=1`,
      { headers }
    )
    const storeRows: StoreRow[] = await storeRes.json()
    if (storeRows.length === 0) throw new Error(`Store with slug ${STORE_SLUG} not found`)
    const currentStoreId = storeRows[0].id

    // 매장을 만료 상태로 변경 (service role)
    const expiredDate = '2020-01-01'
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/stores?id=eq.${currentStoreId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ subscription_end: expiredDate }),
    })
    expect(patchRes.ok, `PATCH 실패: ${patchRes.status}`).toBeTruthy()

    try {
      // SC-028에서 비밀번호가 NewPass1234!@로 변경됨
      const currentPassword = 'NewPass1234!@'
      const freshCtx = await browser.newContext()
      const freshPage = await freshCtx.newPage()
      await login(freshPage, OWNER_EMAIL, currentPassword)
      await freshPage.waitForURL('/admin', { timeout: 15000 })
      await freshPage.waitForLoadState('networkidle')

      // 만료 안내 표시 확인
      const bodyText = await freshPage.locator('body').innerText()
      expect(bodyText).toMatch(/만료|이용 기간|기간이 만료/)
      await freshCtx.close()
    } finally {
      // 복구: subscription_end를 미래 날짜로 원복
      await fetch(`${supabaseUrl}/rest/v1/stores?id=eq.${currentStoreId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ subscription_end: nextYear }),
      })
    }
  })

  test('SB-003: 강제 정지 매장 관리자 차단', async ({ page }) => {
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정 — service role로 stores PATCH 불가')

    const { url: supabaseUrl } = getSupabaseConfig()
    const headers = { ...serviceHeaders!, Prefer: 'return=representation' }

    // 매장 ID 조회 (SB-002 이후 DB 전파 대기)
    let storeRows: StoreRow[] = []
    for (let attempt = 0; attempt < 3; attempt++) {
      const lookupRes = await fetch(
        `${supabaseUrl}/rest/v1/stores?select=id&slug=eq.${encodeURIComponent(STORE_SLUG)}&limit=1`,
        { headers }
      )
      storeRows = await lookupRes.json() as StoreRow[]
      if (storeRows.length > 0) break
      await new Promise(r => setTimeout(r, 1000))
    }
    expect(storeRows.length).toBeGreaterThan(0)
    const storeId = storeRows[0].id

    // 매장을 is_active = false로 변경
    await fetch(`${supabaseUrl}/rest/v1/stores?id=eq.${storeId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        is_active: false,
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      })
    })

    try {
      // SC-028에서 비밀번호가 NewPass1234!@로 변경됨
      const currentPassword = 'NewPass1234!@'
      await page.goto('/login')
      await page.fill('#email', OWNER_EMAIL)
      await page.fill('#password', currentPassword)
      await page.getByRole('button', { name: '로그인' }).click()

      await page.waitForLoadState('networkidle')

      // 차단 화면 표시 확인
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).toMatch(/정지|이용 불가|차단|비활성/)
    } finally {
      // 복구: is_active를 true로 원복
      await fetch(`${supabaseUrl}/rest/v1/stores?id=eq.${storeId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_active: true })
      })
    }
  })

  test.fixme('SB-004: 구독 체크 실패 + 캐시 없음 시 차단', async ({ page }) => {
    // TODO: Implement using page.route() network interception.
    // Steps:
    //   1. loginAndWaitForAdmin to establish session
    //   2. Clear any subscription cache from localStorage
    //   3. page.route('**/rest/v1/stores*', route => route.abort('connectionreset'))
    //   4. page.reload() to trigger a fresh checkStoreActive call with no cache
    //   5. Verify the page shows a blocked/error state (body matches /정지|이용 불가|차단|비활성|오류/)
  })

  test.fixme('SB-005: 구독 체크 실패 + 활성 캐시 있음 시 진입 유지', async ({ page }) => {
    // TODO: Implement cache-fallback verification.
    // Steps:
    //   1. loginAndWaitForAdmin to populate a real session and subscription cache
    //   2. Intercept stores API: page.route('**/rest/v1/stores*', route => route.abort('connectionreset'))
    //   3. page.reload() — checkStoreActive will fail but valid cache should allow entry
    //   4. Verify admin content still visible: expect(page.locator('body')).toContainText(/주문|메뉴|매장/)
    // Note: depends on knowing the exact localStorage key used by checkStoreActive.
  })

  test.afterAll(async () => {
    await deleteStoresWithTestTag()
    await deleteStoreBySlug(STORE_SLUG)
  })
})
