import { test, expect } from '@playwright/test'
import {
  clickSidebarButton,
  getServiceRoleHeaders,
  getSupabaseConfig,
  loginAndWaitForAdmin,
  requireEnv,
} from './e2e-helpers'

requireEnv('TEST_OWNER_EMAIL')
requireEnv('TEST_OWNER_PASSWORD')
requireEnv('TEST_STORE_SLUG')
requireEnv('NEXT_PUBLIC_SUPABASE_URL')
requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
requireEnv('SUPABASE_SERVICE_ROLE_KEY')

const OWNER_EMAIL = requireEnv('TEST_OWNER_EMAIL')
const OWNER_PASSWORD = requireEnv('TEST_OWNER_PASSWORD')
const STORE_SLUG = requireEnv('TEST_STORE_SLUG')

type StoreRow = { id: string }
type TableRow = { id: string; table_number: number }
type StaffCallRow = { id: string; status: string; resolved_at: string | null; option_name: string }

async function serviceRoleFetch(path: string, init?: RequestInit) {
  const { url } = getSupabaseConfig()
  const headers = getServiceRoleHeaders()
  if (!headers) throw new Error('SUPABASE_SERVICE_ROLE_KEY 미설정')

  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
  })
}

async function fetchStoreBySlug() {
  const res = await serviceRoleFetch(`stores?select=id&slug=eq.${encodeURIComponent(STORE_SLUG)}&limit=1`)
  expect(res.ok, `매장 조회 실패: ${res.status}`).toBeTruthy()
  const rows = (await res.json()) as StoreRow[]
  expect(rows.length, 'TEST_STORE_SLUG에 해당하는 매장이 필요합니다.').toBeGreaterThan(0)
  return rows[0]
}

async function fetchFirstTable(storeId: string) {
  const res = await serviceRoleFetch(
    `tables?select=id,table_number&store_id=eq.${storeId}&order=table_number.asc&limit=1`,
  )
  expect(res.ok, `테이블 조회 실패: ${res.status}`).toBeTruthy()
  const rows = (await res.json()) as TableRow[]
  expect(rows.length, '기존 테스트 매장에 최소 1개 테이블이 필요합니다.').toBeGreaterThan(0)
  return rows[0]
}

test.describe('직원 호출 prod-safe E2E', () => {
  test('기존 테스트 매장에서 직원 호출 확인 및 처리 완료', async ({ page }) => {
    const store = await fetchStoreBySlug()
    const table = await fetchFirstTable(store.id)
    const optionName = `E2E 직원호출 ${Date.now()}`

    const insertRes = await serviceRoleFetch('staff_calls', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: store.id,
        table_id: table.id,
        option_name: optionName,
        status: 'pending',
      }),
    })
    expect(insertRes.ok, `staff_calls seed 실패: ${insertRes.status}`).toBeTruthy()

    const insertedRows = (await insertRes.json()) as StaffCallRow[]
    expect(insertedRows.length).toBeGreaterThan(0)
    const staffCallId = insertedRows[0].id

    try {
      await loginAndWaitForAdmin(page, OWNER_EMAIL, OWNER_PASSWORD)
      await expect(page.getByRole('button', { name: /웨이팅 관리/ })).toBeVisible({ timeout: 15000 })

      await clickSidebarButton(page, /웨이팅/)
      await expect(page.getByRole('heading', { name: '웨이팅 관리' })).toBeVisible({ timeout: 10000 })
      await expect(page.locator('body')).toContainText(optionName, { timeout: 10000 })
      await expect(page.locator('body')).toContainText(`${table.table_number}번 테이블`, { timeout: 10000 })

      const matchingCard = page.locator('[data-testid="staff-call-resolve"]').locator('..').locator('..').filter({ hasText: optionName }).first()
      await matchingCard.getByTestId('staff-call-resolve').click()
      await expect(page.locator('body')).not.toContainText(optionName, { timeout: 10000 })

      const verifyRes = await serviceRoleFetch(
        `staff_calls?select=id,status,resolved_at,option_name&id=eq.${staffCallId}&limit=1`,
      )
      expect(verifyRes.ok, `staff_calls verify 실패: ${verifyRes.status}`).toBeTruthy()

      const verifiedRows = (await verifyRes.json()) as StaffCallRow[]
      expect(verifiedRows.length).toBeGreaterThan(0)
      expect(verifiedRows[0].status).toBe('resolved')
      expect(verifiedRows[0].resolved_at).toBeTruthy()
    } finally {
      await serviceRoleFetch(`staff_calls?id=eq.${staffCallId}`, {
        method: 'DELETE',
      })
    }
  })
})
