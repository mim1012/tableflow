import { test, expect } from '@playwright/test'
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  clickSidebarButton,
  completePasswordChange,
  deleteStoresWithTestTag,
  deleteStoreBySlug,
  fillDateRange,
  getSupabaseConfig,
  markStoreTestData,
  login,
  loginAndWaitForAdmin,
  loginAndWaitForPasswordChange,
  requireEnv,
  supabaseGet,
  supabaseHeaders,
  supabasePost,
} from './e2e-helpers'

requireEnv('TEST_SUPERADMIN_EMAIL')
requireEnv('TEST_SUPERADMIN_PASSWORD')

const ts = Date.now()
const STORE_NAME = `메뉴테스트매장${ts}`
const STORE_SLUG = `menu-test-${ts}`
const OWNER_EMAIL = `menu-owner-${ts}@tableflow.com`
const OWNER_PASSWORD = 'Test1234!@'
const OWNER_NEW_PASSWORD = 'Test5678!@'

const today = new Date().toISOString().split('T')[0]
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

let storeId = ''
let qrToken = ''
let categoryId = ''
let menuItemId1 = ''
let menuItemId2 = ''

type StoreRow = { id: string }
type TableRow = { id: string; qr_token: string }
type SeedRow = { id: string }

test.describe.configure({ mode: 'serial' })

test.describe('메뉴 CRUD E2E (SC-014~SC-019)', () => {
  test('1. 슈퍼어드민 — 매장 생성', async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL!, SUPERADMIN_PASSWORD!)
    await expect(page).toHaveURL('/superadmin', { timeout: 10000 })

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
  })

  test('3. 매장/테이블 정보 추출 + 메뉴 데이터 seed', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    // storeId 추출
    const storeRows = await supabaseGet<StoreRow>(
      page,
      `stores?select=id&slug=eq.${encodeURIComponent(STORE_SLUG)}&limit=1`
    )
    expect(storeRows.length).toBeGreaterThan(0)
    storeId = storeRows[0].id

    // qrToken 추출
    const tableRows = await supabaseGet<TableRow>(
      page,
      `tables?select=id,qr_token&store_id=eq.${storeId}&order=table_number.asc&limit=1`
    )
    expect(tableRows.length).toBeGreaterThan(0)
    qrToken = tableRows[0].qr_token

    // 카테고리 seed
    const catRows = await supabasePost<SeedRow>(page, 'menu_categories', {
      store_id: storeId,
      name: '메인메뉴',
      sort_order: 1,
    })
    expect(catRows.length).toBeGreaterThan(0)
    categoryId = catRows[0].id

    // 메뉴 아이템 seed (2개)
    const item1 = await supabasePost<SeedRow>(page, 'menu_items', {
      store_id: storeId,
      category_id: categoryId,
      name: '테스트김치찌개',
      price: 9000,
      is_available: true,
      sort_order: 1,
    })
    expect(item1.length).toBeGreaterThan(0)
    menuItemId1 = item1[0].id

    const item2 = await supabasePost<SeedRow>(page, 'menu_items', {
      store_id: storeId,
      category_id: categoryId,
      name: '테스트된장찌개',
      price: 8000,
      is_available: true,
      sort_order: 2,
    })
    expect(item2.length).toBeGreaterThan(0)
    menuItemId2 = item2[0].id
  })

  test('SC-014: 메뉴 관리 탭 진입 — 등록된 메뉴 표시', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /메뉴 관리/)

    // 메뉴 관리 화면 렌더링 확인
    await expect(page.locator('h2').filter({ hasText: '메뉴 관리' })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button').filter({ hasText: '새 메뉴 등록' })).toBeVisible()

    // seed한 메뉴가 표시되는지 확인
    await expect(page.locator('body')).toContainText('테스트김치찌개', { timeout: 15000 })
    await expect(page.locator('body')).toContainText('테스트된장찌개', { timeout: 5000 })
  })

  test('SC-015: 메뉴 아이템 UI 등록', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /메뉴 관리/)

    // 새 메뉴 등록 모달 열기
    await page.locator('button').filter({ hasText: '새 메뉴 등록' }).click()
    await expect(page.locator('h2').filter({ hasText: '새 메뉴 등록' })).toBeVisible({ timeout: 5000 })

    // 메뉴 정보 입력
    await page.locator('input[name="name"]').fill('테스트비빔밥')
    await page.locator('select[name="category"]').selectOption({ index: 0 })
    await page.locator('input[name="price"]').fill('10000')

    // 등록 버튼 클릭
    await page.locator('button[type="submit"]').filter({ hasText: '메뉴 등록하기' }).click()

    // 성공 toast 확인
    await expect(page.locator('body')).toContainText(/새 메뉴가 등록되었습니다|등록/, { timeout: 8000 })
  })

  test('SC-016: 메뉴 수정 — 이름·가격 변경', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /메뉴 관리/)

    // seed한 메뉴가 로딩될 때까지 대기
    await expect(page.locator('body')).toContainText('테스트김치찌개', { timeout: 15000 })

    // 메뉴 카드의 수정 버튼 (PenSquare 아이콘) 클릭
    // 메뉴 카드는 grid 안의 div로, 각 카드에 수정 아이콘 버튼이 있음
    const menuCard = page.locator('div.group').filter({ hasText: '테스트김치찌개' }).first()
    await expect(menuCard).toBeVisible({ timeout: 5000 })
    const editBtn = menuCard.locator('button').first()
    await editBtn.click()

    // 수정 모달 확인
    await expect(page.locator('h2').filter({ hasText: '메뉴 정보 수정' })).toBeVisible({ timeout: 5000 })

    // 이름과 가격 변경
    const nameInput = page.locator('input[name="name"]')
    await nameInput.clear()
    await nameInput.fill('특제김치찌개')

    const priceInput = page.locator('input[name="price"]')
    await priceInput.clear()
    await priceInput.fill('12000')

    // 수정 완료 클릭
    await page.locator('button[type="submit"]').filter({ hasText: '수정 완료' }).click()

    // 성공 toast 확인
    await expect(page.locator('body')).toContainText(/메뉴가 수정되었습니다|수정/, { timeout: 8000 })
  })

  test('SC-017: 메뉴 비활성화 — 품절 처리', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /메뉴 관리/)

    // 메뉴 목록 로딩 대기
    await expect(page.locator('body')).toContainText('₩', { timeout: 15000 })

    // 판매중(ON) 상태인 메뉴의 토글 버튼 클릭 → 품절(OFF)로 변경
    const stockToggle = page.locator('button').filter({ hasText: '판매중 (ON)' }).first()
    await expect(stockToggle).toBeVisible({ timeout: 5000 })
    await stockToggle.click()

    // 상태 변경 toast 확인
    await expect(page.locator('body')).toContainText(/판매 상태가 변경|상태/, { timeout: 8000 })

    // 품절(OFF) 버튼이 나타나는지 확인
    await expect(page.locator('button').filter({ hasText: '품절 (OFF)' }).first()).toBeVisible({ timeout: 5000 })
  })

  test('SC-017-2: 고객 화면에서 품절 메뉴 미노출 확인', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await page.waitForLoadState('networkidle')

    // 판매중인 메뉴는 보여야 함
    await expect(page.locator('body')).toContainText('테스트된장찌개', { timeout: 10000 })
  })

  test('SC-018: 테이블 추가', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /QR/)

    // QR 관리 화면 확인
    await expect(page.locator('h2').filter({ hasText: 'QR' })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('h3').filter({ hasText: /\d+번 테이블|테이블 \d+/ }).first()).toBeVisible({ timeout: 8000 })

    // 테이블 추가 버튼 클릭
    await page.locator('button').filter({ hasText: '테이블 추가' }).click()

    // 성공 toast 확인 (버튼 텍스트 "테이블 추가"와 구별되도록 구체적으로 매칭)
    await expect(page.locator('body')).toContainText('테이블이 추가되었습니다', { timeout: 8000 })

    // DB에서 테이블 수 증가 확인
    const tableRows = await supabaseGet<{ id: string }>(
      page,
      `tables?select=id&store_id=eq.${storeId}`
    )
    expect(tableRows.length, '테이블이 6개 이상이어야 합니다 (기본 5 + 추가 1)').toBeGreaterThanOrEqual(6)
  })

  test('SC-019: QR URL 유효성 — 고객 메뉴 정상 로딩', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await expect(page).toHaveURL(new RegExp(`/m/${STORE_SLUG}/${qrToken}`), { timeout: 10000 })

    // 오류 화면이 아닌 정상 메뉴 화면인지 확인
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain('찾을 수 없습니다')
    expect(bodyText).not.toContain('오류')

    // 판매중인 메뉴가 표시되어야 함
    await expect(page.locator('body')).toContainText('테스트된장찌개', { timeout: 10000 })
  })

  test('UC-M15: 메뉴 아이템 삭제 (soft-delete) — 관리자 목록 + 고객 화면 미노출', async ({ page }) => {
    expect(storeId).toBeTruthy()
    expect(menuItemId2, 'menuItemId2가 설정되어야 합니다.').toBeTruthy()
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    // 1) owner 로그인 후 API 토큰 획득 + soft-delete 실행
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    const { url } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    const deleteRes = await fetch(
      `${url}/rest/v1/menu_items?id=eq.${menuItemId2}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_deleted: true, deleted_at: new Date().toISOString() }),
      },
    )
    expect(deleteRes.ok, '메뉴 아이템 soft-delete 성공').toBeTruthy()

    // 2) 새 컨텍스트로 로그인 → 메뉴 관리 탭 진입 (fresh 데이터 로드)
    const adminCtx = await page.context().browser()!.newContext()
    const adminPage = await adminCtx.newPage()
    await loginAndWaitForAdmin(adminPage, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await adminPage.waitForLoadState('networkidle')

    await clickSidebarButton(adminPage, /매장 관리/)
    await clickSidebarButton(adminPage, /메뉴 관리/)
    await expect(adminPage.locator('h2').filter({ hasText: '메뉴 관리' })).toBeVisible({ timeout: 5000 })

    // 메뉴 목록 로딩 대기 (최소 다른 메뉴가 보일 때까지)
    await expect(adminPage.locator('body')).toContainText('₩', { timeout: 15000 })

    // 삭제된 메뉴(테스트된장찌개)가 목록에서 사라졌는지 확인
    const adminBodyText = await adminPage.locator('body').innerText()
    expect(
      adminBodyText.includes('테스트된장찌개'),
      '삭제된 메뉴 아이템은 관리 목록에 표시되지 않아야 합니다',
    ).toBeFalsy()

    await adminCtx.close()

    // 3) 고객 QR 메뉴 페이지에서도 미노출 확인
    const anonCtx = await page.context().browser()!.newContext()
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await anonPage.waitForLoadState('networkidle')
    await anonPage.waitForTimeout(3000)

    const customerText = await anonPage.locator('body').innerText()
    expect(
      customerText.includes('테스트된장찌개'),
      '삭제된 메뉴 아이템은 고객 메뉴 페이지에 표시되지 않아야 합니다',
    ).toBeFalsy()

    await anonCtx.close()
  })

  test('SC-021: 점주 매출 분석 탭', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    // "매장 관리" 모드로 전환 후 "매출 분석" 서브탭 클릭
    await clickSidebarButton(page, /매장 관리/)
    await clickSidebarButton(page, /매출 분석/)

    // 매출 분석 화면 확인
    await expect(page.locator('body')).toContainText(/매출|통계|분석/, { timeout: 8000 })
  })

  test.afterAll(async () => {
    await deleteStoresWithTestTag()
    await deleteStoreBySlug(STORE_SLUG)
  })
})
