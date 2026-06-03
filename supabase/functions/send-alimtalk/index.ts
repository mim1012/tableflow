import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { formatAlimtalkProviderError } from '../../../src/lib/utils/alimtalkProviderError.ts'
import { corsHeaders } from '../_shared/cors.ts'

// ============================================================
// Solapi HMAC-SHA256 인증
// ============================================================

async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function buildAuthHeader(apiKey: string, apiSecret: string): Promise<string> {
  const date = new Date().toISOString()
  const salt = crypto.randomUUID().replace(/-/g, '')
  const signature = await hmacSha256(apiSecret, date + salt)
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

// ============================================================
// 메시지 타입
// ============================================================

type MessageType = 'POINT_GRANTED' | 'PROMOTION' | 'WAITING_CREATED' | 'WAITING_CALLED'
type ManagedTemplateEvent = 'waiting_created' | 'waiting_called'

interface PlatformAlimtalkTemplateRow {
  event: ManagedTemplateEvent
  template_code: string
  template_body: string
  is_active: boolean
}

async function getManagedTemplate(event: ManagedTemplateEvent): Promise<PlatformAlimtalkTemplateRow | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return null

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await adminClient
    .from('platform_alimtalk_templates')
    .select('event, template_code, template_body, is_active')
    .eq('event', event)
    .maybeSingle()

  if (error || !data) return null
  return data as PlatformAlimtalkTemplateRow
}

interface SendRequest {
  to?: string          // 수신 전화번호
  type: MessageType
  customerName?: string
  points?: number     // POINT_GRANTED 시 적립 포인트
  message?: string    // PROMOTION 시 홍보 메시지
  queueNumber?: number // WAITING_* 시 실시간 대기번호
  storeName?: string   // WAITING_* 시 매장명
  teamsAhead?: number  // WAITING_* 시 발송 직전 내 앞 팀 수
  estimatedWaitMinutes?: number // WAITING_* 시 예상 대기 시간(분)
  storeId?: string
  waitingId?: string
}

type CallerVerificationResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

type WaitingMessageTarget = {
  to: string
  queueNumber: number
  storeName: string
  teamsAhead: number
  estimatedWaitMinutes: number
  waitingStatus: string
}

type WaitingNotificationLogRow = {
  id: string
  status: 'pending' | 'sent' | 'failed'
}

function toWaitingNotificationEvent(type: MessageType): ManagedTemplateEvent | null {
  if (type === 'WAITING_CREATED') return 'waiting_created'
  if (type === 'WAITING_CALLED') return 'waiting_called'
  return null
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

function isServiceRoleRequest(authHeader: string | null, serviceRoleKey: string | null) {
  return Boolean(authHeader && serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`)
}

async function verifyCallerCanSendForStore(
  req: Request,
  adminClient: any,
  storeId: string | undefined,
): Promise<CallerVerificationResult> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = req.headers.get('Authorization')

  if (isServiceRoleRequest(authHeader, serviceRoleKey)) {
    return { ok: true }
  }

  if (!storeId) {
    return { ok: false, status: 400, error: 'storeId가 필요합니다.' }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: 'Server configuration error.' }
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userError } = await callerClient.auth.getUser()
  if (userError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  if (user.app_metadata?.role === 'super_admin') {
    return { ok: true }
  }

  const { data: member, error: memberError } = await adminClient
    .from('store_members')
    .select('id, role')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .in('role', ['owner', 'manager', 'staff'])
    .maybeSingle()

  if (memberError) {
    return { ok: false, status: 500, error: memberError.message }
  }

  if (!member) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  return { ok: true }
}

async function getWaitingMessageTarget(
  adminClient: any,
  params: { storeId: string; waitingId: string },
): Promise<WaitingMessageTarget> {
  const { data: waiting, error: waitingError } = await adminClient
    .from('waitings')
    .select('phone, queue_number, status')
    .eq('id', params.waitingId)
    .eq('store_id', params.storeId)
    .single()

  if (waitingError || !waiting) {
    throw new Error(waitingError?.message ?? '대기 정보를 찾을 수 없습니다.')
  }

  const phone = normalizePhone(waiting.phone ?? '')
  if (!phone) {
    throw new Error('대기 전화번호가 없습니다.')
  }

  const context = await getWaitingNotificationContext(adminClient, {
    storeId: params.storeId,
    queueNumber: waiting.queue_number,
  })

  return {
    to: phone,
    queueNumber: waiting.queue_number,
    storeName: context.storeName,
    teamsAhead: context.teamsAhead,
    estimatedWaitMinutes: context.estimatedWaitMinutes,
    waitingStatus: waiting.status,
  }
}

async function getWaitingNotificationContext(
  adminClient: any,
  params: { storeId: string; queueNumber: number },
): Promise<{ storeName: string; teamsAhead: number; estimatedWaitMinutes: number }> {
  const [storeResult, settingsResult, aheadCountResult] = await Promise.all([
    adminClient
      .from('stores')
      .select('name')
      .eq('id', params.storeId)
      .single(),
    adminClient
      .from('store_settings')
      .select('waiting_minutes_per_team')
      .eq('store_id', params.storeId)
      .maybeSingle(),
    adminClient
      .from('waitings')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', params.storeId)
      .eq('status', 'waiting')
      .lt('queue_number', params.queueNumber),
  ])

  const storeName = storeResult?.data?.name ?? ''
  const waitingMinutesPerTeam = Math.max(0, Number(settingsResult?.data?.waiting_minutes_per_team ?? 0))
  const teamsAhead = Math.max(0, Number(aheadCountResult?.count ?? 0))

  return {
    storeName,
    teamsAhead,
    estimatedWaitMinutes: waitingMinutesPerTeam * teamsAhead,
  }
}

async function insertWaitingNotificationLog(
  adminClient: any,
  params: { storeId: string; waitingId: string; type: MessageType },
): Promise<{ logId: string | null; shouldSend: boolean }> {
  const event = toWaitingNotificationEvent(params.type)
  if (!event) {
    return { logId: null, shouldSend: true }
  }

  const { data, error } = await adminClient
    .from('waiting_notifications')
    .insert({
      waiting_id: params.waitingId,
      store_id: params.storeId,
      event,
      status: 'pending',
      provider: 'kakao_alimtalk',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate key')) {
      const { data: existingLog, error: existingLogError } = await adminClient
        .from('waiting_notifications')
        .select('id, status')
        .eq('waiting_id', params.waitingId)
        .eq('store_id', params.storeId)
        .eq('event', event)
        .maybeSingle()

      if (existingLogError || !existingLog?.id) {
        throw new Error(existingLogError?.message ?? 'waiting notification log lookup failed')
      }

      const typedExistingLog = existingLog as WaitingNotificationLogRow
      return {
        logId: typedExistingLog.id,
        shouldSend: typedExistingLog.status !== 'sent',
      }
    }

    throw new Error(error.message ?? 'waiting notification log insert failed')
  }

  if (!data?.id) {
    throw new Error('waiting notification log insert failed')
  }

  return { logId: data.id as string, shouldSend: true }
}

async function updateWaitingNotificationLog(
  adminClient: any,
  params: { logId: string; status: 'sent' | 'failed'; errorMessage?: string | null },
) {
  const payload: Record<string, string | null> = {
    status: params.status,
    error_msg: params.errorMessage ?? null,
  }

  if (params.status === 'sent') payload.sent_at = new Date().toISOString()

  const { error } = await adminClient
    .from('waiting_notifications')
    .update(payload)
    .eq('id', params.logId)

  if (error) throw new Error(error.message)
}


// ============================================================
// Solapi 발송
// ============================================================

async function sendViasolapi(payload: Record<string, unknown>, apiKey: string, apiSecret: string) {
  const auth = await buildAuthHeader(apiKey, apiSecret)
  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(formatAlimtalkProviderError(res.status, data))
  return data
}

function buildAlimtalkPayload(to: string, pfId: string, templateId: string, variables: Record<string, string>) {
  return {
    message: {
      to,
      kakaoOptions: { pfId, templateId, variables },
    },
  }
}

function buildFriendtalkPayload(to: string, pfId: string, content: string) {
  return {
    message: {
      to,
      kakaoOptions: { pfId, type: 'FT', content },
    },
  }
}

function buildWaitingKakaoPayload(
  to: string,
  pfId: string,
  templateId: string | undefined,
  variables: Record<string, string>,
  fallbackContent: string,
) {
  if (templateId) {
    return buildAlimtalkPayload(to, pfId, templateId, variables)
  }
  return buildFriendtalkPayload(to, pfId, fallbackContent)
}

// ============================================================
// Main Handler
// ============================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  let parsedBody: Partial<SendRequest> | null = null

  try {
    const SOLAPI_API_KEY = Deno.env.get('SOLAPI_API_KEY')
    const SOLAPI_API_SECRET = Deno.env.get('SOLAPI_API_SECRET')
    const KAKAO_CHANNEL_ID = Deno.env.get('KAKAO_CHANNEL_ID')          // 카카오 채널 pfId
    const ALIMTALK_TEMPLATE_POINT = Deno.env.get('ALIMTALK_TEMPLATE_POINT_ID')  // 포인트 적립 템플릿

    if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !KAKAO_CHANNEL_ID) {
      return new Response(
        JSON.stringify({ error: 'Solapi 환경변수가 설정되지 않았습니다.' }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const adminClient = supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
      : null

    const dbWaitingCreatedTemplate = await getManagedTemplate('waiting_created')
    const dbWaitingCalledTemplate = await getManagedTemplate('waiting_called')
    const ALIMTALK_TEMPLATE_WAITING_CREATED = dbWaitingCreatedTemplate
      ? (dbWaitingCreatedTemplate.is_active ? dbWaitingCreatedTemplate.template_code.trim() || undefined : undefined)
      : (Deno.env.get('ALIMTALK_TEMPLATE_WAITING_CREATED_ID') ?? Deno.env.get('ALIMTALK_TEMPLATE_WAITING_ID'))
    const ALIMTALK_TEMPLATE_WAITING_CALLED = dbWaitingCalledTemplate
      ? (dbWaitingCalledTemplate.is_active ? dbWaitingCalledTemplate.template_code.trim() || undefined : undefined)
      : (Deno.env.get('ALIMTALK_TEMPLATE_WAITING_CALLED_ID') ?? Deno.env.get('ALIMTALK_TEMPLATE_WAITING_ID'))
    const WAITING_MESSAGE_CONFIG = {
      WAITING_CREATED: {
        templateId: ALIMTALK_TEMPLATE_WAITING_CREATED,
        fallback: (queue: number | undefined, name: string, teamsAhead: number, estimatedWaitMinutes: number) => {
          const parts = [`[${name}] 웨이팅 접수 완료`, `대기번호 ${queue}번`, `내 앞 ${teamsAhead}팀`]
          if (estimatedWaitMinutes > 0) parts.push(`예상 ${estimatedWaitMinutes}분`)
          return parts.join(' · ')
        },
      },
      WAITING_CALLED: {
        templateId: ALIMTALK_TEMPLATE_WAITING_CALLED,
        fallback: (queue: number | undefined, name: string, teamsAhead: number, estimatedWaitMinutes: number) => {
          const parts = [`[${name}] 입장 요청`, `대기번호 ${queue}번`]
          if (teamsAhead > 0) parts.push(`현재 내 앞 ${teamsAhead}팀`)
          if (estimatedWaitMinutes > 0) parts.push(`예상 ${estimatedWaitMinutes}분`)
          return `${parts.join(' · ')}. 빠르게 입장해 주세요! 🙏`
        },
      },
    } as const

    const body: SendRequest = await req.json()
    parsedBody = body
    const {
      to,
      type,
      customerName = '고객',
      points,
      message,
      queueNumber,
      storeName: providedStoreName = '',
      teamsAhead: providedTeamsAhead = 0,
      estimatedWaitMinutes: providedEstimatedWaitMinutes = 0,
      storeId,
      waitingId,
    } = body

    let payload: Record<string, unknown>
    let storeName = providedStoreName
    let teamsAhead = providedTeamsAhead
    let estimatedWaitMinutes = providedEstimatedWaitMinutes
    let resolvedTo = to
    let resolvedQueueNumber = queueNumber
    let notificationLogId: string | null = null

    if (!adminClient) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error.' }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    if (type === 'WAITING_CREATED') {
      if (!storeId || !waitingId) {
        return new Response(
          JSON.stringify({ error: 'WAITING_CREATED는 storeId와 waitingId가 필요합니다.' }),
          { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }

      const target = await getWaitingMessageTarget(adminClient, { storeId, waitingId })
      if (target.waitingStatus !== 'waiting') {
        return new Response(
          JSON.stringify({ error: 'WAITING_CREATED는 waiting 상태에서만 발송할 수 있습니다.' }),
          { status: 409, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }

      resolvedTo = target.to
      resolvedQueueNumber = target.queueNumber
      storeName = target.storeName
      teamsAhead = target.teamsAhead
      estimatedWaitMinutes = target.estimatedWaitMinutes
      const waitingNotificationLog = await insertWaitingNotificationLog(adminClient, { storeId, waitingId, type })
      notificationLogId = waitingNotificationLog.logId

      if (!waitingNotificationLog.shouldSend) {
        return new Response(
          JSON.stringify({ success: true, deduped: true }),
          { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }
    }

    if (type === 'WAITING_CALLED') {
      const verification = await verifyCallerCanSendForStore(req, adminClient, storeId)
      if (!verification.ok) {
        return new Response(
          JSON.stringify({ error: verification.error }),
          { status: verification.status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }

      if (!storeId || !waitingId) {
        return new Response(
          JSON.stringify({ error: 'WAITING_CALLED는 storeId와 waitingId가 필요합니다.' }),
          { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }

      const target = await getWaitingMessageTarget(adminClient, { storeId, waitingId })
      if (target.waitingStatus !== 'called') {
        return new Response(
          JSON.stringify({ error: 'WAITING_CALLED는 called 상태에서만 발송할 수 있습니다.' }),
          { status: 409, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }

      resolvedTo = target.to
      resolvedQueueNumber = target.queueNumber
      storeName = target.storeName
      teamsAhead = target.teamsAhead
      estimatedWaitMinutes = target.estimatedWaitMinutes
    }

    if ((type === 'PROMOTION' || type === 'POINT_GRANTED') && !resolvedTo) {
      return new Response(
        JSON.stringify({ error: '수신 번호(to)가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    if ((type === 'PROMOTION' || type === 'POINT_GRANTED') && storeId) {
      const verification = await verifyCallerCanSendForStore(req, adminClient, storeId)
      if (!verification.ok) {
        return new Response(
          JSON.stringify({ error: verification.error }),
          { status: verification.status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }
    }

    if (type === 'POINT_GRANTED') {
      // 알림톡: 템플릿 심사 완료 후 사용. 없으면 친구톡으로 fallback.
      if (ALIMTALK_TEMPLATE_POINT) {
        payload = buildAlimtalkPayload(resolvedTo!, KAKAO_CHANNEL_ID, ALIMTALK_TEMPLATE_POINT, {
          '#{고객명}': customerName,
          '#{포인트}': String(points ?? 0),
        })
      } else {
        // 템플릿 미등록 시 친구톡 fallback
        payload = buildFriendtalkPayload(
          resolvedTo!,
          KAKAO_CHANNEL_ID,
          `${customerName}님, ${(points ?? 0).toLocaleString()}P가 적립되었습니다. 감사합니다!`,
        )
      }
    } else if (type === 'WAITING_CREATED') {
      const config = WAITING_MESSAGE_CONFIG.WAITING_CREATED
      payload = buildWaitingKakaoPayload(
        resolvedTo!,
        KAKAO_CHANNEL_ID,
        config.templateId,
        {
          '#{매장명}': storeName,
          '#{대기번호}': String(resolvedQueueNumber ?? ''),
          '#{앞팀수}': String(teamsAhead),
          '#{예상시간}': String(estimatedWaitMinutes),
        },
        config.fallback(resolvedQueueNumber, storeName, teamsAhead, estimatedWaitMinutes),
      )
    } else if (type === 'WAITING_CALLED') {
      const config = WAITING_MESSAGE_CONFIG.WAITING_CALLED
      payload = buildWaitingKakaoPayload(
        resolvedTo!,
        KAKAO_CHANNEL_ID,
        config.templateId,
        {
          '#{매장명}': storeName,
          '#{대기번호}': String(resolvedQueueNumber ?? ''),
          '#{앞팀수}': String(teamsAhead),
          '#{예상시간}': String(estimatedWaitMinutes),
        },
        config.fallback(resolvedQueueNumber, storeName, teamsAhead, estimatedWaitMinutes),
      )
    } else if (type === 'PROMOTION') {
      // PROMOTION: 친구톡 (템플릿 심사 불필요)
      if (!message) {
        return new Response(
          JSON.stringify({ error: 'PROMOTION 타입은 message 필드가 필요합니다.' }),
          { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }
      payload = buildFriendtalkPayload(resolvedTo!, KAKAO_CHANNEL_ID, message)
    } else {
      return new Response(
        JSON.stringify({ error: `지원하지 않는 알림톡 타입입니다: ${type}` }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    const result = await sendViasolapi(payload, SOLAPI_API_KEY, SOLAPI_API_SECRET)

    if (notificationLogId) {
      await updateWaitingNotificationLog(adminClient, { logId: notificationLogId, status: 'sent' })
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const event = parsedBody?.type ? toWaitingNotificationEvent(parsedBody.type) : null
      if (supabaseUrl && serviceRoleKey && event === 'waiting_created' && parsedBody?.waitingId && parsedBody?.storeId) {
        const adminClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data: existingLog } = await adminClient
          .from('waiting_notifications')
          .select('id')
          .eq('waiting_id', parsedBody.waitingId)
          .eq('store_id', parsedBody.storeId)
          .eq('event', event)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (existingLog?.id) {
          await updateWaitingNotificationLog(adminClient, {
            logId: existingLog.id as string,
            status: 'failed',
            errorMessage: msg,
          })
        }
      }
    } catch (_) {
      // no-op: preserve original error response
    }

    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
