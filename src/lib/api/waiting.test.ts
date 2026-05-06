import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createQueryMock } from '@/test/mocks/supabase'


vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}))

import { supabase } from '@/lib/supabase'
import {
  createWaiting,
  getWaitingStatus,
  getWaitings,
  callWaiting,
  seatWaiting,
  completeWaiting,
  cancelWaiting,
  noShowWaiting,
  findAvailableTable,
} from './waiting'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { ok: true }, error: null } as any)
})

describe('createWaiting', () => {
  it('should call create_waiting_atomic RPC without direct insert', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { queue_number: 42, waiting_id: 'w1' },
      error: null,
    } as any)

    const result = await createWaiting({
      storeId: 's1',
      phone: '01012345678',
      partySize: 3,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('create_waiting_atomic', {
      p_store_id: 's1',
      p_phone: '01012345678',
      p_party_size: 3,
    })
    expect(supabase.from).not.toHaveBeenCalledWith('waitings')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('send-alimtalk', {
      body: {
        to: '01012345678',
        type: 'WAITING_CREATED',
        waitingId: 'w1',
        storeId: 's1',
        queueNumber: 42,
      },
    })
    expect(result).toEqual({ queueNumber: 42, waitingId: 'w1' })
  })

  it('should throw when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'RPC error' },
    } as any)

    await expect(createWaiting({
      storeId: 's1',
      phone: '010',
      partySize: 2,
    })).rejects.toThrow('RPC error')
  })

  it('should throw when RPC payload is incomplete', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { queue_number: 1 },
      error: null,
    } as any)

    await expect(createWaiting({
      storeId: 's1',
      phone: '010',
      partySize: 2,
    })).rejects.toThrow('waiting creation returned incomplete payload')
  })

  it('should still return waiting result when notification request fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { queue_number: 43, waiting_id: 'w43' },
      error: null,
    } as any)
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: new Error('notify failed') } as any)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(createWaiting({
      storeId: 's1',
      phone: '01000000000',
      partySize: 2,
    })).resolves.toEqual({ queueNumber: 43, waitingId: 'w43' })

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('getWaitingStatus', () => {
  it('should compute position and total waiting count for active waiting', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(
        createQueryMock({ data: { id: 'w2', queue_number: 2, status: 'waiting' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        createQueryMock({ data: null, count: 3, error: null }) as any,
      )
      .mockReturnValueOnce(
        createQueryMock({ data: null, count: 1, error: null }) as any,
      )

    const result = await getWaitingStatus('s1', 'w2')
    expect(result).toEqual({ myPosition: 1, totalWaiting: 3, status: 'waiting' })
  })

  it('should return zeroed snapshot when waiting ID is missing', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce(
      createQueryMock({ data: null, error: null }) as any,
    )

    const result = await getWaitingStatus('s1', 'unknown')
    expect(result).toEqual({ myPosition: 0, totalWaiting: 0, status: null })
  })

  it('should return total waiting count for terminal statuses', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce(
        createQueryMock({ data: { id: 'w1', queue_number: 4, status: 'cancelled' }, error: null }) as any,
      )
      .mockReturnValueOnce(
        createQueryMock({ data: null, count: 2, error: null }) as any,
      )

    const result = await getWaitingStatus('s1', 'w1')
    expect(result).toEqual({ myPosition: 2, totalWaiting: 2, status: 'cancelled' })
  })
})

describe('getWaitings', () => {
  it('should return waiting and called list for admin', async () => {
    const list = [
      { id: 'w1', queue_number: 1, status: 'waiting' },
      { id: 'w2', queue_number: 2, status: 'called' },
    ]
    const query = createQueryMock({ data: list, error: null })
    vi.mocked(supabase.from).mockReturnValue(query as any)

    const result = await getWaitings('s1')
    expect(supabase.from).toHaveBeenCalledWith('waitings')
    expect(query.eq).toHaveBeenCalledWith('store_id', 's1')
    expect(query.in).toHaveBeenCalledWith('status', ['waiting', 'called'])
    expect(query.order).toHaveBeenCalledWith('queue_number', { ascending: true })
    expect(result).toEqual(list)
  })

  it('should return empty array when null data', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    const result = await getWaitings('s1')
    expect(result).toEqual([])
  })
})

describe('status transitions', () => {
  it('callWaiting should update status to called', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    await expect(callWaiting('w1')).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledWith('waitings')
  })

  it('seatWaiting should update status to seated', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    await expect(seatWaiting('w1', 't1')).resolves.toBeUndefined()
  })

  it('seatWaiting without tableId should pass null', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    await expect(seatWaiting('w1')).resolves.toBeUndefined()
  })

  it('completeWaiting should update status to completed', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    await expect(completeWaiting('w1')).resolves.toBeUndefined()
  })

  it('cancelWaiting should update status to cancelled', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'w1', error: null } as any)

    await expect(cancelWaiting({ storeId: 's1', waitingId: 'w1', phone: '01012345678' })).resolves.toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_waiting_public', {
      p_store_id: 's1',
      p_waiting_id: 'w1',
      p_phone: '01012345678',
    })
  })

  it('noShowWaiting should update status to no_show', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    await expect(noShowWaiting('w1')).resolves.toBeUndefined()
  })

  it('should throw when update fails', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: { message: 'update error' } }) as any,
    )

    await expect(callWaiting('w1')).rejects.toThrow('update error')
  })

  it('cancelWaiting should throw when rpc fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'cancel error' } } as any)

    await expect(cancelWaiting({ storeId: 's1', waitingId: 'w1', phone: '01012345678' })).rejects.toThrow('cancel error')
  })
})

describe('findAvailableTable', () => {
  it('should return smallest available table with sufficient capacity', async () => {
    const table = { id: 't1', capacity: 4, status: 'available' }
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: table, error: null }) as any,
    )

    const result = await findAvailableTable('s1', 3)
    expect(supabase.from).toHaveBeenCalledWith('tables')
    expect(result).toEqual(table)
  })

  it('should return null when no table available', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: null }) as any,
    )

    const result = await findAvailableTable('s1', 10)
    expect(result).toBeNull()
  })

  it('should throw on DB error', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: { message: 'table error' } }) as any,
    )

    await expect(findAvailableTable('s1', 2)).rejects.toThrow('table error')
  })
})
