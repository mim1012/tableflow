import { supabase as _supabase } from '@/lib/supabase'
import type { StaffCallRow } from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any

export async function createStaffCall(params: {
  storeId: string
  tableId: string
  optionName: string
}): Promise<{ staffCallId: string }> {
  const { data, error } = await supabase.rpc('create_staff_call', {
    p_store_id: params.storeId,
    p_table_id: params.tableId,
    p_option_name: params.optionName,
  })

  if (error || !data) {
    throw new Error(`직원 호출 생성 실패: ${error?.message ?? '알 수 없는 오류'}`)
  }

  return { staffCallId: data }
}

export async function getPendingStaffCalls(storeId: string): Promise<StaffCallRow[]> {
  const { data, error } = await supabase
    .from('staff_calls')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function resolveStaffCall(staffCallId: string): Promise<void> {
  const { error } = await supabase
    .from('staff_calls')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', staffCallId)

  if (error) throw new Error(error.message)
}
