'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${key}` } },
  })
}

async function getStoreName(sb: any, storeId: string) {
  try {
    const { data: store } = await sb
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .single()
    return store?.name ?? ''
  } catch {
    return ''
  }
}

async function sendWaitingAlimtalk(
  sb: any,
  payload: {
    to: string
    type: 'WAITING_CREATED' | 'WAITING_CALLED'
    queueNumber: number
    storeName: string
    teamsAhead: number
    estimatedWaitMinutes: number
  },
) {
  try {
    const { error } = await sb.functions.invoke('send-alimtalk', { body: payload })
    if (error) {
      console.warn('send-alimtalk failed', error)
    }
  } catch {
    // 알림톡 실패는 대기 등록/호출 자체를 막지 않음
  }
}

type WaitingNotificationContext = {
  storeName: string
  teamsAhead: number
  estimatedWaitMinutes: number
}

async function getWaitingNotificationContext(
  sb: any,
  waiting: { storeId: string; queueNumber: number },
): Promise<WaitingNotificationContext> {
  const [storeName, settingsResult, aheadResult] = await Promise.all([
    getStoreName(sb, waiting.storeId),
    sb
      .from('store_settings')
      .select('waiting_minutes_per_team')
      .eq('store_id', waiting.storeId)
      .maybeSingle(),
    sb
      .from('waitings')
      .select('id')
      .eq('store_id', waiting.storeId)
      .eq('status', 'waiting')
      .lt('queue_number', waiting.queueNumber),
  ])

  const waitingMinutesPerTeam = Math.max(
    0,
    Number(settingsResult?.data?.waiting_minutes_per_team ?? 0),
  )
  const teamsAhead = Array.isArray(aheadResult?.data) ? aheadResult.data.length : 0

  return {
    storeName,
    teamsAhead,
    estimatedWaitMinutes: waitingMinutesPerTeam * teamsAhead,
  }
}

async function notifyWaitingAlimtalk(
  sb: any | null,
  waiting: { phone: string; queueNumber: number; storeId: string },
  type: 'WAITING_CREATED' | 'WAITING_CALLED',
) {
  if (!sb) return

  try {
    const { storeName, teamsAhead, estimatedWaitMinutes } = await getWaitingNotificationContext(sb, waiting)
    void sendWaitingAlimtalk(sb, {
      to: waiting.phone,
      type,
      queueNumber: waiting.queueNumber,
      storeName,
      teamsAhead,
      estimatedWaitMinutes,
    })
  } catch {
    // 알림톡 컨텍스트 조회 실패가 대기 등록/호출 자체를 막지 않음
  }
}

async function createWaitingWithClient(
  sb: any,
  storeId: string,
  phone: string,
  partySize: number,
): Promise<{ queueNumber: number; waitingId: string }> {
  const { data: queueNumber, error: rpcError } = await sb.rpc('next_queue_number', {
    p_store_id: storeId,
  })
  if (rpcError) throw new Error(rpcError.message)

  const { data, error } = await sb
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

  return { queueNumber: queueNumber as number, waitingId: data.id as string }
}

export async function createWaitingAction(
  storeId: string,
  phone: string,
  partySize: number,
): Promise<{ queueNumber: number; waitingId: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const serviceClient = getServiceClient()

  let result: { queueNumber: number; waitingId: string }

  try {
    result = await createWaitingWithClient(sb, storeId, phone, partySize)
  } catch (error) {
    if (!serviceClient) throw error
    result = await createWaitingWithClient(serviceClient, storeId, phone, partySize)
  }

  void notifyWaitingAlimtalk(
    serviceClient,
    { phone, queueNumber: result.queueNumber, storeId },
    'WAITING_CREATED',
  )

  return result
}

export async function callWaitingAction(waitingId: string): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // 알림톡 발송을 위해 전화번호·대기번호·매장 정보 조회
  const { data: waiting, error: waitingError } = await sb
    .from('waitings')
    .select('phone, queue_number, store_id, status')
    .eq('id', waitingId)
    .single()

  if (waitingError || !waiting) {
    throw new Error('대기 정보를 찾을 수 없습니다.')
  }

  if (waiting.status !== 'waiting') {
    return
  }

  const { error, data: updatedWaiting } = await sb
    .from('waitings')
    .update({ status: 'called', called_at: new Date().toISOString() })
    .eq('id', waitingId)
    .eq('status', 'waiting')
    .select('id')
    .single()

  if (error || !updatedWaiting) throw new Error(`호출 실패: ${error?.message ?? '대기 정보를 찾을 수 없습니다.'}`)

  // 알림톡 발송 (실패해도 호출 자체는 성공으로 처리)
  if (waiting?.phone) {
    void notifyWaitingAlimtalk(
      sb,
      { phone: waiting.phone, queueNumber: waiting.queue_number, storeId: waiting.store_id },
      'WAITING_CALLED',
    )
  }
}

export async function completeWaitingAction(waitingId: string): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: waiting, error: waitingError } = await sb
    .from('waitings')
    .select('status')
    .eq('id', waitingId)
    .single()

  if (waitingError || !waiting) {
    throw new Error('대기 정보를 찾을 수 없습니다.')
  }

  if (waiting.status !== 'called') {
    return
  }

  const { error, data: updatedWaiting } = await sb
    .from('waitings')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', waitingId)
    .eq('status', 'called')
    .select('id')
    .single()

  if (error || !updatedWaiting) throw new Error(`착석 처리 실패: ${error?.message ?? '대기 정보를 찾을 수 없습니다.'}`)
}
