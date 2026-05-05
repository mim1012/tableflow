'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { WaitingStatus } from '@/types/database'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${key}` } },
  })
}

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

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
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
  const [storeName, settingsResult, aheadCountResult] = await Promise.all([
    getStoreName(sb, waiting.storeId),
    sb
      .from('store_settings')
      .select('waiting_minutes_per_team')
      .eq('store_id', waiting.storeId)
      .maybeSingle(),
    sb
      .from('waitings')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', waiting.storeId)
      .eq('status', 'waiting')
      .lt('queue_number', waiting.queueNumber),
  ])

  const waitingMinutesPerTeam = Math.max(
    0,
    Number(settingsResult?.data?.waiting_minutes_per_team ?? 0),
  )
  const teamsAhead = Math.max(0, Number(aheadCountResult?.count ?? 0))

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
  const { data, error } = await sb.rpc('create_waiting_atomic', {
    p_store_id: storeId,
    p_phone: normalizePhone(phone),
    p_party_size: partySize,
  })
  if (error) throw new Error(error.message)

  return normalizeWaitingCreationPayload(data)
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
    { phone: normalizePhone(phone), queueNumber: result.queueNumber, storeId },
    'WAITING_CREATED',
  )

  return result
}

type CancelableWaitingRow = {
  id: string
  phone: string
  queue_number: number
  store_id: string
  status: WaitingStatus
}

async function findWaitingForCancellation(
  sb: any,
  params: { storeId: string; waitingId: string; phone: string },
): Promise<CancelableWaitingRow | null> {
  const { data, error } = await sb
    .from('waitings')
    .select('id, phone, queue_number, store_id, status')
    .eq('id', params.waitingId)
    .eq('store_id', params.storeId)
    .eq('phone', normalizePhone(params.phone))
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ?? null
}

async function cancelWaitingWithClient(
  sb: any,
  waitingId: string,
): Promise<void> {
  const { error, data: updatedWaiting } = await sb
    .from('waitings')
    .update({ status: 'cancelled' })
    .eq('id', waitingId)
    .in('status', ['waiting', 'called'])
    .select('id')
    .single()

  if (error || !updatedWaiting) {
    throw new Error(`대기 취소 실패: ${error?.message ?? '대기 정보를 찾을 수 없습니다.'}`)
  }
}

export async function cancelWaitingAction(
  storeId: string,
  waitingId: string,
  phone: string,
): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  const serviceClient = getServiceClient()
  const lookupClient = serviceClient ?? sb

  const waiting = await findWaitingForCancellation(lookupClient, { storeId, waitingId, phone })
  if (!waiting) {
    throw new Error('대기 정보를 찾을 수 없습니다.')
  }

  if (waiting.status === 'cancelled') {
    return
  }

  if (waiting.status !== 'waiting' && waiting.status !== 'called') {
    throw new Error('이미 종료된 대기입니다.')
  }

  await cancelWaitingWithClient(serviceClient ?? sb, waitingId)
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
