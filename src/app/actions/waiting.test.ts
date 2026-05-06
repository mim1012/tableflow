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
import { createWaitingAction, cancelWaitingAction, callWaitingAction } from './waiting'

function makeSelectChain(result: { data: unknown; error: { message: string } | null; count?: number | null }) {
  const single = vi.fn().mockResolvedValue(result)
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.lt = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.single = single
  chain.maybeSingle = maybeSingle
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result))
  const select = vi.fn().mockReturnValue(chain)
  return { select, eq: chain.eq, lt: chain.lt, in: chain.in, single, maybeSingle }
}

function makeUpdateChain(result: { data: { id: string } | null; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result)
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue({ single })
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  const update = vi.fn().mockReturnValue(chain)
  return { update, eq: chain.eq, in: chain.in, select: chain.select, single }
}

function makeInsertChain(result: { data: { id: string } | null; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ single })
  const insert = vi.fn().mockReturnValue({ select })
  return { insert, select, single }
}

function makeBareUpdateChain(result: { error: { message: string } | null }) {
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result))
  const update = vi.fn().mockReturnValue(chain)
  return { update, eq: chain.eq }
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
    rpc: serviceRpcMock,
    from: serverFromMock,
    functions: { invoke: functionsInvokeMock },
  } as any)
})

describe('createWaitingAction', () => {
  it('creates waiting and sends WAITING_CREATED alimtalk with live queue mapping', async () => {
    serviceRpcMock.mockResolvedValue({ data: { queue_number: 7, waiting_id: '11111111-1111-4111-8111-111111111111' }, error: null })
    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 7 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: null, count: 4, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeInsertChain({ data: { id: 'notif-1' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeBareUpdateChain({ error: null }) as any,
      )
    functionsInvokeMock.mockResolvedValue({ data: { ok: true }, error: null })

    await expect(createWaitingAction('store-1', '01012345678', 3)).resolves.toEqual({
      queueNumber: 7,
      waitingId: '11111111-1111-4111-8111-111111111111',
    })

    expect(serviceRpcMock).toHaveBeenCalledWith('create_waiting_atomic', {
      p_store_id: 'store-1',
      p_phone: '01012345678',
      p_party_size: 3,
    })
    expect(serverFromMock).not.toHaveBeenCalledWith('waitings')
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
    await Promise.resolve()
    expect(serviceFromMock).toHaveBeenCalledWith('waiting_notifications')
  })

  it('falls back to service role client when anon RPC fails', async () => {
    serviceRpcMock
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied for function create_waiting_atomic' } })
      .mockResolvedValueOnce({ data: { queue_number: 11, waiting_id: '11111111-1111-4111-8111-111111111111' }, error: null })
    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 7 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: null, count: 0, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeInsertChain({ data: { id: 'notif-2' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeBareUpdateChain({ error: null }) as any,
      )
    functionsInvokeMock.mockResolvedValue({ data: { ok: true }, error: null })

    await expect(createWaitingAction('store-1', '01077778888', 2)).resolves.toEqual({
      queueNumber: 11,
      waitingId: '11111111-1111-4111-8111-111111111111',
    })

    expect(serviceRpcMock).toHaveBeenNthCalledWith(1, 'create_waiting_atomic', {
      p_store_id: 'store-1',
      p_phone: '01077778888',
      p_party_size: 2,
    })
    expect(serviceRpcMock).toHaveBeenNthCalledWith(2, 'create_waiting_atomic', {
      p_store_id: 'store-1',
      p_phone: '01077778888',
      p_party_size: 2,
    })
  })

  it('still creates waiting when service role env is missing', async () => {
    serviceRpcMock.mockResolvedValue({ data: { queue_number: 9, waiting_id: '11111111-1111-4111-8111-111111111111' }, error: null })
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    await expect(createWaitingAction('store-1', '01055556666', 2)).resolves.toEqual({
      queueNumber: 9,
      waitingId: '11111111-1111-4111-8111-111111111111',
    })

    expect(functionsInvokeMock).not.toHaveBeenCalled()
  })

  it('surfaces duplicate-active-waiting RPC errors', async () => {
    serviceRpcMock.mockResolvedValue({
      data: null,
      error: { message: 'active waiting already exists for this phone' },
    })
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    await expect(createWaitingAction('store-1', '01012345678', 2)).rejects.toThrow(
      'active waiting already exists for this phone',
    )
  })
})

describe('cancelWaitingAction', () => {
  it('cancels a waiting entry when phone/store/id match', async () => {
    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({
          data: { id: 'waiting-1', phone: '01012345678', queue_number: 7, store_id: 'store-1', status: 'waiting' },
          error: null,
        }) as any,
      )
      .mockReturnValueOnce(
        makeUpdateChain({ data: { id: 'waiting-1' }, error: null }) as any,
      )

    await expect(cancelWaitingAction('store-1', 'waiting-1', '010-1234-5678')).resolves.toBeUndefined()
  })

  it('allows cancellation from called status', async () => {
    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({
          data: { id: 'waiting-1', phone: '01012345678', queue_number: 7, store_id: 'store-1', status: 'called' },
          error: null,
        }) as any,
      )
      .mockReturnValueOnce(
        makeUpdateChain({ data: { id: 'waiting-1' }, error: null }) as any,
      )

    await expect(cancelWaitingAction('store-1', 'waiting-1', '01012345678')).resolves.toBeUndefined()
  })

  it('is idempotent when already cancelled', async () => {
    serviceFromMock.mockReturnValueOnce(
      makeSelectChain({
        data: { id: 'waiting-1', phone: '01012345678', queue_number: 7, store_id: 'store-1', status: 'cancelled' },
        error: null,
      }) as any,
    )

    await expect(cancelWaitingAction('store-1', 'waiting-1', '01012345678')).resolves.toBeUndefined()
  })

  it('rejects terminal statuses other than cancelled', async () => {
    serviceFromMock.mockReturnValueOnce(
      makeSelectChain({
        data: { id: 'waiting-1', phone: '01012345678', queue_number: 7, store_id: 'store-1', status: 'completed' },
        error: null,
      }) as any,
    )

    await expect(cancelWaitingAction('store-1', 'waiting-1', '01012345678')).rejects.toThrow('이미 종료된 대기입니다.')
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

    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 5 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: null, count: 2, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeInsertChain({ data: { id: 'notif-3' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeBareUpdateChain({ error: null }) as any,
      )
    functionsInvokeMock.mockResolvedValue({ data: { ok: true }, error: null })

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
    expect(serviceFromMock).toHaveBeenCalledWith('waiting_notifications')
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

  it('awaits WAITING_CALLED alimtalk delivery before resolving', async () => {
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

    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 5 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: null, count: 2, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeInsertChain({ data: { id: 'notif-4' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeBareUpdateChain({ error: null }) as any,
      )

    functionsInvokeMock.mockImplementation(
      () => new Promise((resolve) => {
        setTimeout(() => resolve({ data: { ok: true }, error: null }), 50)
      }),
    )

    const startedAt = Date.now()
    await expect(callWaitingAction('waiting-1')).resolves.toBeUndefined()
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40)
  })

  it('marks waiting notification as failed when invoke returns an error', async () => {
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

    const failedUpdate = makeBareUpdateChain({ error: null })

    serviceFromMock
      .mockReturnValueOnce(
        makeSelectChain({ data: { name: '테스트매장' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: { waiting_minutes_per_team: 5 }, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeSelectChain({ data: null, count: 2, error: null }) as any,
      )
      .mockReturnValueOnce(
        makeInsertChain({ data: { id: 'notif-failed' }, error: null }) as any,
      )
      .mockReturnValueOnce(failedUpdate as any)

    functionsInvokeMock.mockResolvedValue({ data: null, error: new Error('provider down') })

    await expect(callWaitingAction('waiting-1')).resolves.toBeUndefined()

    expect(failedUpdate.update).toHaveBeenCalledWith({
      status: 'failed',
      error_msg: 'provider down',
    })
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
