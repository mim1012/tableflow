import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(data: unknown, init: ResponseInit = {}, req?: Request) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(req ? corsHeaders(req) : {}),
      ...(init.headers ?? {}),
    },
  })
}

const STAFF_CREATOR_ROLES = ['owner', 'manager'] as const
const MANAGEABLE_ROLES_BY_MANAGER = ['staff'] as const
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

type StoreRole = 'owner' | 'manager' | 'staff'

type VerifyResult =
  | { status: 200; user: { id: string; app_metadata?: Record<string, unknown> }; adminClient: ReturnType<typeof createClient>; isSuperAdmin: boolean }
  | { status: 401; user: null; adminClient: null; isSuperAdmin: false }
  | { status: 500; user: null; adminClient: null; isSuperAdmin: false; message: string }

interface StaffMemberRow {
  id: string
  user_id: string
  role: StoreRole
  is_first_login: boolean
  is_active: boolean
  created_at: string
}

async function verifyCaller(authHeader: string | null): Promise<VerifyResult> {
  if (!authHeader) {
    return { status: 401, user: null, adminClient: null, isSuperAdmin: false }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { status: 500, user: null, adminClient: null, isSuperAdmin: false, message: 'Server configuration error.' }
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error,
  } = await callerClient.auth.getUser()

  if (error || !user) {
    return { status: 401, user: null, adminClient: null, isSuperAdmin: false }
  }

  return {
    status: 200,
    user,
    adminClient,
    isSuperAdmin: user.app_metadata?.role === 'super_admin',
  }
}

async function getRequesterAccess(
  adminClient: ReturnType<typeof createClient>,
  storeId: string,
  user: { id: string; app_metadata?: Record<string, unknown> },
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin) {
    return { id: `superadmin:${user.id}`, role: 'owner' as StoreRole, is_active: true }
  }

  return getRequesterMember(adminClient, storeId, user.id)
}

async function getRequesterMember(adminClient: ReturnType<typeof createClient>, storeId: string, userId: string) {
  const { data, error } = await adminClient
    .from('store_members')
    .select('id, role, is_active')
    .eq('store_id', storeId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data as { id: string; role: StoreRole; is_active: boolean } | null
}

async function getTargetMember(adminClient: ReturnType<typeof createClient>, storeId: string, memberId: string) {
  const { data, error } = await adminClient
    .from('store_members')
    .select('id, user_id, role, is_first_login, is_active, created_at')
    .eq('store_id', storeId)
    .eq('id', memberId)
    .maybeSingle()

  if (error) throw error
  return data as StaffMemberRow | null
}

function ensureCanManage(requesterRole: StoreRole, targetRole?: StoreRole) {
  if (!STAFF_CREATOR_ROLES.includes(requesterRole)) {
    throw new Error('Forbidden')
  }

  if (requesterRole === 'manager') {
    if (!targetRole || !MANAGEABLE_ROLES_BY_MANAGER.includes(targetRole)) {
      throw new Error('Forbidden')
    }
  }
}

function createTempPassword() {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  return `Tf!${random}9`
}

function getUserName(user: { user_metadata?: Record<string, unknown> } | null | undefined) {
  const raw = user?.user_metadata?.name
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, {}, req)
  }

  const verified = await verifyCaller(req.headers.get('Authorization'))
  if (verified.status === 500) return json({ error: verified.message }, { status: 500 }, req)
  if (verified.status === 401) return json({ error: 'Unauthorized' }, { status: 401 }, req)

  const { adminClient, user, isSuperAdmin } = verified
  if (!adminClient || !user) return json({ error: 'Unauthorized' }, { status: 401 }, req)

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    if (action === 'list') {
      const storeId = url.searchParams.get('storeId')
      if (!storeId) return json({ error: 'storeId query param is required' }, { status: 400 }, req)

      const requesterMember = await getRequesterAccess(adminClient, storeId, user, isSuperAdmin)
      if (!requesterMember?.is_active) return json({ error: 'Forbidden' }, { status: 403 }, req)
      if (!STAFF_CREATOR_ROLES.includes(requesterMember.role)) return json({ error: 'Forbidden' }, { status: 403 }, req)

      const { data: members, error: membersError } = await adminClient
        .from('store_members')
        .select('id, user_id, role, is_first_login, is_active, created_at')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true })

      if (membersError) throw membersError

      const summaries = await Promise.all(
        ((members ?? []) as StaffMemberRow[]).map(async (member) => {
          const {
            data: { user: authUser },
          } = await adminClient.auth.admin.getUserById(member.user_id)

          return {
            id: member.id,
            userId: member.user_id,
            email: authUser?.email ?? '',
            name: getUserName(authUser),
            role: member.role,
            isFirstLogin: member.is_first_login,
            isActive: member.is_active,
            createdAt: member.created_at,
          }
        }),
      )

      return json(summaries, {}, req)
    }

    if (action === 'create') {
      if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 }, req)
      const body = await req.json().catch(() => ({})) as {
        email?: string
        password?: string
        name?: string
        role?: StoreRole
        storeId?: string
      }

      const { email, password, name, role, storeId } = body
      if (!email || !password || !name || !storeId || !role) {
        return json({ error: 'email, password, name, role, storeId are required' }, { status: 400 }, req)
      }
      if (!['manager', 'staff'].includes(role)) {
        return json({ error: 'Invalid role for staff account creation' }, { status: 400 }, req)
      }
      if (!PASSWORD_PATTERN.test(password)) {
        return json({ error: '비밀번호는 영문/숫자/특수문자를 포함한 8자 이상이어야 합니다.' }, { status: 400 }, req)
      }

      const requesterMember = await getRequesterAccess(adminClient, storeId, user, isSuperAdmin)
      if (!requesterMember?.is_active) return json({ error: 'Forbidden' }, { status: 403 }, req)
      ensureCanManage(requesterMember.role, role)

      let createdUserId: string | null = null
      try {
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, role },
          app_metadata: { role },
        })

        if (authError || !authData.user) {
          throw new Error(authError?.message ?? 'Unable to create account')
        }

        createdUserId = authData.user.id

        const { error: memberError } = await adminClient.from('store_members').insert({
          store_id: storeId,
          user_id: createdUserId,
          role,
          is_first_login: true,
          is_active: true,
        })

        if (memberError) throw new Error(memberError.message)

        return json({ userId: createdUserId, storeId, role, name, email }, {}, req)
      } catch (err) {
        if (createdUserId) {
          await adminClient.auth.admin.deleteUser(createdUserId)
        }
        throw err
      }
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 }, req)
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const storeId = typeof body.storeId === 'string' ? body.storeId : ''
    if (!storeId) return json({ error: 'storeId is required' }, { status: 400 }, req)

    const requesterMember = await getRequesterAccess(adminClient, storeId, user, isSuperAdmin)
    if (!requesterMember?.is_active) return json({ error: 'Forbidden' }, { status: 403 }, req)

    if (action === 'update') {
      const memberId = typeof body.memberId === 'string' ? body.memberId : ''
      const userId = typeof body.userId === 'string' ? body.userId : ''
      const email = typeof body.email === 'string' ? body.email.trim() : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const role = typeof body.role === 'string' ? body.role as StoreRole : null

      if (!memberId || !userId || !email || !name || !role) {
        return json({ error: 'memberId, userId, email, name, role are required' }, { status: 400 }, req)
      }
      if (!['manager', 'staff'].includes(role)) {
        return json({ error: 'role must be manager or staff' }, { status: 400 }, req)
      }

      const target = await getTargetMember(adminClient, storeId, memberId)
      if (!target || target.user_id !== userId) return json({ error: 'Member not found' }, { status: 404 }, req)
      if (target.user_id === user.id) return json({ error: '자기 자신은 수정할 수 없습니다.' }, { status: 400 }, req)
      ensureCanManage(requesterMember.role, target.role)
      ensureCanManage(requesterMember.role, role)

      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        email,
        user_metadata: { name, role },
        app_metadata: { role },
      })
      if (authError) throw authError

      const { data: updatedMember, error: memberError } = await adminClient
        .from('store_members')
        .update({ role })
        .eq('id', memberId)
        .eq('store_id', storeId)
        .select('id, user_id, role, is_first_login, is_active, created_at')
        .single()

      if (memberError) throw memberError

      return json({
        id: updatedMember.id,
        userId: updatedMember.user_id,
        email,
        name,
        role: updatedMember.role,
        isFirstLogin: updatedMember.is_first_login,
        isActive: updatedMember.is_active,
        createdAt: updatedMember.created_at,
      }, {}, req)
    }

    if (action === 'reset-password') {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      if (!userId) return json({ error: 'userId is required' }, { status: 400 }, req)

      const { data: targetMember, error: targetError } = await adminClient
        .from('store_members')
        .select('id, role')
        .eq('store_id', storeId)
        .eq('user_id', userId)
        .maybeSingle()

      if (targetError) throw targetError
      if (!targetMember) return json({ error: 'Member not found' }, { status: 404 }, req)
      if (userId === user.id) return json({ error: '자기 자신은 초기화할 수 없습니다.' }, { status: 400 }, req)
      ensureCanManage(requesterMember.role, targetMember.role as StoreRole)

      const tempPassword = createTempPassword()
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        password: tempPassword,
      })
      if (authError) throw authError

      const { error: memberError } = await adminClient
        .from('store_members')
        .update({ is_first_login: true, is_active: true })
        .eq('user_id', userId)
        .eq('store_id', storeId)

      if (memberError) throw memberError

      return json({ tempPassword }, {}, req)
    }

    if (action === 'set-active') {
      const memberId = typeof body.memberId === 'string' ? body.memberId : ''
      const isActive = typeof body.isActive === 'boolean' ? body.isActive : null
      if (!memberId || isActive === null) return json({ error: 'memberId and isActive are required' }, { status: 400 }, req)

      const target = await getTargetMember(adminClient, storeId, memberId)
      if (!target) return json({ error: 'Member not found' }, { status: 404 }, req)
      if (target.user_id === user.id) return json({ error: '자기 자신은 비활성화할 수 없습니다.' }, { status: 400 }, req)
      ensureCanManage(requesterMember.role, target.role)

      const { data: updatedMember, error: memberError } = await adminClient
        .from('store_members')
        .update({ is_active: isActive })
        .eq('id', memberId)
        .eq('store_id', storeId)
        .select('id, user_id, role, is_first_login, is_active, created_at')
        .single()

      if (memberError) throw memberError

      const {
        data: { user: authUser },
      } = await adminClient.auth.admin.getUserById(updatedMember.user_id)

      return json({
        id: updatedMember.id,
        userId: updatedMember.user_id,
        email: authUser?.email ?? '',
        name: getUserName(authUser),
        role: updatedMember.role,
        isFirstLogin: updatedMember.is_first_login,
        isActive: updatedMember.is_active,
        createdAt: updatedMember.created_at,
      }, {}, req)
    }

    if (action === 'delete') {
      const memberId = typeof body.memberId === 'string' ? body.memberId : ''
      const userId = typeof body.userId === 'string' ? body.userId : ''
      if (!memberId || !userId) return json({ error: 'memberId and userId are required' }, { status: 400 }, req)

      const target = await getTargetMember(adminClient, storeId, memberId)
      if (!target || target.user_id !== userId) return json({ error: 'Member not found' }, { status: 404 }, req)
      if (userId === user.id) return json({ error: '자기 자신은 삭제할 수 없습니다.' }, { status: 400 }, req)
      ensureCanManage(requesterMember.role, target.role)

      const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
      if (authError) throw authError

      return json({ success: true }, {}, req)
    }

    return json({ error: 'Unknown action' }, { status: 400 }, req)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message === 'Forbidden') {
      return json({ error: 'Forbidden' }, { status: 403 }, req)
    }
    return json({ error: message }, { status: 500 }, req)
  }
})
