import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function json(data: unknown, status = 200, req?: Request) {
  const response = typeof status === 'number'
    ? { status }
    : { ...status }

  return new Response(JSON.stringify(data), {
    ...response,
    headers: {
      'Content-Type': 'application/json',
      ...((response as ResponseInit).headers ?? {}),
      ...(req ? corsHeaders(req) : {}),
    },
  })
}

async function verifySuperAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { user: null as any, status: 401 }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceRole || !anonKey) {
    return { user: null as any, status: 500, error: 'Server configuration error' }
  }

  const adminClient = createClient(supabaseUrl, serviceRole)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error } = await callerClient.auth.getUser()
  if (error || !user) {
    return { user: null as any, status: 401 }
  }

  const isAllowed = user.app_metadata?.role === 'super_admin'
  if (!isAllowed) {
    return { user: null as any, status: 403 }
  }

  return { user, status: 200, adminClient }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // check-super-admin은 403 여부만 반환 (redirect용이므로 에러 대신 {allowed: false})
  if (action === 'check-super-admin') {
    const verified = await verifySuperAdmin(req)
    return json({ allowed: verified.status === 200 }, 200, req)
  }

  const verified = await verifySuperAdmin(req)
  if (verified.status === 500) return json({ error: verified.error }, 500, req)
  if (verified.status === 401) return json({ error: 'Unauthorized' }, 401, req)
  if (verified.status === 403) return json({ error: 'Forbidden' }, 403, req)

  const { adminClient } = verified

  try {
    if (action === 'list-stores') {
      const { data, error } = await adminClient
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return json(data, 200, req)
    }

    if (action === 'update-subscription') {
      if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, { status: 405 }, req)
      }

      let body: { storeId?: unknown; subscriptionStart?: unknown; subscriptionEnd?: unknown; isActive?: unknown }
      try {
        body = await req.json()
      } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 }, req)
      }

      const { storeId, subscriptionStart, subscriptionEnd, isActive } = body
      if (typeof storeId !== 'string' || storeId.trim() === '') {
        return json({ error: 'storeId is required' }, { status: 400 }, req)
      }

      if (typeof subscriptionStart !== 'string' && subscriptionStart !== null) {
        return json({ error: 'subscriptionStart must be string or null' }, { status: 400 }, req)
      }
      if (typeof subscriptionEnd !== 'string' && subscriptionEnd !== null) {
        return json({ error: 'subscriptionEnd must be string or null' }, { status: 400 }, req)
      }
      if (typeof isActive !== 'boolean') {
        return json({ error: 'isActive must be boolean' }, { status: 400 }, req)
      }
      if (typeof subscriptionStart === 'string' && typeof subscriptionEnd === 'string' && subscriptionEnd < subscriptionStart) {
        return json({ error: 'subscription_end must be after subscription_start' }, { status: 400 }, req)
      }

      const { error } = await adminClient
        .from('stores')
        .update({
          subscription_start: subscriptionStart,
          subscription_end: subscriptionEnd,
          is_active: isActive,
        })
        .eq('id', storeId)

      if (error) throw error
      return json({ success: true }, 200, req)
    }

    if (action === 'update-store-info') {
      if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, { status: 405 }, req)
      }

      let body: { storeId?: unknown; name?: unknown; address?: unknown; phone?: unknown }
      try {
        body = await req.json()
      } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 }, req)
      }

      const { storeId, name, address, phone } = body
      if (typeof storeId !== 'string' || storeId.trim() === '') {
        return json({ error: 'storeId is required' }, { status: 400 }, req)
      }

      const updateData: Record<string, unknown> = {}
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim() === '') {
          return json({ error: 'name must be a non-empty string' }, { status: 400 }, req)
        }
        updateData.name = name
      }
      if (address !== undefined) {
        if (typeof address !== 'string') {
          return json({ error: 'address must be a string' }, { status: 400 }, req)
        }
        updateData.address = address
      }
      if (phone !== undefined) {
        if (typeof phone !== 'string') {
          return json({ error: 'phone must be a string' }, { status: 400 }, req)
        }
        updateData.phone = phone
      }

      if (Object.keys(updateData).length === 0) {
        return json({ error: 'At least one field (name, address, phone) is required' }, { status: 400 }, req)
      }

      const { data, error } = await adminClient
        .from('stores')
        .update(updateData)
        .eq('id', storeId)
        .select()
        .single()

      if (error) throw error
      return json(data, 200, req)
    }

    if (action === 'reset-password') {
      if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, { status: 405 }, req)
      }

      let body: { userId?: unknown }
      try {
        body = await req.json()
      } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 }, req)
      }

      const { userId } = body
      if (typeof userId !== 'string' || userId.trim() === '') {
        return json({ error: 'userId is required' }, { status: 400 }, req)
      }

      const tempPassword = '12341234!'

      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        password: tempPassword,
      })
      if (authError) throw authError

      const { error: memberError } = await adminClient
        .from('store_members')
        .update({ is_first_login: true })
        .eq('user_id', userId)

      if (memberError) throw memberError

      return json({ tempPassword }, 200, req)
    }

    if (action === 'list-store-members') {
      const storeId = url.searchParams.get('storeId')
      if (!storeId) {
        return json({ error: 'storeId query param is required' }, { status: 400 }, req)
      }

      const { data: members, error: membersError } = await adminClient
        .from('store_members')
        .select('id, user_id, role, is_first_login')
        .eq('store_id', storeId)
        .order('created_at', { ascending: true })

      if (membersError) throw membersError

      // Fetch emails from auth.users via admin API
      const membersWithEmail = await Promise.all(
        (members ?? []).map(async (m: { id: string; user_id: string; role: string; is_first_login: boolean }) => {
          const { data: { user } } = await adminClient.auth.admin.getUserById(m.user_id)
          return {
            userId: m.user_id,
            email: user?.email ?? '',
            role: m.role,
            isFirstLogin: m.is_first_login,
          }
        })
      )

      return json(membersWithEmail, 200, req)
    }

    if (action === 'get-store-menu') {
      const body = await req.json().catch(() => ({})) as { storeId?: unknown }
      const { storeId } = body
      if (typeof storeId !== 'string' || storeId.trim() === '') {
        return json({ error: 'storeId is required' }, { status: 400 }, req)
      }

      const { data: categories, error: catErr } = await adminClient
        .from('menu_categories')
        .select('*')
        .eq('store_id', storeId)
        .order('sort_order', { ascending: true })
      if (catErr) throw catErr

      const { data: items, error: itemErr } = await adminClient
        .from('menu_items')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true })
      if (itemErr) throw itemErr

      return json({ categories, items }, 200, req)
    }

    if (action === 'update-menu-item') {
      if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, { status: 405 }, req)
      }

      let body: { itemId?: unknown; name?: unknown; price?: unknown; is_available?: unknown }
      try {
        body = await req.json()
      } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 }, req)
      }

      const { itemId, name, price, is_available } = body
      if (typeof itemId !== 'string' || itemId.trim() === '') {
        return json({ error: 'itemId is required' }, { status: 400 }, req)
      }

      const updates: Record<string, unknown> = {}
      if (typeof name === 'string') updates.name = name
      if (typeof price === 'number') updates.price = price
      if (typeof is_available === 'boolean') updates.is_available = is_available

      if (Object.keys(updates).length === 0) {
        return json({ error: 'No fields to update' }, { status: 400 }, req)
      }

      const { data, error } = await adminClient
        .from('menu_items')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single()
      if (error) throw error

      return json(data, 200, req)
    }

    if (action === 'list-alimtalk-templates') {
      const managedDefaults = [
        {
          event: 'waiting_created',
          template_code: '',
          template_body: '[#{매장명}] 웨이팅 접수 완료\n대기번호: #{대기번호}\n내 앞 팀 수: #{앞팀수}\n예상 대기시간: #{예상시간}분',
          is_active: true,
        },
        {
          event: 'waiting_called',
          template_code: '',
          template_body: '[#{매장명}] 입장 요청\n대기번호: #{대기번호}\n내 앞 팀 수: #{앞팀수}\n예상 대기시간: #{예상시간}분',
          is_active: true,
        },
      ]

      const managedEvents = managedDefaults.map((template) => template.event)
      const { data: existingTemplates, error: existingError } = await adminClient
        .from('platform_alimtalk_templates')
        .select('event')
        .in('event', managedEvents)

      if (existingError) throw existingError

      const existingEvents = new Set((existingTemplates ?? []).map((template) => template.event))
      const missingTemplates = managedDefaults.filter((template) => !existingEvents.has(template.event))

      for (const template of missingTemplates) {
        const { error } = await adminClient
          .from('platform_alimtalk_templates')
          .insert({ ...template, updated_at: new Date().toISOString() })
        if (error) throw error
      }

      const { data, error } = await adminClient
        .from('platform_alimtalk_templates')
        .select('*')
        .in('event', managedEvents)
        .order('event', { ascending: true })

      if (error) throw error
      return json(data, 200, req)
    }

    if (action === 'upsert-alimtalk-template') {
      if (req.method !== 'POST') {
        return json({ error: 'Method not allowed' }, { status: 405 }, req)
      }

      let body: { event?: unknown; templateCode?: unknown; templateBody?: unknown; isActive?: unknown }
      try {
        body = await req.json()
      } catch {
        return json({ error: 'Invalid JSON body' }, { status: 400 }, req)
      }

      const { event, templateCode, templateBody, isActive } = body
      if (typeof event !== 'string' || event.trim() === '') {
        return json({ error: 'event is required' }, { status: 400 }, req)
      }
      if (typeof templateCode !== 'string') {
        return json({ error: 'templateCode must be a string' }, { status: 400 }, req)
      }
      if (typeof templateBody !== 'string' || templateBody.trim() === '') {
        return json({ error: 'templateBody must be a non-empty string' }, { status: 400 }, req)
      }
      if (typeof isActive !== 'boolean') {
        return json({ error: 'isActive must be boolean' }, { status: 400 }, req)
      }

      const { data, error } = await adminClient
        .from('platform_alimtalk_templates')
        .upsert({
          event,
          template_code: templateCode,
          template_body: templateBody,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'event' })
        .select()
        .single()

      if (error) throw error
      return json(data, 200, req)
    }

    return json({ error: 'Unknown action' }, 400, req)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return json({ error: message }, 500, req)
  }
})
