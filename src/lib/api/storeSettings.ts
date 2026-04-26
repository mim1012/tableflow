import { supabase as _supabase } from '@/lib/supabase'
import type { StoreSettingsRow } from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any

export async function getStoreSettings(storeId: string): Promise<StoreSettingsRow | null> {
  const { data, error } = await supabase
    .from('store_settings')
    .select('store_id, kakao_receiver_phone, alimtalk_enabled, waiting_minutes_per_team')
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as StoreSettingsRow | null
}

export async function updateStoreWaitingMinutesPerTeam(
  storeId: string,
  waitingMinutesPerTeam: number,
): Promise<Pick<StoreSettingsRow, 'store_id' | 'waiting_minutes_per_team'>> {
  const { data, error } = await supabase
    .from('store_settings')
    .upsert({
      store_id: storeId,
      waiting_minutes_per_team: waitingMinutesPerTeam,
    }, { onConflict: 'store_id' })
    .select('store_id, waiting_minutes_per_team')
    .single()

  if (error) throw error
  return data as Pick<StoreSettingsRow, 'store_id' | 'waiting_minutes_per_team'>
}
