import { supabase as _supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any
import type { WaitingRow, TableRow, WaitingStatus } from '@/types/database'

type WaitingCreationPayload = {
  queue_number: number
  waiting_id: string
}

function normalizeWaitingCreationPayload(payload: unknown): { queueNumber: number; waitingId: string } {
  if (!payload || typeof payload !== 'object') {
    throw new Error('waiting creation returned incomplete payload')
  }

  const queueNumber = (payload as WaitingCreationPayload).queue_number
  const waitingId = (payload as WaitingCreationPayload).waiting_id

  if (typeof queueNumber !== 'number' || !Number.isFinite(queueNumber) || typeof waitingId !== 'string' || waitingId.length === 0) {
    throw new Error('waiting creation returned incomplete payload')
  }

  return { queueNumber, waitingId }
}

// -------------------------------------------------------
// 대기 등록 (anon)
// -------------------------------------------------------
export async function createWaiting(params: {
  storeId: string
  phone: string
  partySize: number
}): Promise<{ queueNumber: number; waitingId: string }> {
  const { storeId, phone, partySize } = params

  const { data, error } = await supabase.rpc(
    'create_waiting_atomic',
    { p_store_id: storeId, p_phone: phone, p_party_size: partySize },
  )
  if (error) throw new Error(error.message)

  return normalizeWaitingCreationPayload(data)
}

// -------------------------------------------------------
// 현재 대기 현황 (고객용)
// -------------------------------------------------------
export async function getWaitingStatus(
  storeId: string,
  waitingId: string,
): Promise<{ myPosition: number; totalWaiting: number; status: WaitingStatus | null }> {
  const { data: currentWaiting, error: currentError } = await supabase
    .from('waitings_public')
    .select('id, queue_number, status')
    .eq('store_id', storeId)
    .eq('id', waitingId)
    .maybeSingle()

  if (currentError) throw new Error(currentError.message)
  if (!currentWaiting) {
    return { myPosition: 0, totalWaiting: 0, status: null }
  }

  const [{ count: totalWaitingCount, error: totalWaitingError }, { count: aheadCount, error: aheadError }] = await Promise.all([
    supabase
      .from('waitings_public')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'waiting'),
    currentWaiting.status === 'waiting'
      ? supabase
          .from('waitings_public')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .eq('status', 'waiting')
          .lt('queue_number', currentWaiting.queue_number)
      : Promise.resolve({ count: 0, error: null }),
  ])

  if (totalWaitingError) throw new Error(totalWaitingError.message)
  if (aheadError) throw new Error(aheadError.message)

  const totalWaiting = Math.max(0, Number(totalWaitingCount ?? 0))
  const myPosition = currentWaiting.status === 'waiting'
    ? Math.max(0, Number(aheadCount ?? 0))
    : totalWaiting

  return {
    myPosition,
    totalWaiting,
    status: currentWaiting.status as WaitingStatus,
  }
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
  return data ?? null
}
