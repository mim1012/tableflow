'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.')
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

async function notifyWaitingAlimtalk(
  sb: any,
  waiting: { phone: string; queueNumber: number; storeId: string },
  type: 'WAITING_CREATED' | 'WAITING_CALLED',
) {
  const storeName = await getStoreName(sb, waiting.storeId)
  void sendWaitingAlimtalk(sb, {
    to: waiting.phone,
    type,
    queueNumber: waiting.queueNumber,
    storeName,
  })
}

export async function createWaitingAction(
  storeId: string,
  phone: string,
  partySize: number,
): Promise<{ queueNumber: number; waitingId: string }> {
  // 공개 페이지에서 호출되므로 service_role로 RLS 우회
  const sb = getServiceClient()

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

  void notifyWaitingAlimtalk(
    sb,
    { phone, queueNumber: queueNumber as number, storeId },
    'WAITING_CREATED',
  )

  return { queueNumber: queueNumber as number, waitingId: data.id as string }
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
