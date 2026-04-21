import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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

interface SendRequest {
  to: string          // 수신 전화번호
  type: MessageType
  customerName?: string
  points?: number     // POINT_GRANTED 시 적립 포인트
  message?: string    // PROMOTION 시 홍보 메시지
  queueNumber?: number // WAITING_CALLED 시 대기번호
  storeName?: string   // WAITING_CALLED 시 매장명
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
  if (!res.ok) throw new Error(data.message ?? '알림톡 발송 실패')
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

    const ALIMTALK_TEMPLATE_WAITING_CREATED = Deno.env.get('ALIMTALK_TEMPLATE_WAITING_CREATED_ID') ?? Deno.env.get('ALIMTALK_TEMPLATE_WAITING_ID')
    const ALIMTALK_TEMPLATE_WAITING_CALLED = Deno.env.get('ALIMTALK_TEMPLATE_WAITING_CALLED_ID') ?? Deno.env.get('ALIMTALK_TEMPLATE_WAITING_ID')
    const WAITING_MESSAGE_CONFIG = {
      WAITING_CREATED: {
        templateId: ALIMTALK_TEMPLATE_WAITING_CREATED,
        fallback: (queue: number | undefined, name: string) => `[${name}] 대기번호 ${queue}번으로 등록되었습니다.`,
      },
      WAITING_CALLED: {
        templateId: ALIMTALK_TEMPLATE_WAITING_CALLED,
        fallback: (queue: number | undefined, name: string) => `[${name}] 대기번호 ${queue}번 고객님, 입장 차례입니다. 빠르게 입장해 주세요! 🙏`,
      },
    } as const

    const body: SendRequest = await req.json()
    const { to, type, customerName = '고객', points, message, queueNumber, storeName = '' } = body

    if (!to) {
      return new Response(
        JSON.stringify({ error: '수신 번호(to)가 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    let payload: Record<string, unknown>

    if (type === 'POINT_GRANTED') {
      // 알림톡: 템플릿 심사 완료 후 사용. 없으면 친구톡으로 fallback.
      if (ALIMTALK_TEMPLATE_POINT) {
        payload = buildAlimtalkPayload(to, KAKAO_CHANNEL_ID, ALIMTALK_TEMPLATE_POINT, {
          '#{고객명}': customerName,
          '#{포인트}': String(points ?? 0),
        })
      } else {
        // 템플릿 미등록 시 친구톡 fallback
        payload = buildFriendtalkPayload(
          to,
          KAKAO_CHANNEL_ID,
          `${customerName}님, ${(points ?? 0).toLocaleString()}P가 적립되었습니다. 감사합니다!`,
        )
      }
    } else if (type === 'WAITING_CREATED') {
      const config = WAITING_MESSAGE_CONFIG.WAITING_CREATED
      payload = buildWaitingKakaoPayload(
        to,
        KAKAO_CHANNEL_ID,
        config.templateId,
        {
          '#{대기번호}': String(queueNumber ?? ''),
          '#{매장명}': storeName,
        },
        config.fallback(queueNumber, storeName),
      )
    } else if (type === 'WAITING_CALLED') {
      const config = WAITING_MESSAGE_CONFIG.WAITING_CALLED
      payload = buildWaitingKakaoPayload(
        to,
        KAKAO_CHANNEL_ID,
        config.templateId,
        {
          '#{대기번호}': String(queueNumber ?? ''),
          '#{매장명}': storeName,
        },
        config.fallback(queueNumber, storeName),
      )
    } else if (type === 'PROMOTION') {
      // PROMOTION: 친구톡 (템플릿 심사 불필요)
      if (!message) {
        return new Response(
          JSON.stringify({ error: 'PROMOTION 타입은 message 필드가 필요합니다.' }),
          { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
        )
      }
      payload = buildFriendtalkPayload(to, KAKAO_CHANNEL_ID, message)
    } else {
      return new Response(
        JSON.stringify({ error: `지원하지 않는 알림톡 타입입니다: ${type}` }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      )
    }

    const result = await sendViasolapi(payload, SOLAPI_API_KEY, SOLAPI_API_SECRET)

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류'
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
