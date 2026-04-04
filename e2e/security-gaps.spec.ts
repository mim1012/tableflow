/**
 * P0 보안 갭 E2E 테스트
 * - SEC-E01-06: 크로스테넌트 격리 (Store A→B 데이터 접근 차단)
 * - SEC-E27: 자기 역할 변경 차단
 * - GAP-23: 만료 매장 QR 접속 시 에러 표시
 */
import { test, expect } from '@playwright/test'
import {
  deleteStoreBySlug,
  deleteStoresWithTestTag,
  fillDateRange,
  login,
  loginAndWaitForAdmin,
  loginAndWaitForPasswordChange,
  completePasswordChange,
  markStoreTestData,
  requireEnv,
  getSupabaseConfig,
  getServiceRoleHeaders,
  supabaseGet,
  supabasePost,
  supabaseHeaders,
} from './e2e-helpers'

requireEnv('TEST_SUPERADMIN_EMAIL')
requireEnv('TEST_SUPERADMIN_PASSWORD')

const SUPERADMIN_EMAIL = process.env.TEST_SUPERADMIN_EMAIL!
const SUPERADMIN_PASSWORD = process.env.TEST_SUPERADMIN_PASSWORD!

const ts = Date.now()

// Store A (주 테스트 매장)
const STORE_A_NAME = `보안A매장${ts}`
const STORE_A_SLUG = `sec-a-${ts}`
const OWNER_A_EMAIL = `sec-a-owner-${ts}@tableflow.com`
const OWNER_A_PASSWORD = 'Test1234!@'
const OWNER_A_NEW_PASSWORD = 'Test5678!@'

// Store B (크로스테넌트 대상)
const STORE_B_NAME = `보안B매장${ts}`
const STORE_B_SLUG = `sec-b-${ts}`
const OWNER_B_EMAIL = `sec-b-owner-${ts}@tableflow.com`
const OWNER_B_PASSWORD = 'Test1234!@'
const OWNER_B_NEW_PASSWORD = 'Test5678!@'

// Manager (역할 변경 테스트)
const MANAGER_EMAIL = `sec-mgr-${ts}@tableflow.com`
const MANAGER_PASSWORD = 'Mgr1234!@'
const MANAGER_NEW_PASSWORD = 'Mgr5678!@'

const today = new Date().toISOString().split('T')[0]
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

type StoreRow = { id: string }
type TableRow = { id: string; qr_token: string }
type MemberRow = { id: string; role: string }
type SeedRow = { id: string }
type OrderRow = { id: string; store_id: string }

let storeAId = ''
let storeBId = ''
let storeATableId = ''
let storeAQrToken = ''
let storeBTableId = ''
let storeBOrderId = ''
let storeBMemberId = ''
let managerMemberId = ''
let storeAMenuItemId = ''
let storeAOptionGroupId = ''
let storeAOptionChoiceId = ''
const OPTION_EXTRA_PRICE = 500

test.describe.configure({ mode: 'serial' })

test.describe('P0 보안 갭 E2E (SEC-E01-06, SEC-E27, GAP-23)', () => {
  // ── Setup: Store A 생성 ──
  test('1. 슈퍼어드민 — Store A 생성', async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await expect(page).toHaveURL('/superadmin', { timeout: 10000 })

    await page.getByRole('button', { name: '매장 추가' }).click()
    await expect(page.getByPlaceholder('예) 맛있는 식당')).toBeVisible()

    await page.getByPlaceholder('예) 맛있는 식당').fill(STORE_A_NAME)
    await page.getByPlaceholder('예) tasty-restaurant').fill(STORE_A_SLUG)
    await page.getByPlaceholder('owner@example.com').fill(OWNER_A_EMAIL)
    await page.getByPlaceholder('8자 이상').fill(OWNER_A_PASSWORD)
    await fillDateRange(page, today, nextYear)

    await page.getByRole('button', { name: '매장 생성' }).click()
    await expect(page.getByRole('cell', { name: STORE_A_NAME })).toBeVisible({ timeout: 10000 })
    await markStoreTestData(STORE_A_SLUG)
  })

  // ── Setup: Store B 생성 ──
  test('2. 슈퍼어드민 — Store B 생성', async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
    await expect(page).toHaveURL('/superadmin', { timeout: 10000 })

    await page.getByRole('button', { name: '매장 추가' }).click()
    await expect(page.getByPlaceholder('예) 맛있는 식당')).toBeVisible()

    await page.getByPlaceholder('예) 맛있는 식당').fill(STORE_B_NAME)
    await page.getByPlaceholder('예) tasty-restaurant').fill(STORE_B_SLUG)
    await page.getByPlaceholder('owner@example.com').fill(OWNER_B_EMAIL)
    await page.getByPlaceholder('8자 이상').fill(OWNER_B_PASSWORD)
    await fillDateRange(page, today, nextYear)

    await page.getByRole('button', { name: '매장 생성' }).click()
    await expect(page.getByRole('cell', { name: STORE_B_NAME })).toBeVisible({ timeout: 10000 })
    await markStoreTestData(STORE_B_SLUG)
  })

  // ── Setup: Owner A 비번 변경 ──
  test('3. Owner A 첫 로그인 → 비번 변경', async ({ page }) => {
    await loginAndWaitForPasswordChange(page, OWNER_A_EMAIL, OWNER_A_PASSWORD)
    await completePasswordChange(page, OWNER_A_NEW_PASSWORD)
  })

  // ── Setup: Owner B 비번 변경 ──
  test('4. Owner B 첫 로그인 → 비번 변경', async ({ page }) => {
    await loginAndWaitForPasswordChange(page, OWNER_B_EMAIL, OWNER_B_PASSWORD)
    await completePasswordChange(page, OWNER_B_NEW_PASSWORD)
  })

  // ── Setup: Store ID + Table ID 추출 + Store B에 주문 seed ──
  test('5. 매장/테이블 정보 추출 + 테스트 데이터 seed', async ({ page }) => {
    // Store A 정보
    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    const storeARows = await supabaseGet<StoreRow>(
      page,
      `stores?select=id&slug=eq.${encodeURIComponent(STORE_A_SLUG)}&limit=1`,
    )
    expect(storeARows.length).toBeGreaterThan(0)
    storeAId = storeARows[0].id

    const tableARows = await supabaseGet<TableRow>(
      page,
      `tables?select=id,qr_token&store_id=eq.${storeAId}&order=table_number.asc&limit=1`,
    )
    expect(tableARows.length).toBeGreaterThan(0)
    storeATableId = tableARows[0].id
    storeAQrToken = tableARows[0].qr_token

    // Store B 정보 (service role로 조회)
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    const { url } = getSupabaseConfig()
    const storeBRes = await fetch(
      `${url}/rest/v1/stores?select=id&slug=eq.${encodeURIComponent(STORE_B_SLUG)}&limit=1`,
      { headers: serviceHeaders! },
    )
    const storeBRows = (await storeBRes.json()) as StoreRow[]
    expect(storeBRows.length).toBeGreaterThan(0)
    storeBId = storeBRows[0].id

    const tableBRes = await fetch(
      `${url}/rest/v1/tables?select=id,qr_token&store_id=eq.${storeBId}&order=table_number.asc&limit=1`,
      { headers: serviceHeaders! },
    )
    const tableBRows = (await tableBRes.json()) as TableRow[]
    expect(tableBRows.length).toBeGreaterThan(0)
    storeBTableId = tableBRows[0].id

    // Store B에 메뉴 + 주문 seed (service role)
    const catRes = await fetch(`${url}/rest/v1/menu_categories`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({ store_id: storeBId, name: 'B카테고리', sort_order: 1 }),
    })
    const catRows = (await catRes.json()) as SeedRow[]
    const catId = catRows[0].id

    const itemRes = await fetch(`${url}/rest/v1/menu_items`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeBId,
        category_id: catId,
        name: 'B테스트메뉴',
        price: 10000,
        is_available: true,
        sort_order: 1,
      }),
    })
    const itemRows = (await itemRes.json()) as SeedRow[]

    // Store B 주문 생성 (service role)
    const orderRes = await fetch(`${url}/rest/v1/orders`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeBId,
        table_id: storeBTableId,
        status: 'created',
        subtotal_price: 10000,
        total_price: 10000,
      }),
    })
    const orderRows = (await orderRes.json()) as SeedRow[]
    expect(orderRows.length).toBeGreaterThan(0)
    storeBOrderId = orderRows[0].id

    // Store B owner member ID 추출 (SEC-E05 삭제 차단 테스트용)
    const memberBRes = await fetch(
      `${url}/rest/v1/store_members?select=id,role&store_id=eq.${storeBId}&limit=1`,
      { headers: serviceHeaders! },
    )
    const memberBRows = (await memberBRes.json()) as MemberRow[]
    if (memberBRows.length > 0) {
      storeBMemberId = memberBRows[0].id
    }

    // Store A에 옵션 메뉴 seed (SEC-E15 + GAP-07 테스트용)
    // 카테고리가 없으면 생성
    const catARes = await fetch(`${url}/rest/v1/menu_categories`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({ store_id: storeAId, name: '옵션테스트', sort_order: 99 }),
    })
    const catARows = (await catARes.json()) as SeedRow[]
    const catAId = catARows[0].id

    const itemARes = await fetch(`${url}/rest/v1/menu_items`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeAId,
        category_id: catAId,
        name: '옵션테스트메뉴',
        price: 8000,
        is_available: true,
        sort_order: 1,
      }),
    })
    const itemARows = (await itemARes.json()) as SeedRow[]
    storeAMenuItemId = itemARows[0].id

    // 옵션 그룹 + 옵션 선택지 생성
    const ogRes = await fetch(`${url}/rest/v1/option_groups`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeAId,
        menu_item_id: storeAMenuItemId,
        name: '토핑',
        is_required: false,
        max_select: 1,
        sort_order: 1,
      }),
    })
    const ogRows = (await ogRes.json()) as SeedRow[]
    storeAOptionGroupId = ogRows[0].id

    const ocRes = await fetch(`${url}/rest/v1/option_choices`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeAId,
        option_group_id: storeAOptionGroupId,
        name: '치즈추가',
        extra_price: OPTION_EXTRA_PRICE,
        sort_order: 1,
      }),
    })
    const ocRows = (await ocRes.json()) as SeedRow[]
    storeAOptionChoiceId = ocRows[0].id
  })

  // ────────────────────────────────────────────────────────────
  // SEC-E01-05: 크로스테넌트 데이터 접근 차단
  // ────────────────────────────────────────────────────────────

  test('SEC-E01: Store A 점주가 Store B 주문 조회 차단', async ({ page }) => {
    test.skip(!storeBId, '테스트 5에서 service role 미설정으로 Store B 데이터 없음')
    expect(storeBOrderId).toBeTruthy()

    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    // Owner A 토큰으로 Store B 주문 직접 조회 시도
    const orders = await supabaseGet<OrderRow>(
      page,
      `orders?select=id,store_id&id=eq.${storeBOrderId}`,
    )

    // RLS에 의해 빈 배열이거나, store_id가 Store B가 아닌 결과만 반환
    const leakedOrders = orders.filter((o) => o.store_id === storeBId)
    expect(
      leakedOrders.length,
      'Store A 점주는 Store B 주문을 조회할 수 없어야 합니다 (RLS 격리)',
    ).toBe(0)
  })

  test('SEC-E02: Store A 점주가 Store B 주문 상태 변경 차단', async ({ page }) => {
    test.skip(!storeBOrderId, 'Store B 데이터 없음 (service role 미설정)')

    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)

    const { url } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    // Owner A 토큰으로 Store B 주문 상태 변경 시도
    const patchRes = await fetch(
      `${url}/rest/v1/orders?id=eq.${storeBOrderId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'preparing' }),
      },
    )

    // 변경 후 Store B 주문 상태 확인 (service role)
    const serviceHeaders = getServiceRoleHeaders()!
    const checkRes = await fetch(
      `${url}/rest/v1/orders?select=status&id=eq.${storeBOrderId}`,
      { headers: serviceHeaders },
    )
    const rows = (await checkRes.json()) as Array<{ status: string }>
    expect(rows.length).toBeGreaterThan(0)
    expect(
      rows[0].status,
      'Store A 점주가 Store B 주문 상태를 변경할 수 없어야 합니다',
    ).toBe('created')
  })

  test('SEC-E03: Store A 점주가 Store B 주문 삭제 차단', async ({ page }) => {
    test.skip(!storeBOrderId, 'Store B 데이터 없음 (service role 미설정)')

    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)

    const { url } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    // Owner A 토큰으로 Store B 주문 삭제 시도
    await fetch(`${url}/rest/v1/orders?id=eq.${storeBOrderId}`, {
      method: 'DELETE',
      headers,
    })

    // 삭제되지 않았는지 확인 (service role)
    const serviceHeaders = getServiceRoleHeaders()!
    const checkRes = await fetch(
      `${url}/rest/v1/orders?select=id&id=eq.${storeBOrderId}`,
      { headers: serviceHeaders },
    )
    const rows = (await checkRes.json()) as SeedRow[]
    expect(
      rows.length,
      'Store A 점주가 Store B 주문을 삭제할 수 없어야 합니다',
    ).toBeGreaterThan(0)
  })

  test('SEC-E04: Store A 점주가 Store B 직원 목록 조회 차단', async ({ page }) => {
    test.skip(!storeBId, 'Store B 데이터 없음 (service role 미설정)')

    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)

    const members = await supabaseGet<MemberRow>(
      page,
      `store_members?select=id,role&store_id=eq.${storeBId}`,
    )

    expect(
      members.length,
      'Store A 점주는 Store B 직원 목록을 조회할 수 없어야 합니다',
    ).toBe(0)
  })

  test('SEC-E05: Store A 점주가 Store B 직원 삭제 차단', async ({ page }) => {
    test.skip(!storeBMemberId, 'Store B 멤버 데이터 없음 (service role 미설정)')

    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)

    const { url } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    // Owner A 토큰으로 Store B 직원 삭제 시도
    await fetch(`${url}/rest/v1/store_members?id=eq.${storeBMemberId}`, {
      method: 'DELETE',
      headers,
    })

    // 삭제되지 않았는지 확인 (service role)
    const serviceHeaders = getServiceRoleHeaders()!
    const checkRes = await fetch(
      `${url}/rest/v1/store_members?select=id&id=eq.${storeBMemberId}`,
      { headers: serviceHeaders },
    )
    const rows = (await checkRes.json()) as SeedRow[]
    expect(
      rows.length,
      'Store A 점주가 Store B 직원을 삭제할 수 없어야 합니다 (RLS 격리)',
    ).toBeGreaterThan(0)
  })

  test('SEC-E06: Store A 점주가 Store B 매출 조회 차단', async ({ page }) => {
    test.skip(!storeBId, 'Store B 데이터 없음 (service role 미설정)')

    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)

    // Store B의 주문 데이터로 매출 산출 시도
    const orders = await supabaseGet<{ total_price: number }>(
      page,
      `orders?select=total_price&store_id=eq.${storeBId}`,
    )

    expect(
      orders.length,
      'Store A 점주는 Store B 매출 데이터를 조회할 수 없어야 합니다',
    ).toBe(0)
  })

  // ────────────────────────────────────────────────────────────
  // SEC-E27: 자기 역할 변경 차단
  // ────────────────────────────────────────────────────────────

  test('6. Store A에 매니저 계정 생성', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    // 사이드바 → 매장 관리 → 직원 관리
    const mgmtBtn = page.locator('aside button').filter({ hasText: /매장 관리/ }).first()
    await expect(mgmtBtn).toBeVisible({ timeout: 8000 })
    await mgmtBtn.click()

    const staffBtn = page.locator('aside button').filter({ hasText: /직원/ }).first()
    await expect(staffBtn).toBeVisible({ timeout: 8000 })
    await staffBtn.click()

    const addBtn = page.locator('button').filter({ hasText: '직원 추가' }).first()
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    await expect(page.getByPlaceholder('홍길동')).toBeVisible()
    await page.getByPlaceholder('홍길동').fill('테스트매니저')
    await page.getByPlaceholder('staff@example.com').fill(MANAGER_EMAIL)
    await page.getByPlaceholder('특수문자 포함 8자 이상').fill(MANAGER_PASSWORD)

    // 역할 선택 (manager) — 버튼 그리드 UI
    const managerRoleBtn = page.locator('button[type="button"]').filter({ hasText: '매니저' }).first()
    if (await managerRoleBtn.isVisible({ timeout: 3000 })) {
      await managerRoleBtn.click()
      await page.waitForTimeout(300)
    }

    await page.locator('button[type="submit"]').filter({ hasText: '직원 추가' }).click()
    await expect(page.locator('body')).toContainText(MANAGER_EMAIL, { timeout: 10000 })

    // 매니저 member ID 추출
    const members = await supabaseGet<MemberRow>(
      page,
      `store_members?select=id,role&store_id=eq.${storeAId}&user_id=not.is.null`,
    )
    const managerMember = members.find((m) => m.role === 'manager')
    if (managerMember) {
      managerMemberId = managerMember.id
    }
  })

  test('SEC-E27: 매니저가 자기 역할을 owner로 변경 시도 차단', async ({ page }) => {
    test.skip(!managerMemberId, '매니저 계정이 생성되지 않음')
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    // 매니저로 로그인
    await login(page, MANAGER_EMAIL, MANAGER_PASSWORD)
    await page.waitForLoadState('networkidle')
    if (page.url().includes('change-password')) {
      await completePasswordChange(page, MANAGER_NEW_PASSWORD)
    } else {
      await expect(page).toHaveURL('/admin', { timeout: 15000 })
    }

    const { url } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    // 매니저 토큰으로 자기 역할을 owner로 변경 시도
    const patchRes = await fetch(
      `${url}/rest/v1/store_members?id=eq.${managerMemberId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: 'owner' }),
      },
    )

    // 변경 후 실제 역할 확인 (service role — 위에서 skip 처리됨)
    const checkRes = await fetch(
      `${url}/rest/v1/store_members?select=role&id=eq.${managerMemberId}`,
      { headers: serviceHeaders! },
    )
    const rows = (await checkRes.json()) as Array<{ role: string }>
    expect(rows.length).toBeGreaterThan(0)
    expect(
      rows[0].role,
      '매니저가 자기 역할을 owner로 변경할 수 없어야 합니다 (RLS 차단)',
    ).not.toBe('owner')
  })

  // ────────────────────────────────────────────────────────────
  // GAP-23: 만료 매장 QR 접속 시 에러 표시
  // ────────────────────────────────────────────────────────────

  test('GAP-23: 만료 매장 QR 스캔 시 고객 에러 화면 표시', async ({ page }) => {
    expect(storeAId).toBeTruthy()
    expect(storeAQrToken).toBeTruthy()

    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    const { url } = getSupabaseConfig()

    // Store A를 만료 처리
    const expireRes = await fetch(`${url}/rest/v1/stores?id=eq.${storeAId}`, {
      method: 'PATCH',
      headers: serviceHeaders!,
      body: JSON.stringify({ subscription_end: '2025-01-01' }),
    })
    expect(expireRes.ok).toBeTruthy()

    // 고객(비로그인)이 만료 매장 QR로 접속
    const anonCtx = await page.context().browser()!.newContext()
    const anonPage = await anonCtx.newPage()

    await anonPage.goto(`/m/${STORE_A_SLUG}/${storeAQrToken}`)
    await anonPage.waitForLoadState('networkidle')
    await anonPage.waitForTimeout(3000)

    // 에러 메시지 또는 메뉴 미표시 확인
    const bodyText = await anonPage.locator('body').innerText()
    const hasError =
      bodyText.includes('만료') ||
      bodyText.includes('이용할 수 없') ||
      bodyText.includes('오류') ||
      bodyText.includes('찾을 수 없')

    const menuItemCount = await anonPage.locator('div.cursor-pointer').count()

    expect(
      hasError || menuItemCount === 0,
      '만료 매장 QR 접속 시 에러 메시지를 표시하거나 메뉴를 표시하지 않아야 합니다',
    ).toBeTruthy()

    await anonCtx.close()

    // 복구
    await fetch(`${url}/rest/v1/stores?id=eq.${storeAId}`, {
      method: 'PATCH',
      headers: serviceHeaders!,
      body: JSON.stringify({ subscription_end: nextYear }),
    })
  })

  // ────────────────────────────────────────────────────────────
  // SEC-E15: 옵션 가격 조작 방지 (enforce_menu_item_price trigger)
  // ────────────────────────────────────────────────────────────

  test('SEC-E15: 클라이언트가 옵션 extra_price=0으로 보내도 서버가 실제 가격 적용', async ({ page }) => {
    test.skip(!storeAMenuItemId, 'Store A 옵션 메뉴 seed 안 됨')
    test.skip(!storeAOptionChoiceId, 'Store A 옵션 선택지 seed 안 됨')
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    const { url } = getSupabaseConfig()

    // Owner A 토큰으로 옵션 가격 조작 주문 시도
    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)
    const ownerHeaders = await supabaseHeaders(page)

    const orderRes = await fetch(`${url}/rest/v1/rpc/create_order_atomic`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        p_store_id: storeAId,
        p_table_id: storeATableId,
        p_items: [{
          menu_item_id: storeAMenuItemId,
          quantity: 2,
          selected_options: [{
            option_choice_id: storeAOptionChoiceId,
            name: '치즈추가',
            extra_price: 0,  // 조작: 실제 500원인데 0원으로 전송
          }],
        }],
      }),
    })
    expect(orderRes.ok, '주문 생성 성공').toBeTruthy()

    const orderId = await orderRes.json()
    expect(typeof orderId).toBe('string')
    expect(orderId).toBeTruthy()

    // order_items에서 실제 저장된 가격 확인 (service role)
    const itemsRes = await fetch(
      `${url}/rest/v1/order_items?select=unit_price,total_price,selected_options&order_id=eq.${orderId}`,
      { headers: serviceHeaders! },
    )
    const items = (await itemsRes.json()) as Array<{
      unit_price: number
      total_price: number
      selected_options: Array<{ extra_price: number }>
    }>
    expect(items.length).toBeGreaterThan(0)

    const item = items[0]

    // 서버가 실제 가격(500)을 적용했는지 검증
    expect(
      item.selected_options[0].extra_price,
      `옵션 가격이 서버에서 실제 가격(${OPTION_EXTRA_PRICE})으로 교정되어야 합니다`,
    ).toBe(OPTION_EXTRA_PRICE)

    // total_price = (base_price + option_extra) * quantity = (8000 + 500) * 2 = 17000
    const expectedTotal = (8000 + OPTION_EXTRA_PRICE) * 2
    expect(
      item.total_price,
      `total_price가 (8000 + ${OPTION_EXTRA_PRICE}) * 2 = ${expectedTotal}이어야 합니다`,
    ).toBe(expectedTotal)
  })

  // ────────────────────────────────────────────────────────────
  // GAP-07: 옵션 포함 주문 전체 플로우
  // ────────────────────────────────────────────────────────────

  test('GAP-07: 옵션 포함 주문 생성 → 저장 검증', async ({ page }) => {
    test.skip(!storeAMenuItemId, 'Store A 옵션 메뉴 seed 안 됨')
    test.skip(!storeAOptionChoiceId, 'Store A 옵션 선택지 seed 안 됨')
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    const { url } = getSupabaseConfig()

    // Owner A 토큰으로 옵션 포함 주문 (정상 가격 전송)
    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)
    const ownerHeaders = await supabaseHeaders(page)

    const orderRes = await fetch(`${url}/rest/v1/rpc/create_order_atomic`, {
      method: 'POST',
      headers: ownerHeaders,
      body: JSON.stringify({
        p_store_id: storeAId,
        p_table_id: storeATableId,
        p_items: [{
          menu_item_id: storeAMenuItemId,
          quantity: 1,
          selected_options: [{
            option_choice_id: storeAOptionChoiceId,
            name: '치즈추가',
            extra_price: OPTION_EXTRA_PRICE,
          }],
        }],
      }),
    })
    expect(orderRes.ok, '옵션 포함 주문 생성 성공').toBeTruthy()

    const orderId = await orderRes.json()
    expect(typeof orderId).toBe('string')
    expect(orderId).toBeTruthy()

    // order_items 검증 (service role)
    const itemsRes = await fetch(
      `${url}/rest/v1/order_items?select=unit_price,total_price,selected_options,menu_item_name&order_id=eq.${orderId}`,
      { headers: serviceHeaders! },
    )
    const items = (await itemsRes.json()) as Array<{
      unit_price: number
      total_price: number
      menu_item_name: string
      selected_options: Array<{ name: string; extra_price: number; option_choice_id: string }>
    }>
    expect(items.length, '주문 아이템이 1개 존재해야 합니다').toBe(1)

    const item = items[0]

    // 기본 가격 검증
    expect(item.unit_price, '기본 가격 8000원').toBe(8000)

    // 옵션 데이터 검증
    expect(item.selected_options, '옵션 데이터가 존재해야 합니다').toBeTruthy()
    expect(item.selected_options.length, '옵션 1개').toBe(1)
    expect(item.selected_options[0].name, '옵션 이름').toBe('치즈추가')
    expect(item.selected_options[0].extra_price, '옵션 추가금').toBe(OPTION_EXTRA_PRICE)
    expect(item.selected_options[0].option_choice_id, '옵션 선택지 ID').toBe(storeAOptionChoiceId)

    // total_price = (8000 + 500) * 1 = 8500
    expect(item.total_price, 'total_price = 8500').toBe(8000 + OPTION_EXTRA_PRICE)
  })

  // ────────────────────────────────────────────────────────────
  // SEC-E22: store_settings RLS staff block
  // ────────────────────────────────────────────────────────────

  test('SEC-E22: staff가 store_settings UPDATE 차단 확인', async ({ page }) => {
    // This test verifies store_settings RLS restricts mutations to owner/manager
    // After migration: staff token UPDATE → rejected by RLS
    // Before migration: staff token UPDATE → allowed (vulnerability)

    test.skip(!storeAId, 'Store A 데이터 없음')
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    const { url } = getSupabaseConfig()

    // Check if store_settings row exists for Store A
    const settingsRes = await fetch(
      `${url}/rest/v1/store_settings?select=id&store_id=eq.${storeAId}&limit=1`,
      { headers: serviceHeaders! },
    )
    const settingsRows = (await settingsRes.json()) as Array<{ id: string }>

    if (settingsRows.length === 0) {
      // Create store_settings if not exists
      await fetch(`${url}/rest/v1/store_settings`, {
        method: 'POST',
        headers: { ...serviceHeaders!, Prefer: 'return=representation' },
        body: JSON.stringify({ store_id: storeAId }),
      })
    }

    // Login as owner — owner should be able to read store_settings
    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)
    const ownerHeaders = await supabaseHeaders(page)

    const readRes = await fetch(
      `${url}/rest/v1/store_settings?select=id&store_id=eq.${storeAId}`,
      { headers: ownerHeaders },
    )
    expect(readRes.ok, 'Owner는 store_settings를 조회할 수 있어야 합니다').toBeTruthy()

    // Login as manager and attempt UPDATE on store_settings
    // After migration: only owner can mutate; manager UPDATE is also restricted for certain fields
    await login(page, MANAGER_EMAIL, MANAGER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')
    if (page.url().includes('change-password')) {
      await completePasswordChange(page, MANAGER_NEW_PASSWORD)
    }

    const managerHeaders = await supabaseHeaders(page)

    const updateRes = await fetch(
      `${url}/rest/v1/store_settings?store_id=eq.${storeAId}`,
      {
        method: 'PATCH',
        headers: managerHeaders,
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      },
    )

    // After migration (20260324000002): staff/manager UPDATE on store_settings must be blocked by RLS
    expect(
      updateRes.ok,
      `store_settings UPDATE가 차단되지 않음 (HTTP ${updateRes.status}) — 마이그레이션 20260324000002 적용 확인 필요`,
    ).toBeFalsy()
    expect(updateRes.status, 'store_settings UPDATE가 >= 400을 반환해야 합니다 (RLS)').toBeGreaterThanOrEqual(400)
  })

  // ────────────────────────────────────────────────────────────
  // SEC-E25: Rate limit test
  // ────────────────────────────────────────────────────────────

  test('SEC-E25: 동일 테이블 1분 내 과도한 주문 차단 (rate limit)', async ({ page }) => {
    test.skip(!storeAId, 'Store A 데이터 없음')
    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    const { url } = getSupabaseConfig()

    // Get Store A table
    const tablesRes = await fetch(
      `${url}/rest/v1/tables?select=id&store_id=eq.${storeAId}&limit=1`,
      { headers: serviceHeaders! },
    )
    const tableRows = (await tablesRes.json()) as Array<{ id: string }>
    test.skip(tableRows.length === 0, 'Store A에 테이블 없음')
    const testTableId = tableRows[0].id

    // Get a menu item for Store A
    const itemsRes = await fetch(
      `${url}/rest/v1/menu_items?select=id&store_id=eq.${storeAId}&is_available=eq.true&is_deleted=eq.false&limit=1`,
      { headers: serviceHeaders! },
    )
    const itemRows = (await itemsRes.json()) as Array<{ id: string }>

    let menuItemId: string

    if (itemRows.length === 0) {
      // Seed a menu item
      const catRes = await fetch(`${url}/rest/v1/menu_categories`, {
        method: 'POST',
        headers: { ...serviceHeaders!, Prefer: 'return=representation' },
        body: JSON.stringify({ store_id: storeAId, name: 'RateTest', sort_order: 99 }),
      })
      const cats = (await catRes.json()) as Array<{ id: string }>

      const itemRes = await fetch(`${url}/rest/v1/menu_items`, {
        method: 'POST',
        headers: { ...serviceHeaders!, Prefer: 'return=representation' },
        body: JSON.stringify({
          store_id: storeAId,
          category_id: cats[0].id,
          name: 'RateTestItem',
          price: 1000,
          is_available: true,
          sort_order: 1,
        }),
      })
      const newItems = (await itemRes.json()) as Array<{ id: string }>
      menuItemId = newItems[0].id
    } else {
      menuItemId = itemRows[0].id
    }

    // Owner 토큰으로 주문 생성 (anon은 is_store_accessible 필요, service role은 auth.uid()=null)
    await loginAndWaitForAdmin(page, OWNER_A_EMAIL, OWNER_A_NEW_PASSWORD)
    const ownerHeaders = await supabaseHeaders(page)

    // Fire 16 orders rapidly via create_order_atomic (limit = 15/min)
    const results: number[] = []
    for (let i = 0; i < 16; i++) {
      const res = await fetch(`${url}/rest/v1/rpc/create_order_atomic`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          p_store_id: storeAId,
          p_table_id: testTableId,
          p_items: [{ menu_item_id: menuItemId, quantity: 1 }],
        }),
      })
      results.push(res.status)
    }

    // After migration (20260324000003-009): rate limit = 15 orders/min
    // 처음 15건은 성공, 16번째부터 차단되어야 합니다
    const successCount = results.filter((s) => s === 200).length
    const failedCount = results.filter((s) => s !== 200).length

    expect(
      failedCount,
      `Rate limit 미작동: ${successCount}/16건이 성공. 마이그레이션 20260324000003-009 적용 확인 필요`,
    ).toBeGreaterThan(0)
    expect(results[15], '16번째 주문은 rate limit으로 차단되어야 합니다').not.toBe(200)
  })

  test.afterAll(async () => {
    await deleteStoresWithTestTag()
    await deleteStoreBySlug(STORE_A_SLUG)
    await deleteStoreBySlug(STORE_B_SLUG)
  })
})
