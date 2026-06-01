import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryMock } from '@/test/mocks/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import { createStaffCall, getPendingStaffCalls, resolveStaffCall } from './staffCall'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('staffCall API', () => {
  it('calls create_staff_call RPC and returns staffCallId', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: 'staff-call-123',
      error: null,
    } as any)

    const result = await createStaffCall({
      storeId: 'store-1',
      tableId: 'table-1',
      optionName: '앞접시 주세요',
    })

    expect(supabase.rpc).toHaveBeenCalledWith('create_staff_call', {
      p_store_id: 'store-1',
      p_table_id: 'table-1',
      p_option_name: '앞접시 주세요',
    })
    expect(result).toEqual({ staffCallId: 'staff-call-123' })
  })

  it('throws a descriptive error when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'invalid option' },
    } as any)

    await expect(createStaffCall({
      storeId: 'store-1',
      tableId: 'table-1',
      optionName: '없는 옵션',
    })).rejects.toThrow('직원 호출 생성 실패: invalid option')
  })

  it('gets pending staff calls for a store', async () => {
    const rows = [
      { id: 'sc-1', store_id: 'store-1', table_id: 'table-1', option_name: '직원만 호출', status: 'pending', requested_at: '2026-05-05T10:00:00.000Z', resolved_at: null },
    ]

    vi.mocked(supabase.from).mockReturnValue(createQueryMock({ data: rows, error: null }) as any)

    await expect(getPendingStaffCalls('store-1')).resolves.toEqual(rows)
    expect(supabase.from).toHaveBeenCalledWith('staff_calls')
  })

  it('marks a staff call as resolved', async () => {
    const query = createQueryMock({ data: null, error: null }) as any
    vi.mocked(supabase.from).mockReturnValue(query)

    await expect(resolveStaffCall('sc-1')).resolves.toBeUndefined()
    expect(supabase.from).toHaveBeenCalledWith('staff_calls')
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'resolved',
      resolved_at: expect.any(String),
    }))
    expect(query.eq).toHaveBeenCalledWith('id', 'sc-1')
  })
})
