import { beforeEach, describe, expect, it, vi } from 'vitest'

const fromMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/server/storeAccess', () => ({
  assertStoreActiveWithClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { assertStoreActiveWithClient } from '@/lib/server/storeAccess'
import { deleteOrderAction, updateOrderPaxAction, updateOrderStatusAction } from './order'

function makeSelectChain(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result)
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.single = single
  chain.maybeSingle = maybeSingle
  chain.select = vi.fn().mockReturnValue(chain)
  return chain
}

function makeUpdateChain(result: { error: { message: string } | null }) {
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result))
  const update = vi.fn().mockReturnValue(chain)
  return { update, chain }
}

function makeDeleteChain(result: { error: { message: string } | null }) {
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result))
  const deleteFn = vi.fn().mockReturnValue(chain)
  return { deleteFn, chain }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue({ from: fromMock } as any)
  vi.mocked(assertStoreActiveWithClient).mockResolvedValue(undefined)
})

describe('order lifecycle guards', () => {
  it('checks the order store before status updates', async () => {
    const update = makeUpdateChain({ error: null })
    fromMock
      .mockReturnValueOnce(makeSelectChain({ data: { status: 'created', store_id: 'store-1' }, error: null }))
      .mockReturnValueOnce({ update: update.update })

    await expect(updateOrderStatusAction('order-1', 'confirmed')).resolves.toBeUndefined()

    expect(assertStoreActiveWithClient).toHaveBeenCalledWith(expect.anything(), 'store-1')
    expect(update.update).toHaveBeenCalledWith({ status: 'confirmed' })
  })

  it('rejects deletes before mutation when the order store is unavailable', async () => {
    fromMock.mockReturnValueOnce(makeSelectChain({ data: { store_id: 'store-1' }, error: null }))
    vi.mocked(assertStoreActiveWithClient).mockRejectedValueOnce(new Error('비활성 또는 만료된 매장입니다.'))

    await expect(deleteOrderAction('order-1')).rejects.toThrow('비활성 또는 만료된 매장입니다.')
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('checks the order store before deletes', async () => {
    const del = makeDeleteChain({ error: null })
    fromMock
      .mockReturnValueOnce(makeSelectChain({ data: { store_id: 'store-1' }, error: null }))
      .mockReturnValueOnce({ delete: del.deleteFn })

    await expect(deleteOrderAction('order-1')).resolves.toBeUndefined()

    expect(assertStoreActiveWithClient).toHaveBeenCalledWith(expect.anything(), 'store-1')
    expect(del.deleteFn).toHaveBeenCalled()
  })

  it('checks the order store before pax updates', async () => {
    const update = makeUpdateChain({ error: null })
    fromMock
      .mockReturnValueOnce(makeSelectChain({ data: { store_id: 'store-1' }, error: null }))
      .mockReturnValueOnce({ update: update.update })

    await expect(updateOrderPaxAction('order-1', 4)).resolves.toBeUndefined()

    expect(assertStoreActiveWithClient).toHaveBeenCalledWith(expect.anything(), 'store-1')
    expect(update.update).toHaveBeenCalledWith({ pax: 4 })
  })
})
