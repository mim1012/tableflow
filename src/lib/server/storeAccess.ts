import { createClient } from '@/lib/supabase/server'
import { isStoreSubscriptionActive } from '@/lib/utils/subscription'

type StoreState = {
  id?: string
  is_active: boolean
  subscription_end: string | null
}

type SupabaseLike = {
  from: (table: string) => any
}

export type AdminStoreContext =
  | { kind: 'ready'; storeId: string; storeName: string; supportMode: boolean }
  | { kind: 'select-store' }
  | { kind: 'unavailable'; message: string }

export function assertActiveStoreState(store: StoreState | null | undefined): asserts store is StoreState {
  if (!isStoreSubscriptionActive(store)) {
    throw new Error('비활성 또는 만료된 매장입니다.')
  }
}

export async function assertStoreActiveWithClient(client: SupabaseLike, storeId: string): Promise<void> {
  if (!storeId) throw new Error('매장 정보가 필요합니다.')

  const { data, error } = await client
    .from('stores')
    .select('id, is_active, subscription_end')
    .eq('id', storeId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('매장을 찾을 수 없습니다.')
  assertActiveStoreState(data as StoreState)
}

export async function getActiveStoreIdFromRow(
  client: SupabaseLike,
  table: string,
  id: string,
  label: string,
): Promise<string> {
  const { data, error } = await client
    .from(table)
    .select('store_id')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  const storeId = (data as { store_id?: string } | null)?.store_id
  if (!storeId) throw new Error(`${label} 정보를 찾을 수 없습니다.`)
  await assertStoreActiveWithClient(client, storeId)
  return storeId
}

export async function resolveAdminStoreContext(requestedStoreId?: string | null): Promise<AdminStoreContext> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { kind: 'unavailable', message: '인증이 필요합니다.' }

  const isSuperAdmin = user.app_metadata?.role === 'super_admin'
  const sb = supabase as any

  if (isSuperAdmin) {
    if (!requestedStoreId) return { kind: 'select-store' }

    const { data: store, error: storeError } = await sb
      .from('stores')
      .select('id, name, is_active, subscription_end')
      .eq('id', requestedStoreId)
      .maybeSingle()

    if (storeError) return { kind: 'unavailable', message: storeError.message }
    if (!store) return { kind: 'unavailable', message: '매장을 찾을 수 없습니다.' }
    if (!isStoreSubscriptionActive(store)) return { kind: 'unavailable', message: '비활성 또는 만료된 매장입니다.' }

    return { kind: 'ready', storeId: requestedStoreId, storeName: (store as StoreState & { name?: string }).name ?? '', supportMode: true }
  }

  const { data: memberships, error: memberError } = await sb
    .from('store_members')
    .select('store_id, stores!inner(id, name, is_active, subscription_end)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(2)

  if (memberError) return { kind: 'unavailable', message: memberError.message }
  if ((memberships?.length ?? 0) > 1) {
    return { kind: 'unavailable', message: '활성 매장이 2개 이상인 계정은 슈퍼관리자에서 매장을 선택해야 합니다.' }
  }
  const membership = memberships?.[0] as { store_id: string; stores?: StoreState } | undefined
  if (!membership?.store_id) return { kind: 'unavailable', message: '접근 가능한 매장이 없습니다.' }
  if (!isStoreSubscriptionActive(membership.stores)) return { kind: 'unavailable', message: '비활성 또는 만료된 매장입니다.' }

  return { kind: 'ready', storeId: membership.store_id, storeName: (membership.stores as StoreState & { name?: string })?.name ?? '', supportMode: false }
}
