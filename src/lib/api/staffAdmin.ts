import { supabase } from '@/lib/supabase'
import { SUPABASE_URL, SUPABASE_ANON_KEY as ANON_KEY } from '@/lib/env'

const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1`

function assertAuthConfig() {
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error('Supabase 환경 변수가 누락되었습니다.')
  }
}

async function callStaffAdmin<T>(action: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    throw new Error('로그인이 필요합니다.')
  }

  assertAuthConfig()

  const params = new URLSearchParams({ action, ...(query ?? {}) })
  const url = `${EDGE_FUNCTION_URL}/staff-admin?${params.toString()}`
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  let json: any
  try {
    json = await res.json()
  } catch {
    throw new Error(`서버 응답 오류 (HTTP ${res.status})`)
  }

  if (!res.ok) {
    throw new Error(json.error ?? json.message ?? `요청 실패 (${res.status})`)
  }

  return json as T
}

export interface StaffMemberSummary {
  id: string
  userId: string
  email: string
  name: string
  role: 'owner' | 'manager' | 'staff'
  isFirstLogin: boolean
  isActive: boolean
  createdAt: string
}

export interface CreateStaffMemberResult {
  userId: string
  storeId: string
  role: 'manager' | 'staff'
  name: string
  email: string
}

export async function createStaffMember(
  storeId: string,
  email: string,
  password: string,
  name: string,
  role: 'manager' | 'staff',
): Promise<CreateStaffMemberResult> {
  return callStaffAdmin<CreateStaffMemberResult>('create', {
    storeId,
    email,
    password,
    name,
    role,
  })
}

export async function getStaffMembers(storeId: string): Promise<StaffMemberSummary[]> {
  return callStaffAdmin<StaffMemberSummary[]>('list', undefined, { storeId })
}

export async function updateStaffMember(params: {
  storeId: string
  memberId: string
  userId: string
  email: string
  name: string
  role: 'manager' | 'staff'
}): Promise<StaffMemberSummary> {
  return callStaffAdmin<StaffMemberSummary>('update', params)
}

export async function resetStaffPassword(userId: string, storeId: string): Promise<{ tempPassword: string }> {
  return callStaffAdmin<{ tempPassword: string }>('reset-password', { userId, storeId })
}

export async function setStaffMemberActive(params: {
  storeId: string
  memberId: string
  isActive: boolean
}): Promise<StaffMemberSummary> {
  return callStaffAdmin<StaffMemberSummary>('set-active', params)
}

export async function deleteStaffMember(params: {
  storeId: string
  memberId: string
  userId: string
}): Promise<void> {
  await callStaffAdmin<{ success: true }>('delete', params)
}
