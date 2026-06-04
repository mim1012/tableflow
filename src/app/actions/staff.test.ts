import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/server/storeAccess', () => ({
  assertStoreActiveWithClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { assertStoreActiveWithClient } from '@/lib/server/storeAccess'
import { deactivateStaffAction } from './staff'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  getSessionMock.mockResolvedValue({
    data: { session: { access_token: 'session-token' } },
    error: null,
  })
  vi.mocked(createClient).mockResolvedValue({
    auth: { getSession: getSessionMock },
    from: fromMock,
  } as any)
  vi.mocked(assertStoreActiveWithClient).mockResolvedValue(undefined)
  vi.stubGlobal('fetch', fetchMock)
})

describe('deactivateStaffAction', () => {
  it('delegates to the staff-admin set-active endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    })

    await expect(deactivateStaffAction('member-1', 'store-1')).resolves.toBeUndefined()

    expect(assertStoreActiveWithClient).toHaveBeenCalledWith(expect.anything(), 'store-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/staff-admin?action=set-active',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer session-token',
          apikey: 'anon-key',
        }),
        body: JSON.stringify({ storeId: 'store-1', memberId: 'member-1', isActive: false }),
      }),
    )
  })

  it('does not call staff-admin when the store is inactive', async () => {
    vi.mocked(assertStoreActiveWithClient).mockRejectedValueOnce(new Error('비활성 또는 만료된 매장입니다.'))

    await expect(deactivateStaffAction('member-1', 'store-1')).rejects.toThrow('비활성 또는 만료된 매장입니다.')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
