import { describe, it, expect, vi, beforeEach } from 'vitest'

const serviceRpcMock = vi.fn()
const serviceFromMock = vi.fn()
const serverFromMock = vi.fn()
const functionsInvokeMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createWaitingAction, callWaitingAction } from './waiting'

function makeInsertNoSelectChain(result: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(result)
  return { insert }
}

function makeSelectChain(result: { data: unknown; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result)
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.lt = vi.fn().mockReturnValue(chain)
  chain.single = single
  chain.maybeSingle = maybeSingle
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result))
  const select = vi.fn().mockReturnValue(chain)
  return { select, eq: chain.eq, lt: chain.lt, single, maybeSingle }
}

function makeUpdateChain(result: { data: { id: string } | null; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result)
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue({ single })
  chain.eq = vi.fn().mockReturnValue(chain)
  const update = vi.fn().mockReturnValue(chain)
  return { update, eq: chain.eq, select: chain.select, single }
}

beforeEach(() => {
  vi.clearAllMocks()
  serviceRpcMock.mockReset()
  serviceFromMock.mockReset()
  serverFromMock.mockReset()
  functionsInvokeMock.mockReset()
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  vi.mocked(createServiceClient).mockReturnValue({
    rpc: serviceRpcMock,
    from: serviceFromMock,
    functions: { invoke: functionsInvokeMock },
  } as any)

  vi.mocked(createServerClient).mockResolvedValue({
    rpc: serviceRpcMock,
    from: serverFromMock,
    functions: { invoke: functionsInvokeMock },
  } as any)
})

describe('createWaitingAction', () => {
  it('creates waiting and sends WAITING_CREATED alimtalk with live queue mapping', async () => {
    serviceRpcMock.mockResolvedValue({ data: 7, error: null })
    serverFromMock
      .mockReturnValueOnce(
        makeInsertNoSelectChain({ error: null }) as any,
      )
    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 7 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }, { id: 'w4' }], error: null }) as any,
      )
    functionsInvokeMock.mockResolvedValue({ data: { ok: true }, error: null })

    await expect(createWaitingAction('store-1', '01012345678', 3)).resolves.toEqual({
      queueNumber: 7,
      waitingId: '11111111-1111-4111-8111-111111111111',
    })

    expect(serviceRpcMock).toHaveBeenCalledWith('next_queue_number', { p_store_id: 'store-1' })
    expect(serverFromMock).toHaveBeenCalledWith('waitings')
    expect(functionsInvokeMock).toHaveBeenCalledWith('send-alimtalk', {
      body: {
        to: '01012345678',
        type: 'WAITING_CREATED',
        queueNumber: 7,
        storeName: '테스트매장',
        teamsAhead: 4,
        estimatedWaitMinutes: 28,
      },
    })
  })

  it('falls back to service role client when anon insert fails', async () => {
    serviceRpcMock.mockResolvedValue({ data: 11, error: null })
    serverFromMock.mockReturnValueOnce(
      makeInsertNoSelectChain({ error: { message: 'new row violates row-level security policy for table "waitings"' } }) as any,
    )
    serviceFromMock
      .mockReturnValueOnce(
        makeInsertNoSelectChain({ error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 7 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: [], error: null }) as any,
      )
    functionsInvokeMock.mockResolvedValue({ data: { ok: true }, error: null })

    await expect(createWaitingAction('store-1', '01077778888', 2)).resolves.toEqual({
      queueNumber: 11,
      waitingId: '11111111-1111-4111-8111-111111111111',
    })

    expect(serverFromMock).toHaveBeenCalledWith('waitings')
    expect(serviceFromMock).toHaveBeenCalledWith('waitings')
  })

  it('still creates waiting when service role env is missing', async () => {
    serviceRpcMock.mockResolvedValue({ data: 9, error: null })
    serverFromMock.mockReturnValueOnce(
      makeInsertNoSelectChain({ error: null }) as any,
    )
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    await expect(createWaitingAction('store-1', '01055556666', 2)).resolves.toEqual({
      queueNumber: 9,
      waitingId: '11111111-1111-4111-8111-111111111111',
    })

    expect(functionsInvokeMock).not.toHaveBeenCalled()
  })

  it('creates waiting without service-role fallback when anon insert works but returning is blocked by RLS', async () => {
    serviceRpcMock.mockResolvedValue({ data: 13, error: null })
    serverFromMock.mockReturnValueOnce(
      makeInsertNoSelectChain({ error: null }) as any,
    )
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const result = await createWaitingAction('store-1', '01022223333', 4)

    expect(result.queueNumber).toBe(13)
    expect(result.waitingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(functionsInvokeMock).not.toHaveBeenCalled()
  })
})

describe('callWaitingAction', () => {
  it('calls waiting and sends WAITING_CALLED alimtalk with live queue mapping', async () => {
    serverFromMock
      .mockReturnValueOnce(
        makeSelectChain({
          data: { phone: '01099990000', queue_number: 12, store_id: 'store-1', status: 'waiting' },
          error: null,
        }) as any,
      )
      .mockReturnValueOnce(
        makeUpdateChain({ data: { id: 'waiting-1' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 5 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: [{ id: 'w1' }, { id: 'w2' }], error: null }) as any,
      )

    await expect(callWaitingAction('waiting-1')).resolves.toBeUndefined()

    expect(functionsInvokeMock).toHaveBeenCalledWith('send-alimtalk', {
      body: {
        to: '01099990000',
        type: 'WAITING_CALLED',
        queueNumber: 12,
        storeName: '테스트매장',
        teamsAhead: 2,
        estimatedWaitMinutes: 10,
      },
    })
  })

  it('does not send alimtalk when phone is missing', async () => {
    serverFromMock
      .mockReturnValueOnce(
        makeSelectChain({
          data: { phone: null, queue_number: 12, store_id: 'store-1', status: 'waiting' },
          error: null,
        }) as any,
      )
      .mockReturnValueOnce(
        makeUpdateChain({ data: { id: 'waiting-1' }, error: null }) as any,
      )

    await expect(callWaitingAction('waiting-1')).resolves.toBeUndefined()
    expect(functionsInvokeMock).not.toHaveBeenCalled()
  })

  it('is a no-op when waiting is already called', async () => {
    serverFromMock.mockReturnValueOnce(
      makeSelectChain({
        data: { phone: '01099990000', queue_number: 12, store_id: 'store-1', status: 'called' },
        error: null,
      }) as any,
    )

    await expect(callWaitingAction('waiting-1')).resolves.toBeUndefined()
    expect(functionsInvokeMock).not.toHaveBeenCalled()
  })
})
