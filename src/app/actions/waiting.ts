'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { WaitingStatus } from '@/types/database'
import { assertStoreActiveWithClient } from '@/lib/server/storeAccess'

type WaitingAlimtalkType = 'WAITING_CREATED' | 'WAITING_CALLED'
type WaitingNotificationEvent = 'waiting_created' | 'waiting_called'

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
    type: WaitingAlimtalkType
    queueNumber: number
    storeName: string
    teamsAhead: number
    estimatedWaitMinutes: number
    storeId: string
    waitingId: string
  },
) {
  const { data, error } = await sb.functions.invoke('send-alimtalk', { body: payload })
  return { data, error }
}

function toWaitingNotificationEvent(type: WaitingAlimtalkType): WaitingNotificationEvent {
  return type === 'WAITING_CREATED' ? 'waiting_created' : 'waiting_called'
}

function isDuplicateNotificationError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate key') === true
}

async function insertWaitingNotificationLog(
  sb: any,
  params: { waitingId: string; storeId: string; type: WaitingAlimtalkType },
): Promise<string | null> {
  const { data, error } = await sb
    .from('waiting_notifications')
    .insert({
      waiting_id: params.waitingId,
      store_id: params.storeId,
      event: toWaitingNotificationEvent(params.type),
      status: 'pending',
      provider: 'kakao_alimtalk',
    })
    .select('id')
    .single()

  if (error) {
    if (isDuplicateNotificationError(error)) {
      return null
    }
    throw new Error(error.message ?? 'waiting notification log insert failed')
  }

  if (!data?.id) {
    throw new Error('waiting notification log insert failed')
  }

  return data.id as string
}

async function updateWaitingNotificationLog(
  sb: any,
  params: { logId: string; status: 'sent' | 'failed'; errorMessage?: string | null },
) {
  const payload: Record<string, string | null> = {
    status: params.status,
    error_msg: params.errorMessage ?? null,
  }

  if (params.status === 'sent') {
    payload.sent_at = new Date().toISOString()
  }

  const { error } = await sb
    .from('waiting_notifications')
    .update(payload)
    .eq('id', params.logId)

  if (error) {
    throw new Error(error.message)
  }
}

type WaitingNotificationContext = {
  storeName: string
  teamsAhead: number
  estimatedWaitMinutes: number
}

export type FailedWaitingNotification = {
  id: string
  waitingId: string
  event: WaitingNotificationEvent
  createdAt: string
  errorMessage: string | null
  queueNumber: number | null
  phone: string | null
  waitingStatus: WaitingStatus | null
  retryable: boolean
}

type WaitingNotificationLedgerRow = {
  id: string
  waiting_id: string
  store_id: string
  event: WaitingNotificationEvent
  status: 'pending' | 'sent' | 'failed'
  error_msg: string | null
  created_at: string
}

type WaitingNotificationWaitingRow = {
  id: string
  queue_number: number
  phone: string | null
  status: WaitingStatus
}

function canRetryWaitingNotification(event: WaitingNotificationEvent, waitingStatus: WaitingStatus | null, phone: string | null) {
  if (!phone) return false
  if (event === 'waiting_created') return waitingStatus === 'waiting'
  if (event === 'waiting_called') return waitingStatus === 'called'
  return false
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

export async function listFailedWaitingNotificationsAction(storeId: string): Promise<FailedWaitingNotification[]> {
  if (!storeId) return []

  const supabase = await createClient()
  const sb = supabase as any
  await assertStoreActiveWithClient(sb, storeId)

  const { data: logs, error: logsError } = await sb
    .from('waiting_notifications')
    .select('id, waiting_id, store_id, event, status, error_msg, created_at')
    .eq('store_id', storeId)
    .eq('status', 'failed')
    .in('event', ['waiting_created', 'waiting_called'])

  if (logsError) {
    throw new Error(logsError.message)
  }

  const typedLogs = (logs ?? []) as WaitingNotificationLedgerRow[]
  if (typedLogs.length === 0) return []

  const waitingIds = Array.from(new Set(typedLogs.map((log) => log.waiting_id)))
  const { data: waitings, error: waitingsError } = await sb
    .from('waitings')
    .select('id, queue_number, phone, status')
    .in('id', waitingIds)

  if (waitingsError) {
    throw new Error(waitingsError.message)
  }

  const waitingMap = new Map(
    ((waitings ?? []) as WaitingNotificationWaitingRow[]).map((waiting) => [waiting.id, waiting]),
  )

  return typedLogs
    .map((log) => {
      const waiting = waitingMap.get(log.waiting_id)
      return {
        id: log.id,
        waitingId: log.waiting_id,
        event: log.event,
        createdAt: log.created_at,
        errorMessage: log.error_msg,
        queueNumber: waiting?.queue_number ?? null,
        phone: waiting?.phone ?? null,
        waitingStatus: waiting?.status ?? null,
        retryable: canRetryWaitingNotification(log.event, waiting?.status ?? null, waiting?.phone ?? null),
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function retryWaitingNotificationAction(notificationId: string): Promise<{ success: boolean; message?: string }> {
  const supabase = await createClient()
  const sb = supabase as any
  const serviceClient = getServiceClient()
  const actionClient = serviceClient ?? sb

  const { data: log, error: logError } = await sb
    .from('waiting_notifications')
    .select('id, waiting_id, store_id, event, status, error_msg, created_at')
    .eq('id', notificationId)
    .maybeSingle()

  if (logError) {
    throw new Error(logError.message)
  }

  const typedLog = log as WaitingNotificationLedgerRow | null
  if (!typedLog) {
    return { success: false, message: '알림 이력을 찾을 수 없습니다.' }
  }
  await assertStoreActiveWithClient(actionClient, typedLog.store_id)

  const { data: waiting, error: waitingError } = await sb
    .from('waitings')
    .select('id, queue_number, phone, status')
    .eq('id', typedLog.waiting_id)
    .maybeSingle()

  if (waitingError) {
    throw new Error(waitingError.message)
  }

  const typedWaiting = waiting as WaitingNotificationWaitingRow | null

  if (!typedWaiting?.phone) {
    const message = '전화번호가 없어 알림을 재시도할 수 없습니다.'

    await updateWaitingNotificationLog(actionClient, {
      logId: typedLog.id,
      status: 'failed',
      errorMessage: message,
    })

    return { success: false, message }
  }

  const phone = typedWaiting.phone
  const retryable = canRetryWaitingNotification(typedLog.event, typedWaiting.status, phone)

  if (!retryable) {
    const message = '현재 상태에서는 이 알림을 재시도할 수 없습니다.'

    await updateWaitingNotificationLog(actionClient, {
      logId: typedLog.id,
      status: 'failed',
      errorMessage: message,
    })

    return { success: false, message }
  }

  const { storeName, teamsAhead, estimatedWaitMinutes } = await getWaitingNotificationContext(actionClient, {
    storeId: typedLog.store_id,
    queueNumber: typedWaiting.queue_number,
  })

  const type = typedLog.event === 'waiting_created' ? 'WAITING_CREATED' : 'WAITING_CALLED'
  const { error } = await sendWaitingAlimtalk(actionClient, {
    to: phone,
    type,
    queueNumber: typedWaiting.queue_number,
    storeName,
    teamsAhead,
    estimatedWaitMinutes,
    storeId: typedLog.store_id,
    waitingId: typedLog.waiting_id,
  })

  if (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await updateWaitingNotificationLog(actionClient, {
      logId: typedLog.id,
      status: 'failed',
      errorMessage,
    })
    return { success: false, message: errorMessage }
  }

  return { success: true }
}

async function notifyWaitingAlimtalk(
  sb: any | null,
  waiting: { phone: string; queueNumber: number; storeId: string; waitingId: string },
  type: WaitingAlimtalkType,
  options?: { awaitSend?: boolean },
) {
  if (!sb) return

  const shouldOwnLog = type === 'WAITING_CALLED'

  try {
    const { storeName, teamsAhead, estimatedWaitMinutes } = await getWaitingNotificationContext(sb, waiting)
    const notificationLogId = shouldOwnLog
      ? await insertWaitingNotificationLog(sb, {
          waitingId: waiting.waitingId,
          storeId: waiting.storeId,
          type,
        })
      : null

    if (shouldOwnLog && !notificationLogId) {
      return
    }

    const sendPromise = (async () => {
      try {
        const { error } = await sendWaitingAlimtalk(sb, {
          to: waiting.phone,
          type,
          queueNumber: waiting.queueNumber,
          storeName,
          teamsAhead,
          estimatedWaitMinutes,
          storeId: waiting.storeId,
          waitingId: waiting.waitingId,
        })

        if (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.warn('send-alimtalk failed', error)
          if (notificationLogId) {
            await updateWaitingNotificationLog(sb, {
              logId: notificationLogId,
              status: 'failed',
              errorMessage,
            })
          }
          return
        }

        if (notificationLogId) {
          await updateWaitingNotificationLog(sb, {
            logId: notificationLogId,
            status: 'sent',
          })
        }
      } catch (error) {
        console.warn('send-alimtalk failed', error)
        if (notificationLogId) {
          await updateWaitingNotificationLog(sb, {
            logId: notificationLogId,
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })()

    if (options?.awaitSend) {
      await sendPromise
      return
    }

    void sendPromise
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
  await assertStoreActiveWithClient(sb, storeId)
  const serviceClient = getServiceClient()

  let result: { queueNumber: number; waitingId: string }

  try {
    result = await createWaitingWithClient(sb, storeId, phone, partySize)
  } catch (error) {
    if (!serviceClient) throw error
    result = await createWaitingWithClient(serviceClient, storeId, phone, partySize)
  }

  await notifyWaitingAlimtalk(
    serviceClient,
    { phone: normalizePhone(phone), queueNumber: result.queueNumber, storeId, waitingId: result.waitingId },
    'WAITING_CREATED',
    { awaitSend: true },
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
  await assertStoreActiveWithClient(lookupClient, waiting.store_id)

  await cancelWaitingWithClient(serviceClient ?? sb, waitingId)
}

export async function callWaitingAction(waitingId: string): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const serviceClient = getServiceClient()

  // 알림톡 발송을 위해 전화번호·대기번호·매장 정보 조회
  const { data: waiting, error: waitingError } = await sb
    .from('waitings')
    .select('phone, queue_number, store_id, status')
    .eq('id', waitingId)
    .single()

  if (waitingError || !waiting) {
    throw new Error('대기 정보를 찾을 수 없습니다.')
  }
  await assertStoreActiveWithClient(serviceClient ?? sb, waiting.store_id)

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
    await notifyWaitingAlimtalk(
      serviceClient ?? sb,
      { phone: waiting.phone, queueNumber: waiting.queue_number, storeId: waiting.store_id, waitingId },
      'WAITING_CALLED',
      { awaitSend: true },
    )
  }
}

export async function completeWaitingAction(waitingId: string): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: waiting, error: waitingError } = await sb
    .from('waitings')
    .select('status, store_id')
    .eq('id', waitingId)
    .single()

  if (waitingError || !waiting) {
    throw new Error('대기 정보를 찾을 수 없습니다.')
  }
  await assertStoreActiveWithClient(sb, waiting.store_id)

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
