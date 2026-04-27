import { supabase as _supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any
import type { WaitingRow, TableRow } from '@/types/database'

// -------------------------------------------------------
// 대기 등록 (anon)
// -------------------------------------------------------
export async function createWaiting(params: {
  storeId: string
  phone: string
  partySize: number
}): Promise<{ queueNumber: number; waitingId: string }> {
  const { storeId, phone, partySize } = params

  const { data: queueNumber, error: rpcError } = await supabase.rpc(
    'next_queue_number',
    { p_store_id: storeId },
  )
  if (rpcError) throw new Error(rpcError.message)

  const { data, error } = await supabase
    .from('waitings')
    .insert({
      store_id: storeId,
      queue_number: queueNumber as number,
      phone,
      party_size: partySize,
      status: 'waiting',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { queueNumber: queueNumber as number, waitingId: data.id }
}

// -------------------------------------------------------
// 현재 대기 현황 (고객용)
// -------------------------------------------------------
export async function getWaitingStatus(
  storeId: string,
  waitingId: string,
): Promise<{ myPosition: number; totalWaiting: number }> {
  const { data: allWaiting, error } = await supabase
    .from('waitings_public')
    .select('id, queue_number')
    .eq('store_id', storeId)
    .eq('status', 'waiting')
    .order('queue_number', { ascending: true })

  if (error) throw new Error(error.message)

  const list = allWaiting ?? []
  const totalWaiting = list.length
  const myIndex = list.findIndex((w: any) => w.id === waitingId)
  const myPosition = myIndex >= 0 ? myIndex : totalWaiting

  return { myPosition, totalWaiting }
}

// -------------------------------------------------------
// 대기 목록 (어드민용)
// -------------------------------------------------------
export async function getWaitings(storeId: string): Promise<WaitingRow[]> {
  const { data, error } = await supabase
    .from('waitings')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'waiting')
    .order('queue_number', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

// -------------------------------------------------------
// 상태 변경 헬퍼
// -------------------------------------------------------
async function updateWaitingStatus(
  waitingId: string,
  fields: Partial<{
    status: WaitingRow['status']
    called_at: string | null
    seated_at: string | null
    completed_at: string | null
    table_id: string | null
  }>,
): Promise<void> {
  const { error } = await supabase
    .from('waitings')
    .update(fields)
    .eq('id', waitingId)

  if (error) throw new Error(error.message)
}

export async function callWaiting(waitingId: string): Promise<void> {
  await updateWaitingStatus(waitingId, {
    status: 'called',
    called_at: new Date().toISOString(),
  })
}

export async function seatWaiting(
  waitingId: string,
  tableId?: string,
): Promise<void> {
  await updateWaitingStatus(waitingId, {
    status: 'seated',
    seated_at: new Date().toISOString(),
    table_id: tableId ?? null,
  })
}

export async function completeWaiting(waitingId: string): Promise<void> {
  await updateWaitingStatus(waitingId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })
}

export async function cancelWaiting(waitingId: string): Promise<void> {
  await updateWaitingStatus(waitingId, { status: 'cancelled' })
}

export async function noShowWaiting(waitingId: string): Promise<void> {
  await updateWaitingStatus(waitingId, { status: 'no_show' })
}

// -------------------------------------------------------
// 테이블 자동 배정
// -------------------------------------------------------
export async function findAvailableTable(
  storeId: string,
  partySize: number,
): Promise<TableRow | null> {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'available')
    .gte('capacity', partySize)
    .order('capacity', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}
