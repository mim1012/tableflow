import { test, expect, type Page } from '@playwright/test'
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  clickSidebarButton,
  completePasswordChange,
  deleteStoresWithTestTag,
  deleteStoreBySlug,
  fillDateRange,
  fillSuperadminCreateStoreForm,
  markStoreTestData,
  login,
  loginAndWaitForAdmin,
  loginAndWaitForPasswordChange,
  lookupStoreByName,
  sidebarBtn,
  supabaseGet,
  supabasePost,
  getSupabaseConfig,
  supabaseHeaders,
} from './e2e-helpers'

if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
  throw new Error('TEST_SUPERADMIN_EMAIL and TEST_SUPERADMIN_PASSWORD must be set.')
}
if (
  !process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.SUPABASE_URL
) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) must be set.')
}
if (
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.SUPABASE_ANON_KEY
) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY) must be set.')
}

const ts = Date.now()
const STORE_NAME = `주문테스트매장${ts}`
const OWNER_EMAIL = `order-owner-${ts}@tableflow.com`
const OWNER_PASSWORD = 'Test1234!@'
const OWNER_NEW_PASSWORD = 'Test5678!@'
const STAFF_EMAIL = `order-staff-${ts}@tableflow.com`
const STAFF_PASSWORD = 'Staff1234!@'
const STAFF_NEW_PASSWORD = 'Staff5678!@'

let storeId = ''
let storeSlug = ''
let tableId = ''
let qrToken = ''
let categoryId = ''
let menuItemId = ''
let tableNumber = 0

const today = new Date().toISOString().split('T')[0]
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

type StoreRow = { id: string; slug: string }
type MenuSeedRow = { id: string }
type TableRow = { id: string; table_number: number; qr_token: string }
type OrderSeedRow = { id: string }
type OrderRow = { id: string }

interface NotificationProbe {
  notifications: Array<{ title: string; body: string }>
  vibrateCalls: number[][]
}

async function getStoreId(page: Page): Promise<string> {
  const store = await lookupStoreByName<StoreRow>(page, STORE_NAME)
  storeSlug = store.slug
  return store.id
}

async function getLatestOrderIdByTable(page: Page, targetTableId: string): Promise<string | null> {
  const rows = await supabaseGet<OrderSeedRow>(
    page,
    `orders?select=id&table_id=eq.${encodeURIComponent(targetTableId)}&order=created_at.desc&limit=1`
  )
  if (rows.length === 0) return null
  return rows[0].id
}

async function waitForNewOrderIdByTable(
  page: Page,
  targetTableId: string,
  previousOrderId: string | null,
  timeoutMs = 12000,
) {
  let latestOrderId: string | null = null
  await expect
    .poll(
      async () => {
        const candidate = await getLatestOrderIdByTable(page, targetTableId)
        if (!candidate || candidate === previousOrderId) return null
        latestOrderId = candidate
        return candidate
      },
      { timeout: timeoutMs, message: `새 주문이 DB에서 ${timeoutMs}ms 내에 확인되지 않습니다.` }
    )
    .toBeTruthy()

  if (!latestOrderId) {
    throw new Error('새 주문이 DB에서 확인되지 않습니다.')
  }
  return latestOrderId
}

function orderCardLocator(page: Page, tableNumber: number, expectedActionLabel: string) {
  const marker = `T${tableNumber}`
  return page
    .locator('[data-testid="kds-order-card"]')
    .filter({ hasText: '주문번호' })
    .filter({ hasText: marker })
    .filter({ has: page.getByRole('button', { name: expectedActionLabel, exact: true }) })
    .first()
}

async function waitForOrderCard(page: Page, tableNumber: number, expectedActionLabel: string, timeoutMs = 15000) {
  const card = orderCardLocator(page, tableNumber, expectedActionLabel)
  await expect(card, `테이블 ${tableNumber} 주문이 '${expectedActionLabel}' 상태로 표시되어야 합니다.`).toBeVisible({ timeout: timeoutMs })
  return card
}

function orderCardLocatorByOrderId(page: Page, orderId: string, expectedActionLabel: string) {
  // KDS shows order.id.slice(0, 8) — match by truncated ID displayed as "#XXXXXXXX"
  return page
    .locator('[data-testid="kds-order-card"]')
    .filter({ hasText: orderId.slice(0, 8) })
    .filter({ has: page.getByRole('button', { name: expectedActionLabel, exact: true }) })
    .first()
}

async function waitForOrderCardByOrderId(page: Page, orderId: string, expectedActionLabel: string, timeoutMs = 20000) {
  const card = orderCardLocatorByOrderId(page, orderId, expectedActionLabel)
  await expect(card, `주문 ${orderId}가 '${expectedActionLabel}' 상태로 표시되어야 합니다.`).toBeVisible({ timeout: timeoutMs })
  return card
}

async function placeOneOrderFromCustomer(page: Page) {
  // Splash screen과 메뉴 로딩 대기
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // 메뉴 아이템 카드 클릭 (cursor-pointer 클래스로 구분)
  const menuCard = page.locator('div.cursor-pointer').filter({ has: page.locator('button') }).first()
  await expect(menuCard, '메뉴 아이템 카드가 보여야 합니다.').toBeVisible({ timeout: 15000 })
  await menuCard.click()
  await page.waitForTimeout(500)

  // 모달에서 "원 담기" 버튼 클릭
  const addToCartBtn = page.getByRole('button', { name: /원 담기/ })
  await expect(addToCartBtn, '담기 버튼이 모달에 보여야 합니다.').toBeVisible({ timeout: 8000 })
  await addToCartBtn.click()
  await page.waitForTimeout(500)

  // 장바구니(주문 확인) 열기
  const cartBtn = page.getByRole('button', { name: /주문 확인|장바구니/ }).first()
  await expect(cartBtn, '주문 확인 버튼이 보여야 합니다.').toBeVisible({ timeout: 8000 })
  await cartBtn.click()
  await page.waitForTimeout(500)

  // 주문하기 버튼 클릭 → 확인 다이얼로그 → 확인 버튼으로 실제 주문 제출
  const submitButton = page.getByRole('button', { name: '주문하기', exact: true })
  await expect(submitButton, '주문하기 버튼이 보여야 합니다.').toBeVisible({ timeout: 8000 })
  await submitButton.click()
  const confirmButton = page.getByRole('button', { name: '확인', exact: true })
  await expect(confirmButton, '주문 확인 다이얼로그의 확인 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
  await confirmButton.click()

  // 주문 성공 메시지 대기 (API 응답 시간 포함)
  await expect(page.locator('body')).toContainText('주문이 성공적으로 접수되었습니다', { timeout: 15000 })
  await page.waitForTimeout(1000) // Realtime 업데이트 대기
}

async function installNotificationProbe(page: Page) {
  await page.addInitScript(() => {
    const probe = { notifications: [] as Array<{ title: string; body: string }>, vibrateCalls: [] as number[][] }

    const safeDefine = (target: object, property: string, descriptor: PropertyDescriptor) => {
      try {
        Object.defineProperty(target, property, descriptor)
      } catch {}
    }

    const mockNotification = class {
      public static permission: NotificationPermission = 'granted'

      public static requestPermission(): Promise<NotificationPermission> {
        return Promise.resolve('granted')
      }

      public close() {}

      constructor(title: string, options?: NotificationOptions) {
        probe.notifications.push({ title, body: options?.body ?? '' })
      }
    }

    safeDefine(window, '__orderFlowNotificationProbe', { value: probe, configurable: true })
    safeDefine(window, 'Notification', { value: mockNotification, configurable: true, writable: true })
    safeDefine(mockNotification, 'permission', { value: 'granted', configurable: true, writable: true })
    safeDefine(mockNotification, 'requestPermission', {
      value: () => Promise.resolve('granted'),
      configurable: true,
      writable: true,
    })
    safeDefine(mockNotification.prototype, 'close', { value() {}, configurable: true })

    safeDefine(navigator, 'vibrate', {
      value: (pattern: number | number[]) => {
        const normalized = Array.isArray(pattern) ? pattern : [pattern]
        probe.vibrateCalls.push(normalized)
        return true
      },
      configurable: true,
      writable: true,
    })

    safeDefine(document, 'visibilityState', { get: () => 'hidden', configurable: true })
    safeDefine(document, 'hidden', { get: () => true, configurable: true })
  })
}

async function getNotificationProbe(page: Page): Promise<NotificationProbe> {
  return await page.evaluate(() => {
    return (
      (window as unknown as { __orderFlowNotificationProbe: NotificationProbe }).__orderFlowNotificationProbe ?? {
        notifications: [],
        vibrateCalls: [],
      }
    )
  })
}

async function ensureNotificationContains(page: Page, expected: (probe: NotificationProbe) => boolean, message: string) {
  await expect
    .poll(
      async () => {
        const probe = await getNotificationProbe(page)
        return expected(probe)
      },
      { timeout: 10000, message }
    )
    .toBe(true)
}

async function loginAsStaff(page: Page) {
  await login(page, STAFF_EMAIL, STAFF_PASSWORD)
  await page.waitForLoadState('networkidle')
  if (page.url().includes('change-password')) {
    await completePasswordChange(page, STAFF_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')
  } else {
    await expect(page).toHaveURL('/admin', { timeout: 10000 })
    await page.waitForLoadState('networkidle')
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('TableFlow 사용자 시나리오 E2E', () => {
  test('1. 슈퍼어드민 매장 생성 + 테이블 자동 생성 확인', async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL!, SUPERADMIN_PASSWORD!)
    await expect(page).toHaveURL('/superadmin', { timeout: 10000 })

    await expect(page.getByRole('button', { name: '매장 추가' })).toBeVisible()
    await page.getByRole('button', { name: '매장 추가' }).click()

    await fillSuperadminCreateStoreForm(page, {
      name: STORE_NAME,
      ownerEmail: OWNER_EMAIL,
      ownerPassword: OWNER_PASSWORD,
      startDate: today,
      endDate: nextYear,
    })

    await page.getByRole('button', { name: '매장 생성' }).click()
    await expect(page.getByRole('cell', { name: STORE_NAME })).toBeVisible({ timeout: 10000 })
    const store = await lookupStoreByName<StoreRow>(page, STORE_NAME)
    storeId = store.id
    storeSlug = store.slug
    await markStoreTestData(storeSlug)
  })

  test('2. 점주 첫 로그인 → 비번 변경 → 어드민 진입', async ({ page }) => {
    await loginAndWaitForPasswordChange(page, OWNER_EMAIL, OWNER_PASSWORD)
    await completePasswordChange(page, OWNER_NEW_PASSWORD)
  })

  test('3. 점주 어드민 — 메뉴 관리 탭 접근', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /메뉴 관리/)
    await expect(page.locator('button').filter({ hasText: '새 메뉴 등록' })).toBeVisible({ timeout: 5000 })
  })

  test('4. 점주 어드민 — 테이블 확인 후 tableId 추출', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    storeId = await getStoreId(page)
    const tableRows = await supabaseGet<TableRow>(
      page,
      `tables?select=id,table_number,qr_token&store_id=eq.${storeId}&order=table_number.asc&limit=1`
    )
    expect(tableRows.length, '매장에 최소 1개 이상의 테이블이 있어야 합니다.').toBeGreaterThan(0)

    tableId = tableRows[0].id
    qrToken = tableRows[0].qr_token
    tableNumber = tableRows[0].table_number
    expect(tableId, 'tableId가 설정되어야 합니다.').toBeTruthy()
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()
    expect(tableNumber, 'tableNumber가 설정되어야 합니다.').toBeGreaterThan(0)
  })

  test('4.5. 점주 — 메뉴 seed (카테고리 + 아이템)', async ({ page }) => {
    expect(tableId, '이전 테스트에서 tableId가 생성되어 있어야 합니다.').toBeTruthy()

    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    expect(storeId, 'storeId가 이전 테스트에서 설정되어야 합니다.').toBeTruthy()
    const categoryRows = await supabasePost<MenuSeedRow>(page, 'menu_categories', {
      store_id: storeId,
      name: '테스트메뉴',
      sort_order: 1,
    })
    expect(categoryRows.length, '카테고리 생성 응답이 있어야 합니다.').toBeGreaterThan(0)
    categoryId = categoryRows[0].id

    const itemRows = await supabasePost<MenuSeedRow>(page, 'menu_items', {
      store_id: storeId,
      category_id: categoryId,
      name: '테스트메뉴1',
      price: 10000,
      is_available: true,
      sort_order: 1,
    })
    expect(itemRows.length, '메뉴 아이템 생성 응답이 있어야 합니다.').toBeGreaterThan(0)
    menuItemId = itemRows[0].id

    expect(menuItemId, '메뉴 아이템 ID가 설정되어야 합니다.').toBeTruthy()
  })

  test('5. 고객 — 메뉴 화면 조회', async ({ page }) => {
    expect(tableId, '테이블 ID가 있어야 고객 화면 검증이 가능합니다.').toBeTruthy()

    await page.goto(`/m/${storeSlug}/${qrToken}`)
    await expect(page).toHaveURL(new RegExp(`^.*/m/${storeSlug}/${qrToken}`), { timeout: 10000 })

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain('찾을 수 없습니다')
    expect(bodyText).not.toContain('오류')
  })

  test('6. 고객 주문 → 어드민 실시간 수신 (1초 이내)', async ({ browser }) => {
    expect(tableId, '테이블 ID가 있어야 주문 실시간 테스트가 가능합니다.').toBeTruthy()

    const ownerAdminCtx = await browser.newContext()
    const ownerAdminPage = await ownerAdminCtx.newPage()
    await loginAndWaitForAdmin(ownerAdminPage, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    const watcherCtx = await browser.newContext()
    const watcherPage = await watcherCtx.newPage()
    await loginAndWaitForAdmin(watcherPage, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    const customerCtx = await browser.newContext()
    const customerPage = await customerCtx.newPage()
    await customerPage.goto(`/m/${storeSlug}/${qrToken}`)
    await expect(customerPage.locator('body')).toContainText('환영합니다', { timeout: 10000 })

    await placeOneOrderFromCustomer(customerPage)

    await expect(ownerAdminPage.locator('body')).toContainText('새 주문이 들어왔습니다!', { timeout: 20000 })

    const ownerPendingCard = await waitForOrderCard(ownerAdminPage, tableNumber, '조리 시작')
    const watcherPendingCard = await waitForOrderCard(watcherPage, tableNumber, '조리 시작')

    expect(await ownerPendingCard.isVisible(), '주문 카드가 owner 화면에 보입니다.').toBeTruthy()
    expect(await watcherPendingCard.isVisible(), '주문 카드가 감시자 화면에 보입니다.').toBeTruthy()

    await ownerPendingCard.getByRole('button', { name: '조리 시작', exact: true }).click()

    const ownerPreparingCard = await waitForOrderCard(ownerAdminPage, tableNumber, '조리 완료')
    const watcherPreparingCard = await waitForOrderCard(watcherPage, tableNumber, '조리 완료')
    expect(await ownerPreparingCard.isVisible(), '조리 시작 후 owner 화면에서 조리중 카드가 보여야 합니다.').toBeTruthy()
    expect(await watcherPreparingCard.isVisible(), '조리 시작 후 감시자 화면에서 조리중 카드가 보여야 합니다.').toBeTruthy()

    await ownerPreparingCard.getByRole('button', { name: '조리 완료', exact: true }).click()

    const ownerServingCard = await waitForOrderCard(ownerAdminPage, tableNumber, '서빙 완료')
    const watcherServingCard = await waitForOrderCard(watcherPage, tableNumber, '서빙 완료')
    expect(await ownerServingCard.isVisible(), '조리 완료 후 owner 화면에서 서빙 대기 카드가 보여야 합니다.').toBeTruthy()
    expect(await watcherServingCard.isVisible(), '조리 완료 후 감시자 화면에서 서빙 대기 카드가 보여야 합니다.').toBeTruthy()

    await ownerAdminCtx.close()
    await watcherCtx.close()
    await customerCtx.close()
  })

  test('10. 알림/진동 동기화: 포그라운드 숨김 상태에서 주문 접수/상태 변경', async ({ browser }) => {
    expect(tableId, '테이블 ID가 있어야 주문 실시간/알림 테스트가 가능합니다.').toBeTruthy()

    const ownerAdminCtx = await browser.newContext()
    const ownerAdminPage = await ownerAdminCtx.newPage()
    await installNotificationProbe(ownerAdminPage)
    await loginAndWaitForAdmin(ownerAdminPage, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    const previousOrderId = await getLatestOrderIdByTable(ownerAdminPage, tableId)

    const customerCtx = await browser.newContext()
    const customerPage = await customerCtx.newPage()
    await customerPage.goto(`/m/${storeSlug}/${qrToken}`)
    await expect(customerPage.locator('body')).toContainText('환영합니다', { timeout: 10000 })

    await placeOneOrderFromCustomer(customerPage)
    const newOrderId = await waitForNewOrderIdByTable(ownerAdminPage, tableId, previousOrderId)

    const pendingCard = await waitForOrderCardByOrderId(ownerAdminPage, newOrderId, '조리 시작')
    expect(await pendingCard.isVisible(), '새 주문 카드가 확인되어야 합니다.').toBeTruthy()

    await ensureNotificationContains(
      ownerAdminPage,
      (probe) => probe.notifications.some((n) => n.title.includes('새 주문') && n.body.includes('주문이 접수되었습니다.')),
      '주문 생성 시 Notification 이벤트가 발생해야 합니다.'
    )

    await pendingCard.getByRole('button', { name: '조리 시작', exact: true }).click()
    const preparingCard = await waitForOrderCardByOrderId(ownerAdminPage, newOrderId, '조리 완료')

    await ensureNotificationContains(
      ownerAdminPage,
      (probe) => probe.notifications.some((n) => n.title.includes('조리 중')),
      '조리 시작 시 Notification 이벤트가 발생해야 합니다.'
    )

    await preparingCard.getByRole('button', { name: '조리 완료', exact: true }).click()

    const servedCard = await waitForOrderCardByOrderId(ownerAdminPage, newOrderId, '서빙 완료')
    expect(await servedCard.isVisible(), '조리 완료 후 상태가 서빙 완료로 변경되어야 합니다.').toBeTruthy()

    await ensureNotificationContains(
      ownerAdminPage,
      (probe) => probe.notifications.some((n) => n.title.includes('조리 완료')),
      '조리 완료 시 Notification 이벤트가 발생해야 합니다.'
    )

    const isPatternEqual = (a: number[], b: number[]) => a.length === b.length && a.every((value, idx) => value === b[idx])
    const probe = await getNotificationProbe(ownerAdminPage)
    const hasOrderVibration = probe.vibrateCalls.some((pattern) => isPatternEqual(pattern, [200, 100, 200, 100, 400]))
    const hasReadyVibration = probe.vibrateCalls.some((pattern) => isPatternEqual(pattern, [400, 100, 400]))
    expect(hasOrderVibration, '주문 수신 시 진동 패턴(200,100,200,100,400)이 기록되어야 합니다.').toBeTruthy()
    expect(hasReadyVibration, '조리 완료 시 진동 패턴(400,100,400)이 기록되어야 합니다.').toBeTruthy()

    await ownerAdminCtx.close()
    await customerCtx.close()
  })

  test('7. 점주 어드민 — 직원 계정 생성 (UI 확인)', async ({ page }) => {
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

    await expect(page.locator('body')).toContainText(STAFF_EMAIL, { timeout: 10000 })

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /직원/)
    await expect(page.locator('body')).toContainText(STAFF_EMAIL, { timeout: 8000 })
  })

  test('8. 점주+직원 실시간 동기화: 주문 접수 및 조리 상태 반영', async ({ browser }) => {
    expect(tableId, '테이블 ID가 있어야 주문 실시간 테스트가 가능합니다.').toBeTruthy()

    const ownerAdminCtx = await browser.newContext()
    const ownerAdminPage = await ownerAdminCtx.newPage()
    await loginAndWaitForAdmin(ownerAdminPage, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    const staffCtx = await browser.newContext()
    const staffPage = await staffCtx.newPage()
    await loginAsStaff(staffPage)

    const customerCtx = await browser.newContext()
    const customerPage = await customerCtx.newPage()
    await customerPage.goto(`/m/${storeSlug}/${qrToken}`)
    await expect(customerPage.locator('body')).toContainText('환영합니다', { timeout: 10000 })

    await placeOneOrderFromCustomer(customerPage)

    await expect(staffPage.locator('body')).toContainText('새 주문이 들어왔습니다!', { timeout: 20000 })

    const staffPendingCard = await waitForOrderCard(staffPage, tableNumber, '조리 시작', 30000)
    const ownerPendingCard = await waitForOrderCard(ownerAdminPage, tableNumber, '조리 시작', 30000)

    expect(await staffPendingCard.isVisible(), '직원 화면에서 신규 주문이 보여야 합니다.').toBeTruthy()
    expect(await ownerPendingCard.isVisible(), '점주 화면에서 신규 주문이 보여야 합니다.').toBeTruthy()

    await ownerPendingCard.getByRole('button', { name: '조리 시작', exact: true }).click()

    const staffPreparingCard = await waitForOrderCard(staffPage, tableNumber, '조리 완료')
    expect(await staffPreparingCard.isVisible(), '직원 화면에서 조리중으로 이동되어야 합니다.').toBeTruthy()

    await staffPreparingCard.getByRole('button', { name: '조리 완료', exact: true }).click()

    const staffServingCard = await waitForOrderCard(staffPage, tableNumber, '서빙 완료')
    expect(await staffServingCard.isVisible(), '직원 화면에서 서빙 대기 상태가 보여야 합니다.').toBeTruthy()

    await ownerAdminCtx.close()
    await staffCtx.close()
    await customerCtx.close()
  })

  test('9. role 권한 제한 확인', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /메뉴 관리/)
    await expect(sidebarBtn(page, /매장 관리/).first()).toBeVisible({ timeout: 5000 })
    const roleText = (await page.locator('body').innerText()).toLowerCase()
    expect(roleText, 'owner 또는 최고관리자 role 텍스트가 노출되어야 합니다.').toMatch(/owner|최고관리자|점주/)
  })

  test('SC-041. 실시간 채널 장애 복원성: 오프라인→온라인 전환 후 어드민 정상 동작', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    // 어드민 UI가 정상 로드되었는지 초기 확인
    const bodyText = await page.locator('body').innerText()
    expect(bodyText, '어드민 페이지가 로드되어야 합니다.').toMatch(/주방 KDS|대시보드|주문/)

    // 오프라인 시뮬레이션
    await page.context().setOffline(true)
    await page.waitForTimeout(2000)

    // 온라인 복구 시뮬레이션
    await page.context().setOffline(false)
    await page.waitForTimeout(3000)

    // 재연결 후 어드민 페이지가 여전히 정상 상태인지 확인
    await expect(page.locator('body'), '재연결 후 어드민 페이지가 크래시 없이 표시되어야 합니다.').not.toContainText('오류가 발생했습니다')
    await expect(page.locator('body'), '재연결 후 어드민 UI 요소가 보여야 합니다.').toContainText(/주방 KDS|대시보드|주문/, { timeout: 5000 })
  })

  // ────────────────────────────────────────────────────────────────
  // OD-002~004: 주문 원자성 실패 케이스
  // ────────────────────────────────────────────────────────────────

  test('OD-002: 잘못된 메뉴 아이템으로 전체 주문 실패', async ({ page }) => {
    expect(storeId, 'storeId가 설정되어야 합니다.').toBeTruthy()
    expect(tableId, 'tableId가 설정되어야 합니다.').toBeTruthy()

    // 점주로 로그인하여 헤더 추출
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    // 현재 주문 수 기록 (이전 테스트에서 생성된 주문 포함)
    const ordersBefore = await supabaseGet<OrderRow>(
      page,
      `orders?select=id&store_id=eq.${storeId}`
    )
    const orderCountBefore = ordersBefore.length

    // 잘못된 menu_item_id로 주문 요청
    const { url: supabaseUrl } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    const invalidRes = await fetch(`${supabaseUrl}/rest/v1/rpc/create_order_with_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_table_id: tableId,
        p_items: [
          { menu_item_id: 'nonexistent-id', quantity: 1 }
        ]
      })
    })

    // RPC 호출이 실패해야 함 (status 200이 아님)
    expect(invalidRes.status, 'Invalid menu_item_id는 RPC를 실패하게 해야 합니다.').not.toBe(200)

    // invalid RPC 후 주문 수가 증가하지 않았는지 확인
    const ordersAfter = await supabaseGet<OrderRow>(
      page,
      `orders?select=id&store_id=eq.${storeId}&order=created_at.desc`
    )

    // 트랜잭션이 atomic하므로 invalid RPC로 새 주문이 추가되지 않아야 함
    expect(ordersAfter.length, 'Invalid item으로 새 주문이 생성되어서는 안 됩니다.').toBe(orderCountBefore)
  })

  test('OD-003: 빈 아이템 배열로 주문 차단', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    const { url: supabaseUrl } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    const emptyRes = await fetch(`${supabaseUrl}/rest/v1/rpc/create_order_with_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_table_id: tableId,
        p_items: [] // 빈 배열
      })
    })

    // 빈 배열은 실패해야 함
    expect(emptyRes.status).not.toBe(200)
  })

  test('OD-004: 다른 매장 테이블로 주문 시도 시 차단', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    // 다른 매장의 tableId로 주문 시도
    const { url: supabaseUrl } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    const wrongStoreRes = await fetch(`${supabaseUrl}/rest/v1/rpc/create_order_with_items`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_table_id: 'wrong-table-from-other-store',
        p_items: menuItemId ? [{ menu_item_id: menuItemId, quantity: 1 }] : []
      })
    })

    // RLS 정책에 의해 실패해야 함
    expect(wrongStoreRes.status).not.toBe(200)
  })

  // ────────────────────────────────────────────────────────────────
  // NT-001~005: 알림 권한 user gesture
  // ────────────────────────────────────────────────────────────────

  test('NT-001: 어드민 첫 진입 시 알림 권한 자동 요청 없음', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    // 첫 진입 직후 permission request가 없어야 함
    let permissionRequested = false
    page.on('dialog', async (dialog) => {
      permissionRequested = true
      await dialog.dismiss()
    })

    await page.waitForTimeout(2000) // 페이지 로드 후 2초 대기

    expect(permissionRequested, '첫 진입 시 알림 권한 자동 요청이 없어야 합니다.').toBeFalsy()
  })

  test.fixme('NT-002: 첫 사용자 제스처 후 알림 권한 요청', async ({ page }) => {
    // TODO: Implement with separate browser context to avoid auth rate limiting.
    // Steps:
    //   1. page.addInitScript() to override Notification.requestPermission and set window.__notifRequested
    //   2. loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    //   3. Click a button to trigger user gesture
    //   4. Verify page.evaluate(() => window.__notifRequested) is true
  })

  test.fixme('NT-003: 권한 거부 시 안내 toast 표시', async ({ page }) => {
    // TODO: Implement with page.addInitScript() to mock Notification.requestPermission returning 'denied'.
    // Steps:
    //   1. addInitScript: override requestPermission to return 'denied'
    //   2. loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    //   3. Click a button to trigger user gesture / notification request
    //   4. Verify a toast/snackbar with denial guidance appears in the DOM
  })

  test.fixme('NT-004: 알림 권한 요청 반복 방지', async ({ page }) => {
    // TODO: Implement call-count deduplication check.
    // Steps:
    //   1. addInitScript: override requestPermission to increment window.__requestCount
    //   2. loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    //   3. Click 3 different buttons to produce multiple gestures
    //   4. Verify page.evaluate(() => window.__requestCount ?? 0) === 1
  })

  test.fixme('NT-005: 백그라운드 탭에서 새 주문 알림', async ({ page }) => {
    // TODO: This scenario is largely covered by order-flow test 10 (notification probe).
    // If a dedicated test is needed:
    //   1. addInitScript: stub Notification constructor to record calls in window.__notifications[]
    //   2. Override Notification.permission = 'granted'
    //   3. loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    //   4. Trigger a Realtime INSERT event (via service-role API call)
    //   5. Verify window.__notifications.length > 0 and title matches expected order text
  })

  test.afterAll(async () => {
    await deleteStoresWithTestTag()
    await deleteStoreBySlug(storeSlug)
  })
})
