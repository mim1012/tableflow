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

function makeInsertChain(result: { data: { id: string } | null; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  return { insert, select, single }
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

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  vi.mocked(createServiceClient).mockReturnValue({
    rpc: serviceRpcMock,
    from: serviceFromMock,
    functions: { invoke: functionsInvokeMock },
  } as any)

  vi.mocked(createServerClient).mockResolvedValue({
    from: serverFromMock,
    functions: { invoke: functionsInvokeMock },
  } as any)
})

describe('createWaitingAction', () => {
  it('creates waiting and sends WAITING_CREATED alimtalk with live queue mapping', async () => {
    serviceRpcMock.mockResolvedValue({ data: 7, error: null })
    serviceFromMock
      .mockReturnValueOnce(
        makeInsertChain({ data: { id: 'waiting-1' }, error: null }) as any,
      )
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
      waitingId: 'waiting-1',
    })

    expect(serviceRpcMock).toHaveBeenCalledWith('next_queue_number', { p_store_id: 'store-1' })
    expect(serviceFromMock).toHaveBeenCalledWith('waitings')
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
