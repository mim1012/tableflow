import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

type WaitingCreatedPayload = {
  storeId: string
  waitingId: string
  phone: string
  queueNumber: number
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

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

async function insertWaitingNotificationLog(sb: any, params: { waitingId: string; storeId: string }) {
  const { data, error } = await sb
    .from('waiting_notifications')
    .insert({
      waiting_id: params.waitingId,
      store_id: params.storeId,
      event: 'waiting_created',
      status: 'pending',
      provider: 'kakao_alimtalk',
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'waiting notification log insert failed')
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

export async function POST(request: Request) {
  const sb = getServiceClient()
  if (!sb) {
    return NextResponse.json({ error: 'service client unavailable' }, { status: 500 })
  }

  const body = await request.json().catch(() => null) as WaitingCreatedPayload | null
  if (!body || typeof body.storeId !== 'string' || typeof body.waitingId !== 'string' || typeof body.phone !== 'string' || typeof body.queueNumber !== 'number') {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  try {
    const [storeName, settingsResult, aheadCountResult] = await Promise.all([
      getStoreName(sb, body.storeId),
      sb
        .from('store_settings')
        .select('waiting_minutes_per_team')
        .eq('store_id', body.storeId)
        .maybeSingle(),
      sb
        .from('waitings')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', body.storeId)
        .eq('status', 'waiting')
        .lt('queue_number', body.queueNumber),
    ])

    const waitingMinutesPerTeam = Math.max(0, Number(settingsResult?.data?.waiting_minutes_per_team ?? 0))
    const teamsAhead = Math.max(0, Number(aheadCountResult?.count ?? 0))
    const logId = await insertWaitingNotificationLog(sb, { waitingId: body.waitingId, storeId: body.storeId })

    const { error } = await sb.functions.invoke('send-alimtalk', {
      body: {
        to: normalizePhone(body.phone),
        type: 'WAITING_CREATED',
        queueNumber: body.queueNumber,
        storeName,
        teamsAhead,
        estimatedWaitMinutes: waitingMinutesPerTeam * teamsAhead,
      },
    })

    if (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await updateWaitingNotificationLog(sb, { logId, status: 'failed', errorMessage })
      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }

    await updateWaitingNotificationLog(sb, { logId, status: 'sent' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
