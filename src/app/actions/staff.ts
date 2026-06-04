'use server'

import { createClient } from '@/lib/supabase/server'
import { assertStoreActiveWithClient } from '@/lib/server/storeAccess'

export async function createStaffAction(
  storeId: string,
  email: string,
  password: string,
  name: string,
  role: 'manager' | 'staff',
): Promise<void> {
  const supabase = await createClient()

  // getUser()로 서버 측 토큰 검증 (getSession()은 토큰 위변조 감지 불가)
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('인증이 필요합니다.')
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) throw new Error('인증 세션이 없습니다.')

  // 호출자가 해당 매장의 owner 또는 manager인지 검증
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  await assertStoreActiveWithClient(sb, storeId)
  const { data: member } = await sb
    .from('store_members')
    .select('role')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()
  if (!member || !['owner', 'manager'].includes(member.role as string)) {
    throw new Error('권한이 없습니다.')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) throw new Error('Supabase 환경 변수가 누락되었습니다.')

  const res = await fetch(`${supabaseUrl}/functions/v1/create-staff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ storeId, email, password, name, role }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error ?? data.message ?? `직원 생성 실패 (HTTP ${res.status})`)
  }
}

export async function deactivateStaffAction(memberId: string, storeId: string): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  await assertStoreActiveWithClient(sb, storeId)

  const { error } = await sb
    .from('store_members')
    .delete()
    .eq('id', memberId)
    .eq('store_id', storeId)

  if (error) throw new Error(`직원 비활성화 실패: ${error.message}`)
}
