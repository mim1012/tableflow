import { test, expect } from '@playwright/test'
import {
  getServiceRoleHeaders,
  getSupabaseConfig,
  requireEnv,
} from './e2e-helpers'

requireEnv('TEST_STORE_SLUG')
requireEnv('NEXT_PUBLIC_SUPABASE_URL')
requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
requireEnv('SUPABASE_SERVICE_ROLE_KEY')

const STORE_SLUG = requireEnv('TEST_STORE_SLUG')
const CONCURRENCY = 5

type StoreRow = { id: string }
type TableRow = { id: string; table_number: number }
type StaffCallRow = {
  id: string
  status: string
  resolved_at: string | null
  option_name: string
  table_id: string | null
}

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

async function anonRpc(path: string, body: object) {
  const { url, anonKey } = getSupabaseConfig()
  return fetch(`${url}/rest/v1/rpc/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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

async function fetchFirstOption(storeId: string) {
  const res = await anonRpc('get_staff_call_options', { p_store_id: storeId })
  expect(res.ok, `직원호출 옵션 조회 실패: ${res.status}`).toBeTruthy()
  const options = (await res.json()) as string[]
  expect(options.length, '직원호출 옵션이 최소 1개 필요합니다.').toBeGreaterThan(0)
  return options[0]
}

test.describe('직원 호출 race prod-safe', () => {
  test('동일 테이블/옵션 동시 요청은 pending 1건만 유지해야 한다', async () => {
    const store = await fetchStoreBySlug()
    const table = await fetchFirstTable(store.id)
    const optionName = await fetchFirstOption(store.id)
    const createdIds = new Set<string>()

    try {
      const responses = await Promise.all(
        Array.from({ length: CONCURRENCY }, () =>
          anonRpc('create_staff_call', {
            p_store_id: store.id,
            p_table_id: table.id,
            p_option_name: optionName,
          }),
        ),
      )

      const responseBodies = await Promise.all(responses.map(async (response) => ({
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      })))

      expect(responseBodies.every((result) => result.ok), JSON.stringify(responseBodies, null, 2)).toBe(true)

      responseBodies.forEach((result) => createdIds.add(JSON.parse(result.body) as string))
      expect(createdIds.size).toBe(1)

      const verifyRes = await serviceRoleFetch(
        `staff_calls?select=id,status,option_name,table_id&store_id=eq.${store.id}&table_id=eq.${table.id}&option_name=eq.${encodeURIComponent(optionName)}&status=eq.pending&id=in.(${Array.from(createdIds).join(',')})`,
      )
      expect(verifyRes.ok, `staff_calls verify 실패: ${verifyRes.status}`).toBeTruthy()
      const verifiedRows = (await verifyRes.json()) as StaffCallRow[]
      expect(verifiedRows).toHaveLength(1)
      expect(verifiedRows[0].status).toBe('pending')
    } finally {
      await Promise.all(
        Array.from(createdIds).map((staffCallId) =>
          serviceRoleFetch(`staff_calls?id=eq.${staffCallId}`, {
            method: 'DELETE',
          }),
        ),
      )
    }
  })
})
