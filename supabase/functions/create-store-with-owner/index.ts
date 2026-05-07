import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPERADMIN_ROLE = 'super_admin'
const SLUG_PATTERN = /^[a-z0-9-]+$/
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$/

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

async function verifySuperAdmin(authHeader: string | null) {
  if (!authHeader) {
    return { status: 401 as const, user: null, adminClient: null as ReturnType<typeof createClient> | null }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { status: 500 as const, user: null, adminClient: null as ReturnType<typeof createClient> | null, message: 'Server configuration error.' }
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error } = await callerClient.auth.getUser()
  if (error || !user) {
    return { status: 401 as const, user: null, adminClient: null as ReturnType<typeof createClient> | null }
  }

  const hasRole = user.app_metadata?.role === SUPERADMIN_ROLE
  if (!hasRole) {
    return { status: 403 as const, user: null, adminClient: null as ReturnType<typeof createClient> | null }
  }

  return { status: 200 as const, user, adminClient }
}

interface Payload {
  name?: string
  storeName?: string
  slug?: string
  storeSlug?: string
  address?: string
  phone?: string
  subscriptionStart?: string | null
  subscriptionEnd?: string | null
  isActive?: boolean
  ownerEmail: string
  ownerPassword: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, {}, req)
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 }, req)
  }

  const authHeader = req.headers.get('Authorization')
  const verified = await verifySuperAdmin(authHeader)
  if (verified.status === 500) {
    return json({ error: verified.message }, { status: 500 }, req)
  }
  if (verified.status === 401) {
    return json({ error: 'Unauthorized' }, { status: 401 }, req)
  }
  if (verified.status === 403) {
    return json({ error: 'Forbidden' }, { status: 403 }, req)
  }

  const { adminClient } = verified
  if (!adminClient) {
    return json({ error: 'Unauthorized' }, { status: 401 }, req)
  }

  let body: Payload
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 }, req)
  }

  const {
    name: rawName,
    storeName,
    slug: rawSlug,
    storeSlug,
    address,
    phone,
    subscriptionStart,
    subscriptionEnd,
    isActive = true,
    ownerEmail,
    ownerPassword,
  } = body

  const name = rawName ?? storeName
  const slug = rawSlug ?? storeSlug

  if (!name || !slug || !ownerEmail || !ownerPassword) {
    return json({ error: 'name, slug, ownerEmail, ownerPassword are required' }, { status: 400 }, req)
  }

  if (subscriptionStart && subscriptionEnd && subscriptionEnd < subscriptionStart) {
    return json({ error: 'subscription_end must be after subscription_start' }, { status: 400 }, req)
  }

  if (!SLUG_PATTERN.test(slug)) {
    return json({ error: 'Invalid slug format' }, { status: 400 }, req)
  }

  if (!PASSWORD_PATTERN.test(ownerPassword)) {
    return json({ error: 'Password policy violation' }, { status: 400 }, req)
  }

  let ownerUserId: string | null = null
  let storeId: string | null = null

  try {
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { role: 'store_owner' },
      app_metadata: { role: 'store_owner' },
    })

    if (authError || !authData.user) {
      throw new Error(`Account creation failed: ${authError?.message ?? 'unknown'}`)
    }

    ownerUserId = authData.user.id

    const { data: store, error: storeError } = await adminClient
      .from('stores')
      .insert({
        owner_id: ownerUserId,
        name,
        slug,
        address: address ?? null,
        phone: phone ?? null,
        subscription_start: subscriptionStart ?? null,
        subscription_end: subscriptionEnd ?? null,
        is_active: isActive,
      })
      .select()
      .single()

    if (storeError || !store) {
      throw new Error(`Store creation failed: ${storeError?.message ?? 'unknown'}`)
    }

    storeId = store.id

    const { error: memberError } = await adminClient.from('store_members').insert({
      store_id: store.id,
      user_id: ownerUserId,
      role: 'owner',
      is_first_login: true,
    })

    if (memberError) {
      throw new Error(`Membership creation failed: ${memberError.message}`)
    }

    const defaultTables = Array.from({ length: 5 }, (_, i) => ({
      store_id: store.id,
      table_number: i + 1,
      name: `${i + 1}번 테이블`,
      status: 'available',
      qr_token: crypto.randomUUID(),
    }))

    const { error: tableError } = await adminClient.from('tables').insert(defaultTables)
    if (tableError) {
      throw new Error(`Table creation failed: ${tableError.message}`)
    }

    return json({ store }, {}, req)
  } catch (err) {
    if (ownerUserId) {
      await adminClient.auth.admin.deleteUser(ownerUserId)
    }
    if (storeId) {
      await adminClient.from('stores').delete().eq('id', storeId)
    }
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: message }, { status: 500 }, req)
  }
})
