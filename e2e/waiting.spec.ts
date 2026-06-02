import { test, expect } from '@playwright/test'
import {
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  clickSidebarButton,
  completePasswordChange,
  deleteStoresWithTestTag,
  deleteStoreBySlug,
  fillDateRange,
  fillSuperadminCreateStoreForm,
  getServiceRoleHeaders,
  markStoreTestData,
  login,
  loginAndWaitForAdmin,
  loginAndWaitForPasswordChange,
  lookupStoreByName,
  getSupabaseConfig,
  supabaseHeaders,
  supabaseGet,
  supabasePost,
} from './e2e-helpers'

if (!SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) {
  throw new Error('TEST_SUPERADMIN_EMAIL and TEST_SUPERADMIN_PASSWORD must be set.')
}

const ts = Date.now()
const STORE_NAME = `대기테스트매장${ts}`
const OWNER_EMAIL = `waiting-owner-${ts}@tableflow.com`
const OWNER_PASSWORD = 'Test1234!@'
const OWNER_NEW_PASSWORD = 'Test5678!@'

const today = new Date().toISOString().split('T')[0]
const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

type StoreRow = { id: string; slug: string }
type WaitingRow = { id: string; phone: string; party_size: number; queue_number: number; status: string }
type TableRow = { id: string; table_number: number }
type StaffCallVerifyRow = { id: string; status: string; resolved_at: string | null; option_name: string }

let storeId = ''
let storeSlug = ''

test.describe.configure({ mode: 'serial' })

test.describe('SC-026/SC-027 대기 키오스크 E2E', () => {
  test('1. 슈퍼어드민 — 매장 생성', async ({ page }) => {
    await login(page, SUPERADMIN_EMAIL!, SUPERADMIN_PASSWORD!)
    await expect(page).toHaveURL('/superadmin', { timeout: 10000 })

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

  test('2. 점주 첫 로그인 → 비밀번호 변경', async ({ page }) => {
    await loginAndWaitForPasswordChange(page, OWNER_EMAIL, OWNER_PASSWORD)
    await completePasswordChange(page, OWNER_NEW_PASSWORD)
  })

  test('3. storeId 추출', async ({ page }) => {
    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    const store = await lookupStoreByName<StoreRow>(page, STORE_NAME)
    storeId = store.id
    storeSlug = store.slug
  })

  test('SC-026: 대기 키오스크 UI — 전화번호 키패드 + 인원 선택 화면 검증', async ({ page }) => {
    // /waiting/:storeSlug 접근 (비로그인 공개 페이지)
    await page.goto(`/waiting/${storeSlug}`)
    await page.waitForLoadState('networkidle')

    // Step 1: 전화번호 키패드 화면 확인
    await expect(page.getByRole('heading', { name: /연락처를 입력/ })).toBeVisible({ timeout: 8000 })

    // 숫자 키패드 입력 (010-1234-5678)
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }

    // 전화번호 포맷 확인
    await expect(page.locator('body')).toContainText('010-1234-5678', { timeout: 3000 })

    // "다음" 버튼 클릭
    await page.getByRole('button', { name: '다음', exact: true }).click()

    // Step 2: 인원 선택 화면 확인
    await expect(page.getByRole('heading', { name: /방문 인원/ })).toBeVisible({ timeout: 5000 })

    // +1 → 3명
    await page.getByRole('button', { name: '+', exact: true }).click()
    await expect(page.locator('body')).toContainText('3', { timeout: 3000 })

    // "대기 등록 완료하기" 버튼 존재 확인
    await expect(page.getByRole('button', { name: '대기 등록 완료하기' })).toBeVisible()
  })

  test('SC-026/027: 대기 등록 API 검증 — atomic RPC + 조회', async ({ page }) => {
    expect(storeId).toBeTruthy()

    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)

    const { url: supabaseUrl } = getSupabaseConfig()
    const headers = await supabaseHeaders(page)

    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/create_waiting_atomic`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_store_id: storeId, p_phone: '01012345678', p_party_size: 3 }),
    })

    if (!rpcRes.ok) {
      const errText = await rpcRes.text()
      throw new Error(`create_waiting_atomic RPC 실패 (${rpcRes.status}): ${errText}`)
    }

    const payload = await rpcRes.json() as { queue_number: number; waiting_id: string }
    expect(payload.queue_number, '대기 번호가 양수여야 합니다.').toBeGreaterThan(0)
    expect(payload.waiting_id, 'waiting_id가 반환되어야 합니다.').toBeTruthy()

    const readRows = await supabaseGet<WaitingRow>(
      page,
      `waitings?select=id,phone,party_size,queue_number,status&id=eq.${payload.waiting_id}&limit=1`
    )
    expect(readRows.length).toBeGreaterThan(0)

    const entry = readRows[0]
    expect(entry.phone).toBe('01012345678')
    expect(entry.party_size).toBe(3)
    expect(entry.queue_number).toBe(payload.queue_number)
    expect(entry.status).toBe('waiting')
    expect(readRows[0].phone).toBe('01012345678')
    expect(readRows[0].queue_number).toBeGreaterThan(0)
  })

  // ────────────────────────────────────────────────────────────────
  // RS-003, RS-004: 새로고침 복구
  // ────────────────────────────────────────────────────────────────

  test('RS-003: 손상된 sessionStorage 복구', async ({ page }) => {
    // /waiting/:storeSlug로 접근
    await page.goto(`/waiting/${storeSlug}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000) // 페이지 완전 렌더링 확보

    // sessionStorage에 invalid JSON을 저장
    const storageKey = `waiting:${storeSlug}`
    await page.evaluate((key) => {
      sessionStorage.setItem(key, 'INVALID_JSON_{')
    }, storageKey)

    // 새로고침
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // 앱이 크래시하지 않고 초기 상태로 복구되어야 함
    // 헤딩이 나타나거나, 연락처/인원/등록 중 하나라도 보여야 함
    const heading = page.getByRole('heading')
    await expect(heading.first()).toBeVisible({ timeout: 5000 })
  })

  test('RS-004: 대기 등록 후 새로고침 시 상태 복구', async ({ page }) => {
    // /waiting/:storeSlug에서 대기 등록 (step 3까지 진행)
    await page.goto(`/waiting/${storeSlug}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    // step 1: 전화번호 입력
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      // CSS text selector로 숫자 버튼 찾기
      const btnLocator = page.locator(`button:has-text("${digit}")`).first()
      await expect(btnLocator, `숫자 ${digit} 버튼이 보여야 합니다`).toBeVisible({ timeout: 8000 })
      await btnLocator.click()
      await page.waitForTimeout(100) // 각 입력 후 짧은 대기
    }

    const nextBtn = page.getByRole('button', { name: '다음', exact: true })
    await expect(nextBtn).toBeVisible({ timeout: 5000 })
    await nextBtn.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    // step 2: 인원 선택
    const plusBtn = page.getByRole('button', { name: '+', exact: true })
    await expect(plusBtn).toBeVisible({ timeout: 5000 })
    await plusBtn.click()
    await page.waitForTimeout(500)

    const submitBtn = page.getByRole('button', { name: '대기 등록 완료하기' })
    await expect(submitBtn).toBeVisible({ timeout: 5000 })
    await expect(submitBtn).toBeEnabled({ timeout: 8000 })
    await submitBtn.click()

    // API 응답 대기
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // step 3: 완료 상태 확인 - 더 유연한 heading 선택
    const headings = page.locator('h1, h2, h3, h4, h5, h6')
    await expect(headings.first()).toBeVisible({ timeout: 10000 })

    const pageText = await page.locator('body').innerText()
    expect(pageText).toMatch(/완료|등록|확인/i)

    // step 3 달성 확인 (새로고침 전)
    await expect(page.getByRole('heading', { name: /대기 완료|완료|등록 완료/ })).toBeVisible({ timeout: 10000 })

    // sessionStorage 확인 (새로고침 전)
    const storageKeyPre = `waiting:${storeSlug}`
    const savedBeforeReload = await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, storageKeyPre)
    expect(savedBeforeReload?.step, '새로고침 전 step=3이 저장되어야 합니다.').toBe(3)

    // 새로고침
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 완료 화면이 유지되어야 함
    const completeAfter = await page.getByRole('heading', { name: /대기 완료|완료|등록 완료/ }).isVisible()
    expect(completeAfter, '새로고침 후 대기 완료 상태가 유지되어야 합니다.').toBeTruthy()

    // sessionStorage에 저장된 대기ID가 존재해야 함
    const storageKey = `waiting:${storeSlug}`
    const saved = await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, storageKey)

    expect(saved, 'sessionStorage에 대기 정보가 저장되어야 합니다.').not.toBeNull()
    expect(saved?.waitingId, '대기ID가 저장되어야 합니다.').toBeTruthy()
  })

  test('SC-027A: 대기 취소 후 같은 번호 재등록 시 새 번호를 받는다', async ({ page }) => {
    expect(storeId).toBeTruthy()

    await page.goto(`/waiting/${storeSlug}`)
    await page.waitForLoadState('networkidle')

    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      await page.locator(`button:has-text("${digit}")`).first().click()
    }

    await page.getByRole('button', { name: '다음', exact: true }).click()
    await page.getByRole('button', { name: '대기 등록 완료하기' }).click()
    await expect(page.getByRole('heading', { name: /대기 등록이 완료되었습니다!/ })).toBeVisible({ timeout: 10000 })

    const storageKey = `waiting:${storeSlug}`
    const firstSaved = await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, storageKey)
    expect(firstSaved?.waitingId).toBeTruthy()
    expect(firstSaved?.queueNumber).toBeGreaterThan(0)

    await page.getByRole('button', { name: '대기 취소하기' }).click()
    await expect(page.getByRole('heading', { name: /연락받을 휴대폰 번호를 입력해 주세요/ })).toBeVisible({ timeout: 10000 })

    const cancelledRows = await supabaseGet<WaitingRow>(
      page,
      `waitings?select=id,queue_number,status&id=eq.${firstSaved.waitingId}&limit=1`,
    )
    expect(cancelledRows[0]?.status).toBe('cancelled')

    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      await page.locator(`button:has-text("${digit}")`).first().click()
    }

    await page.getByRole('button', { name: '다음', exact: true }).click()
    await page.getByRole('button', { name: '대기 등록 완료하기' }).click()
    await expect(page.getByRole('heading', { name: /대기 등록이 완료되었습니다!/ })).toBeVisible({ timeout: 10000 })

    const secondSaved = await page.evaluate((key) => {
      const raw = sessionStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    }, storageKey)

    expect(secondSaved?.waitingId).toBeTruthy()
    expect(secondSaved?.waitingId).not.toBe(firstSaved.waitingId)
    expect(secondSaved?.queueNumber).toBeGreaterThan(firstSaved.queueNumber)
  })


  test('SC-027B: 관리자 웨이팅 패널 — 직원 호출 확인 및 처리 완료', async ({ page }) => {
    expect(storeId).toBeTruthy()

    const serviceHeaders = getServiceRoleHeaders()
    test.skip(!serviceHeaders, 'SUPABASE_SERVICE_ROLE_KEY 미설정')

    await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_NEW_PASSWORD)
    await page.waitForLoadState('networkidle')

    const tableRows = await supabaseGet<TableRow>(
      page,
      `tables?select=id,table_number&store_id=eq.${storeId}&order=table_number.asc&limit=1`,
    )
    expect(tableRows.length, '직원 호출을 연결할 테이블이 필요합니다.').toBeGreaterThan(0)

    const table = tableRows[0]
    const optionName = '물티슈 주세요'
    const { url } = getSupabaseConfig()

    const insertRes = await fetch(`${url}/rest/v1/staff_calls`, {
      method: 'POST',
      headers: { ...serviceHeaders!, Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeId,
        table_id: table.id,
        option_name: optionName,
        status: 'pending',
      }),
    })
    expect(insertRes.ok, `staff_calls seed 실패: ${insertRes.status}`).toBeTruthy()

    const insertedRows = (await insertRes.json()) as StaffCallVerifyRow[]
    expect(insertedRows.length).toBeGreaterThan(0)
    const staffCallId = insertedRows[0].id

    await clickSidebarButton(page, /웨이팅/)
    await expect(page.getByRole('heading', { name: '웨이팅 관리' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('body')).toContainText(optionName, { timeout: 10000 })
    await expect(page.locator('body')).toContainText(`${table.table_number}번 테이블`, { timeout: 10000 })

    await page.getByTestId('staff-call-resolve').click()
    await expect(page.locator('body')).not.toContainText(optionName, { timeout: 10000 })

    const verifyRes = await fetch(
      `${url}/rest/v1/staff_calls?select=id,status,resolved_at,option_name&id=eq.${staffCallId}&limit=1`,
      { headers: serviceHeaders! },
    )
    expect(verifyRes.ok, `staff_calls verify 실패: ${verifyRes.status}`).toBeTruthy()

    const verifiedRows = (await verifyRes.json()) as StaffCallVerifyRow[]
    expect(verifiedRows.length).toBeGreaterThan(0)
    expect(verifiedRows[0].status).toBe('resolved')
    expect(verifiedRows[0].resolved_at).toBeTruthy()
  })

  test.afterAll(async () => {
    await deleteStoresWithTestTag()
    await deleteStoreBySlug(storeSlug)
  })
})
