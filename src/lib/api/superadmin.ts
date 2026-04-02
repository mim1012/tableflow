import { supabase } from '@/lib/supabase'
import type { StoreRow, MenuCategoryRow, MenuItemRow } from '@/types/database'

import { SUPABASE_URL, SUPABASE_ANON_KEY as ANON_KEY } from '@/lib/env'

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1`

function assertAuthConfig() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase 환경 변수가 누락되었습니다.')
  }
}

async function callSuperadmin<T>(action: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')
  assertAuthConfig()

  const url = `${EDGE_FUNCTION_URL}/superadmin?action=${action}`
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': ANON_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let json: any
  try {
    json = await res.json()
  } catch {
    throw new Error(`서버 응답 오류 (HTTP ${res.status})`)
  }
  if (!res.ok) throw new Error(json.error ?? json.message ?? `요청 실패 (${res.status})`)
  return json as T
}

export async function checkSuperAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  return session.user?.app_metadata?.role === 'super_admin'
}

interface CreateStoreWithOwnerResponse {
  store: StoreRow
}

async function callCreateStoreWithOwner<T>(body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')
  assertAuthConfig()

  const url = `${EDGE_FUNCTION_URL}/create-store-with-owner`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(body),
  })

  let json: any
  try {
    json = await res.json()
  } catch {
    throw new Error(`서버 응답 오류 (HTTP ${res.status})`)
  }
  if (!res.ok) throw new Error(json.error ?? json.message ?? `요청 실패 (${res.status})`)
  return json as T
}

export async function getAllStores(): Promise<StoreRow[]> {
  return callSuperadmin<StoreRow[]>('list-stores')
}

export interface CreateStoreWithOwnerParams {
  name: string
  slug: string
  address?: string
  phone?: string
  subscriptionStart?: string
  subscriptionEnd?: string
  ownerEmail: string
  ownerPassword: string
}

export async function createStoreWithOwner(params: CreateStoreWithOwnerParams): Promise<StoreRow> {
  const data = await callCreateStoreWithOwner<CreateStoreWithOwnerResponse>(params)
  return data.store
}

export async function updateStoreSubscription(params: {
  storeId: string
  subscriptionStart: string | null
  subscriptionEnd: string | null
  isActive: boolean
}): Promise<void> {
  await callSuperadmin('update-subscription', params)
}

export async function updateStoreInfo(
  storeId: string,
  data: { name?: string; address?: string; phone?: string },
): Promise<StoreRow> {
  return callSuperadmin<StoreRow>('update-store-info', { storeId, ...data })
}

export async function resetUserPassword(userId: string): Promise<{ tempPassword: string }> {
  return callSuperadmin<{ tempPassword: string }>('reset-password', { userId })
}

export interface StoreMember {
  userId: string
  email: string
  role: string
  isFirstLogin: boolean
}

export async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  return callSuperadmin<StoreMember[]>(`list-store-members&storeId=${storeId}`)
}

export async function getStoreMenu(storeId: string): Promise<{ categories: MenuCategoryRow[]; items: MenuItemRow[] }> {
  return callSuperadmin<{ categories: MenuCategoryRow[]; items: MenuItemRow[] }>('get-store-menu', { storeId })
}

export async function updateStoreMenuItem(
  itemId: string,
  updates: { name?: string; price?: number; is_available?: boolean },
): Promise<MenuItemRow> {
  return callSuperadmin<MenuItemRow>('update-menu-item', { itemId, ...updates })
}
