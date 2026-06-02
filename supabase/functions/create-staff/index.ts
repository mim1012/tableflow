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

const ALLOWED_ROLES = ['owner', 'manager', 'staff'] as const
const STAFF_CREATOR_ROLES = ['owner', 'manager'] as const
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

type StoreRole = (typeof ALLOWED_ROLES)[number]

type VerifyResult =
  | { status: 200; user: { id: string }; adminClient: ReturnType<typeof createClient> }
  | { status: 401; user: null; adminClient: null }
  | { status: 403; user: null; adminClient: null }
  | { status: 500; user: null; adminClient: null; message: string }

async function verifyCaller(authHeader: string | null): Promise<VerifyResult> {
  if (!authHeader) {
    return { status: 401, user: null, adminClient: null }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { status: 500, user: null, adminClient: null, message: 'Server configuration error.' }
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error } = await callerClient.auth.getUser()
  if (error || !user) {
    return { status: 401, user: null, adminClient: null }
  }

  return { status: 200, user, adminClient }
}

interface Payload {
  email: string
  password: string
  name: string
  role: 'manager' | 'staff'
  storeId: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, {}, req)
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 }, req)
  }

  const verified = await verifyCaller(req.headers.get('Authorization'))
  if (verified.status === 500) {
    return json({ error: verified.message }, { status: 500 }, req)
  }
  if (verified.status === 401) {
    return json({ error: 'Unauthorized' }, { status: 401 }, req)
  }

  const { adminClient, user } = verified
  if (!adminClient || !user) {
    return json({ error: 'Unauthorized' }, { status: 401 }, req)
  }

  let body: Payload
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 }, req)
  }

  const { email, password, name, role, storeId } = body
  if (!email || !password || !name || !storeId || !role) {
    return json({ error: 'email, password, name, role, storeId are required' }, { status: 400 }, req)
  }

  if (!['manager', 'staff'].includes(role)) {
    return json({ error: 'Invalid role for staff account creation' }, { status: 400 }, req)
  }

  if (!PASSWORD_PATTERN.test(password)) {
    return json({ error: 'Password policy violation' }, { status: 400 }, req)
  }

  const { data: requesterMember, error: requesterError } = await adminClient
    .from('store_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('store_id', storeId)
    .maybeSingle()

  if (requesterError) {
    return json({ error: requesterError.message }, { status: 500 }, req)
  }

  if (!requesterMember || !STAFF_CREATOR_ROLES.includes(requesterMember.role as StoreRole)) {
    return json({ error: 'Forbidden' }, { status: 403 }, req)
  }

  // Managers can only create staff, not other managers
  if (requesterMember.role === 'manager' && role === 'manager') {
    return json({ error: 'Forbidden' }, { status: 403 }, req)
  }

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
      role: role as StoreRole,
      is_first_login: true,
    })

    if (memberError) {
      throw new Error(memberError.message)
    }

    return json({
      success: true,
      userId: createdUserId,
      storeId,
      role,
      name,
      email,
    }, {}, req)
  } catch (err) {
    if (createdUserId) {
      await adminClient.auth.admin.deleteUser(createdUserId)
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: message }, { status: 500 }, req)
  }
})
