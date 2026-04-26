import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createQueryMock } from '@/test/mocks/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'
import { getStoreSettings, updateStoreWaitingMinutesPerTeam } from './storeSettings'

describe('storeSettings API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gets store settings with waiting minutes per team', async () => {
    const row = {
      store_id: 'store-1',
      kakao_receiver_phone: null,
      alimtalk_enabled: true,
      waiting_minutes_per_team: 7,
    }

    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: row, error: null }) as any,
    )

    await expect(getStoreSettings('store-1')).resolves.toEqual(row)
    expect(supabase.from).toHaveBeenCalledWith('store_settings')
  })

  it('updates waiting minutes per team', async () => {
    const updated = {
      store_id: 'store-1',
      waiting_minutes_per_team: 9,
    }

    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: updated, error: null }) as any,
    )

    await expect(updateStoreWaitingMinutesPerTeam('store-1', 9)).resolves.toEqual(updated)
    expect(supabase.from).toHaveBeenCalledWith('store_settings')
  })

  it('throws when updating fails', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      createQueryMock({ data: null, error: { message: 'update failed' } }) as any,
    )

    await expect(updateStoreWaitingMinutesPerTeam('store-1', 4)).rejects.toEqual({ message: 'update failed' })
  })
})
