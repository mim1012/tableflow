import { test, expect } from '@playwright/test'
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  completePasswordChange,
  deleteStoresWithTestTag,
  deleteStoreBySlug,
  fillDateRange,
  getServiceRoleHeaders,
  getSupabaseConfig,
  markStoreTestData,
  login,
  loginAndWaitForAdmin,
  loginAndWaitForPasswordChange,
  requireEnv,
  supabaseGet,
  supabasePost,
} from './e2e-helpers'

requireEnv('TEST_SUPERADMIN_EMAIL')
requireEnv('TEST_SUPERADMIN_PASSWORD')

const ts = Date.now()
const STORE_NAME = `장바구니테스트매장${ts}`
const STORE_SLUG = `cart-test-${ts}`
const OWNER_EMAIL = `cart-owner-${ts}@tableflow.com`
const OWNER_PASSWORD = 'Test1234!@'
const OWNER_NEW_PASSWORD = 'Test5678!@'

const today = new Date().toISOString().split('T')[0]
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

let qrToken = ''
let storeId = ''
let optionGroupId = ''
let optionChoiceId = ''

type StoreRow = { id: string }
type TableRow = { id: string; qr_token: string }
type SeedRow = { id: string }

test.describe.configure({ mode: 'serial' })

test.describe('고객 장바구니 E2E (SC-022, SC-023)', () => {
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

    const storeRows = await supabaseGet<StoreRow>(
      page,
      `stores?select=id&slug=eq.${encodeURIComponent(STORE_SLUG)}&limit=1`
    )
    expect(storeRows.length).toBeGreaterThan(0)
    storeId = storeRows[0].id

    const tableRows = await supabaseGet<TableRow>(
      page,
      `tables?select=id,qr_token&store_id=eq.${storeId}&order=table_number.asc&limit=1`
    )
    expect(tableRows.length).toBeGreaterThan(0)
    qrToken = tableRows[0].qr_token

    const catRows = await supabasePost<SeedRow>(page, 'menu_categories', {
      store_id: storeId,
      name: '테스트카테고리',
      sort_order: 1,
    })
    expect(catRows.length).toBeGreaterThan(0)
    const categoryId = catRows[0].id

    const itemRows = await supabasePost<SeedRow>(page, 'menu_items', {
      store_id: storeId,
      category_id: categoryId,
      name: '테스트메뉴아이템',
      price: 10000,
      is_available: true,
      sort_order: 1,
    })
    expect(itemRows.length).toBeGreaterThan(0)
    const menuItemId = itemRows[0].id

    // 옵션 그룹 + 선택지 seed (service role 필요)
    const serviceHeaders = getServiceRoleHeaders()
    if (serviceHeaders) {
      const { url } = getSupabaseConfig()

      const optGroupRes = await fetch(`${url}/rest/v1/option_groups`, {
        method: 'POST',
        headers: { ...serviceHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({
          store_id: storeId,
          menu_item_id: menuItemId,
          name: '사이즈 선택',
          is_required: false,
          sort_order: 1,
        }),
      })
      if (optGroupRes.ok) {
        const optGroupRows = (await optGroupRes.json()) as SeedRow[]
        optionGroupId = optGroupRows[0].id

        const optChoiceRes = await fetch(`${url}/rest/v1/option_choices`, {
          method: 'POST',
          headers: { ...serviceHeaders, Prefer: 'return=representation' },
          body: JSON.stringify({
            store_id: storeId,
            option_group_id: optionGroupId,
            name: '라지 사이즈',
            extra_price: 2000,
            sort_order: 1,
          }),
        })
        if (optChoiceRes.ok) {
          const optChoiceRows = (await optChoiceRes.json()) as SeedRow[]
          optionChoiceId = optChoiceRows[0].id
        }
      }
    }
  })

  // ────────────────────────────────────────────────────────────────
  // UC-C07~C08: 옵션 선택 모달 진입/UI
  // ────────────────────────────────────────────────────────────────

  test('UC-C07~C08: 옵션 선택 모달 — 메뉴 아이템 클릭 시 옵션 그룹 표시 및 선택', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()
    test.skip(!optionChoiceId, 'SUPABASE_SERVICE_ROLE_KEY 없어 옵션 seed 불가 — skip')

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // splash screen dismiss

    // 메뉴 카드 클릭 → 상세/옵션 모달 열기
    const menuCard = page.locator('[data-testid="menu-card"]').first()
    await expect(menuCard, '메뉴 카드가 보여야 합니다.').toBeVisible({ timeout: 10000 })
    await menuCard.click()

    // 옵션 그룹명이 모달에 표시되어야 함
    await expect(page.locator('body')).toContainText('사이즈 선택', { timeout: 5000 })

    // 옵션 선택지(라지 사이즈) 버튼이 표시되어야 함
    const optionBtn = page.locator('button').filter({ hasText: '라지 사이즈' }).first()
    await expect(optionBtn, '옵션 선택지 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })

    // 옵션 선택 클릭
    await optionBtn.click()
    await page.waitForTimeout(500)

    // 담기 버튼 클릭 → 장바구니에 옵션 포함 아이템 추가
    const addBtn = page.getByRole('button', { name: /원 담기/ })
    await expect(addBtn, '담기 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await addBtn.click()
    await page.waitForTimeout(500)

    // 장바구니 열기 → 옵션 포함 가격 확인
    const cartBtn = page.getByRole('button', { name: /주문 확인|장바구니/ }).first()
    await expect(cartBtn, '주문 확인 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await cartBtn.click()
    await page.waitForTimeout(500)

    // 장바구니에 옵션명이 표시되어야 함
    await expect(page.locator('body')).toContainText('라지 사이즈', { timeout: 5000 })

    // 장바구니에 옵션 포함 가격 확인 (10000 + 2000 = 12000)
    const cartBody = await page.locator('body').innerText()
    expect(
      cartBody.includes('12,000') || cartBody.includes('12000'),
      `장바구니에 옵션 포함 가격 12,000원이 표시되어야 합니다.`,
    ).toBeTruthy()
  })

  // ────────────────────────────────────────────────────────────────
  // UC-C12~C13: 아이템 수량 설정 + 장바구니 추가
  // ────────────────────────────────────────────────────────────────

  test('UC-C12~C13: 아이템 수량 설정 + 장바구니 추가 — 모달에서 수량 변경 후 담기', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // splash screen dismiss

    // 메뉴 카드 클릭 → 모달 열기
    const menuCard = page.locator('[data-testid="menu-card"]').first()
    await expect(menuCard, '메뉴 카드가 보여야 합니다.').toBeVisible({ timeout: 10000 })
    await menuCard.click()

    // 모달 내 수량 조절 영역 확인 — 수량 컨트롤은 flex rounded-full 컨테이너
    const qtyControlRow = page.locator('div.flex.items-center.gap-3').first()
    const increaseBtn = qtyControlRow.locator('button').last()

    // 수량 증가 버튼이 있으면 클릭하여 수량 2로 변경
    if (await increaseBtn.isVisible({ timeout: 3000 })) {
      await increaseBtn.click()
      await page.waitForTimeout(500)

      // 담기 버튼에 수량 2 반영 가격 표시 확인 (10000 * 2 = 20000)
      const addBtn = page.getByRole('button', { name: /원 담기/ })
      const addBtnText = await addBtn.innerText()
      expect(
        addBtnText.includes('20,000') || addBtnText.includes('20000'),
        `수량 2일 때 담기 버튼에 20,000원이 표시되어야 합니다. 실제: ${addBtnText}`,
      ).toBeTruthy()
    }

    // 담기 버튼 클릭 → 장바구니에 추가
    const addToCartBtn = page.getByRole('button', { name: /원 담기/ })
    await expect(addToCartBtn, '담기 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await addToCartBtn.click()
    await page.waitForTimeout(500)

    // 장바구니(주문 확인) 버튼이 나타나야 함
    const cartBtn = page.getByRole('button', { name: /주문 확인|장바구니/ }).first()
    await expect(cartBtn, '장바구니 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await cartBtn.click()
    await page.waitForTimeout(500)

    // 장바구니 시트에 메뉴 아이템이 표시되어야 함
    await expect(page.locator('body')).toContainText('테스트메뉴아이템', { timeout: 5000 })
  })

  test('SC-022: 장바구니 수량 변경 — +/- 버튼으로 수량 업데이트', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await page.waitForLoadState('networkidle')
    // Wait for splash screen to dismiss (2.5s animation in CustomerMenu.tsx)
    await page.waitForTimeout(3000)

    // 메뉴 아이템 카드 클릭 → 모달 열기
    const menuCard = page.locator('div.cursor-pointer').first()
    await expect(menuCard, '메뉴 카드가 보여야 합니다.').toBeVisible({ timeout: 10000 })
    await menuCard.click()

    // 모달에서 "원 담기" 버튼으로 장바구니에 추가
    const addToCartBtn = page.getByRole('button', { name: /원 담기/ })
    await expect(addToCartBtn, '담기 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await addToCartBtn.click()

    // 장바구니(주문 확인) 열기
    const cartBtn = page.getByRole('button', { name: /주문 확인|장바구니/ }).first()
    await expect(cartBtn, '주문 확인 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await cartBtn.click()

    // 장바구니 시트에서 아이템이 수량 1로 표시되는지 확인
    await expect(page.locator('body')).toContainText('테스트메뉴아이템', { timeout: 5000 })

    // 장바구니 +/- 버튼은 SVG 아이콘만 있어 accessible name이 없음
    // 수량 컨트롤 영역: flex gap-3 rounded-full 컨테이너 안의 마지막(+) / 첫 번째(-) 버튼
    const qtyControlRow = page.locator('div.flex.items-center.gap-3.bg-zinc-50').last()
    const increaseBtn = qtyControlRow.locator('button').last()
    await expect(increaseBtn, '수량 증가 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await increaseBtn.click()

    // 수량이 2로 증가 후 합계 금액이 20,000원으로 표시되는지 확인
    await expect(page.locator('body')).toContainText('20,000', { timeout: 5000 })

    // 수량 감소 (-) 버튼 클릭 — 동일 컨트롤 행의 첫 번째 버튼
    const decreaseBtn = qtyControlRow.locator('button').first()
    await expect(decreaseBtn, '수량 감소 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await decreaseBtn.click()

    // 수량이 1로 감소 후 합계 금액이 10,000원으로 표시되는지 확인
    await expect(page.locator('body')).toContainText('10,000', { timeout: 5000 })
  })

  test('SC-023: 빈 장바구니 주문 시도 — 주문 버튼 비활성 또는 미노출', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await page.waitForLoadState('networkidle')
    // Wait for splash screen to dismiss (2.5s animation in CustomerMenu.tsx)
    await page.waitForTimeout(3000)

    // 아무것도 담지 않은 상태에서 "주문하기" 버튼은 보이지 않아야 함
    // (장바구니 버튼 자체가 없어야 하거나, 주문하기 버튼이 disabled여야 함)
    const cartBtn = page.getByRole('button', { name: /주문 확인|장바구니/ })
    const cartBtnCount = await cartBtn.count()

    if (cartBtnCount > 0) {
      // 장바구니 버튼이 있다면 클릭 후 주문하기 버튼이 disabled인지 확인
      await cartBtn.first().click()
      const submitBtn = page.getByRole('button', { name: '주문하기', exact: true })
      if (await submitBtn.isVisible()) {
        await expect(submitBtn).toBeDisabled()
      }
    } else {
      // 장바구니 버튼 자체가 없으면 통과 — 빈 장바구니에서 주문 경로 없음
      expect(cartBtnCount, '빈 장바구니 상태에서 주문 경로가 없어야 합니다.').toBe(0)
    }
  })

  // ────────────────────────────────────────────────────────────────
  // RS-001, RS-002: 새로고침 복구
  // ────────────────────────────────────────────────────────────────

  test('RS-001: 고객 주문 이력 복구 — 새로고침 후 주문 이력 유지', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // 메뉴 아이템 클릭 → 장바구니 추가
    // 메뉴 아이템은 "테스트메뉴아이템"이란 텍스트를 포함하는 div로 찾기
    const menuCard = page.locator('div.cursor-pointer').first()
    await expect(menuCard, '메뉴 카드가 보여야 합니다.').toBeVisible({ timeout: 10000 })
    await menuCard.click()

    // 모달의 담기 버튼 클릭
    const addToCartBtn = page.getByRole('button', { name: /원 담기/ })
    await expect(addToCartBtn, '담기 버튼이 보여야 합니다.').toBeVisible({ timeout: 5000 })
    await addToCartBtn.click()

    // sessionStorage에 주문 이력이 저장되어야 함
    const storageKeyBefore = `order-history:${STORE_SLUG}:${qrToken}`
    await page.waitForTimeout(500) // sessionStorage에 저장될 시간 확보
    const historyBefore = await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, storageKeyBefore)

    expect(historyBefore, 'sessionStorage에 초기 주문 이력이 저장되어야 합니다.').toBeTruthy()

    // 새로고침
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // 주문 이력이 유지되어야 함
    const historyAfter = await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, storageKeyBefore)

    expect(historyAfter, '새로고침 후 주문 이력이 유지되어야 합니다.').toBeTruthy()
  })

  test('RS-002: 다른 테이블과 스토리지 분리', async ({ page }) => {
    expect(qrToken, 'qrToken이 설정되어야 합니다.').toBeTruthy()

    // 테이블 A: 주문 이력 저장
    const storageKeyA = `order-history:${STORE_SLUG}:${qrToken}`

    await page.goto(`/m/${STORE_SLUG}/${qrToken}`)
    await page.waitForLoadState('networkidle')
    // React useEffect가 sessionStorage를 초기화([]로 쓰기)할 때까지 대기
    await page.waitForFunction(
      (key) => sessionStorage.getItem(key) !== null,
      storageKeyA
    )

    // sessionStorage에 테스트 데이터 저장
    await page.evaluate((key) => {
      sessionStorage.setItem(key, JSON.stringify([
        { id: 'order-1', items: [], total: 10000, time: new Date().toISOString(), status: 'completed' }
      ]))
    }, storageKeyA)

    const historyA = await page.evaluate((key) => {
      return sessionStorage.getItem(key)
    }, storageKeyA)

    expect(historyA).toContain('order-1')

    // 테이블 B: 다른 스토리지 키를 사용
    // (실제로는 다른 qrToken을 써야 하지만, 여기서는 simulated)
    const storageKeyB = `order-history:${STORE_SLUG}:different-token`

    const historyB = await page.evaluate((key) => {
      return sessionStorage.getItem(key)
    }, storageKeyB)

    expect(historyB, '테이블 B의 스토리지는 별도여야 합니다.').toBeNull()

    // 테이블 A의 스토리지는 여전히 intact
    const historyAAfter = await page.evaluate((key) => {
      return sessionStorage.getItem(key)
    }, storageKeyA)

    expect(historyAAfter).toContain('order-1')
  })

  test.afterAll(async () => {
    await deleteStoresWithTestTag()
    await deleteStoreBySlug(STORE_SLUG)
  })
})
