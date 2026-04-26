'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 환경 변수가 누락되었습니다.')
  return createClient(url, key)
}

type TableMutationResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; error: string }

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류'
}

/** owner/manager만 허용 (테이블 추가·수정·삭제) */
async function assertOwnerOrManager(storeId: string): Promise<void> {
  const userClient = await createUserClient()
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) throw new Error('인증이 필요합니다.')
  if (user.app_metadata?.role === 'super_admin') return

  // Service role로 멤버십 조회 — Server Action에서 RLS auth.uid() 미설정 이슈 우회
  const serviceClient = getServiceClient()
  const { data: member } = await serviceClient
    .from('store_members')
    .select('role')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .single()
  if (!member || !['owner', 'manager'].includes(member.role as string)) {
    throw new Error('권한이 없습니다.')
  }
}

/** 모든 직원 허용 (테이블 목록 조회) */
async function assertStoreAccess(storeId: string): Promise<void> {
  const userClient = await createUserClient()
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) throw new Error('인증이 필요합니다.')
  if (user.app_metadata?.role === 'super_admin') return

  // Service role로 멤버십 조회 — Server Action에서 RLS auth.uid() 미설정 이슈 우회
  const serviceClient = getServiceClient()
  const { data: member } = await serviceClient
    .from('store_members')
    .select('role')
    .eq('store_id', storeId)
    .eq('user_id', user.id)
    .single()
  if (!member) throw new Error('권한이 없습니다.')
}

export async function addTableAction(storeId: string) {
  try {
    await assertOwnerOrManager(storeId)
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .rpc('add_table_atomic', { p_store_id: storeId })
      .single()

    if (error) throw new Error(error.message)
    return { success: true, data } satisfies TableMutationResult<typeof data>
  } catch (error) {
    return { success: false, error: getErrorMessage(error) } satisfies TableMutationResult
  }
}

export async function renameTableAction(tableId: string, name: string) {
  try {
    const supabase = getServiceClient()
    const { data: table } = await supabase.from('tables').select('store_id').eq('id', tableId).single()
    if (!table) throw new Error('테이블을 찾을 수 없습니다.')
    await assertOwnerOrManager(table.store_id)

    const { data, error } = await supabase
      .from('tables')
      .update({ name })
      .eq('id', tableId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return { success: true, data } satisfies TableMutationResult<typeof data>
  } catch (error) {
    return { success: false, error: getErrorMessage(error) } satisfies TableMutationResult
  }
}

export async function deleteTableAction(tableId: string) {
  try {
    const supabase = getServiceClient()
    const { data: table } = await supabase.from('tables').select('store_id').eq('id', tableId).single()
    if (!table) throw new Error('테이블을 찾을 수 없습니다.')
    await assertOwnerOrManager(table.store_id)

    // 진행 중인 주문이 있는지 확인
    const { data: activeOrders } = await supabase
      .from('orders')
      .select('id')
      .eq('table_id', tableId)
      .in('status', ['created', 'confirmed', 'preparing'])
      .limit(1)

    if (activeOrders && activeOrders.length > 0) {
      throw new Error('진행 중인 주문이 있는 테이블은 삭제할 수 없습니다.')
    }

    const { error } = await supabase
      .from('tables')
      .delete()
      .eq('id', tableId)

    if (error) throw new Error(error.message)
    return { success: true } satisfies TableMutationResult
  } catch (error) {
    return { success: false, error: getErrorMessage(error) } satisfies TableMutationResult
  }
}

export async function getTablesAction(storeId: string) {
  await assertStoreAccess(storeId)
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('store_id', storeId)
    .order('table_number', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}
