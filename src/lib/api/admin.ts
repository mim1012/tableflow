import { supabase as _supabase } from '@/lib/supabase'
import type { OrderStatus, TableStatus } from '@/types/database'

// Cast to any to bypass Database type generic resolution issues with supabase-js v2.99
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any

// ============================================================
// Orders
// ============================================================

export async function getOrders(storeId: string, status?: OrderStatus) {
  let query = supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  // 현재 상태 조회 → 전환 검증
  const { data: current, error: fetchError } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (fetchError || !current) throw fetchError ?? new Error('주문을 찾을 수 없습니다.')

  const row = current as { status: string }
  const { canTransition } = await import('@/lib/utils/orderStatus')
  if (row.status !== newStatus && !canTransition(row.status as OrderStatus, newStatus)) {
    throw new Error(`유효하지 않은 상태 전환: ${row.status} → ${newStatus}`)
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateOrderPax(orderId: string, pax: number) {
  const { data, error } = await supabase
    .from('orders')
    .update({ pax })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteOrder(orderId: string) {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)

  if (error) throw error
}

// ============================================================
// Tables
// ============================================================

export async function getTables(storeId: string) {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('store_id', storeId)
    .order('table_number', { ascending: true })

  if (error) throw error
  return data
}

export async function updateTableStatus(tableId: string, status: TableStatus) {
  const { data, error } = await supabase
    .from('tables')
    .update({ status })
    .eq('id', tableId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addTable(storeId: string, tableNumber: number) {
  const { data, error } = await supabase
    .from('tables')
    .insert({
      store_id: storeId,
      table_number: tableNumber,
      qr_token: crypto.randomUUID(),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================
// Revenue (daily aggregation)
// ============================================================

export interface DailyRevenueRow {
  date: string
  amount: number
}

export async function getDailyRevenue(storeId: string, days: number): Promise<DailyRevenueRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select('created_at, total_price')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })

  if (error) throw error

  // Aggregate by date
  const map: Record<string, number> = {}
  for (const row of data ?? []) {
    const date = row.created_at.slice(0, 10)
    map[date] = (map[date] ?? 0) + (row.total_price ?? 0)
  }

  return Object.entries(map).map(([date, amount]) => ({ date, amount }))
}

// ============================================================
// Order statistics
// ============================================================

export interface OrderStats {
  totalRevenue: number
  orderCount: number
  averageOrderValue: number
}

export async function getOrderStats(storeId: string, days: number): Promise<OrderStats> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select('total_price')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')
    .gte('created_at', sinceIso)

  if (error) throw error

  const rows = (data ?? []) as { total_price: number | null }[]
  const totalRevenue = rows.reduce((sum, r) => sum + (r.total_price ?? 0), 0)
  const orderCount = rows.length
  const averageOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0

  return { totalRevenue, orderCount, averageOrderValue }
}

// ============================================================
// Top menu items
// ============================================================

export interface TopMenuItem {
  name: string
  quantity: number
  revenue: number
}

export async function getTopMenuItems(storeId: string, days: number, limit: number): Promise<TopMenuItem[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const { data, error } = await supabase
    .from('order_items')
    .select('menu_item_name, quantity, unit_price, orders!inner(store_id, payment_status, created_at)')
    .eq('orders.store_id', storeId)
    .eq('orders.payment_status', 'paid')
    .gte('orders.created_at', sinceIso)

  if (error) throw error

  const map: Record<string, { quantity: number; revenue: number }> = {}
  for (const row of data ?? []) {
    const r = row as { menu_item_name: string; quantity: number; unit_price: number }
    const key = r.menu_item_name
    if (!map[key]) map[key] = { quantity: 0, revenue: 0 }
    map[key].quantity += r.quantity ?? 0
    map[key].revenue += (r.quantity ?? 0) * (r.unit_price ?? 0)
  }

  return Object.entries(map)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
}

// ============================================================
// Category sales
// ============================================================

export interface CategorySales {
  category: string
  revenue: number
  count: number
}

export async function getCategorySales(storeId: string, days: number): Promise<CategorySales[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const { data, error } = await supabase
    .from('order_items')
    .select('menu_item_name, quantity, unit_price, orders!inner(store_id, payment_status, created_at)')
    .eq('orders.store_id', storeId)
    .eq('orders.payment_status', 'paid')
    .gte('orders.created_at', sinceIso)

  if (error) throw error

  // Get category mapping from menu_items
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('name, menu_categories(name)')
    .eq('store_id', storeId)

  const categoryMap: Record<string, string> = {}
  for (const item of menuItems ?? []) {
    const mi = item as { name: string; menu_categories: { name: string } | null }
    categoryMap[mi.name] = mi.menu_categories?.name ?? '기타'
  }

  const map: Record<string, { revenue: number; count: number }> = {}
  for (const row of data ?? []) {
    const r = row as { menu_item_name: string; quantity: number; unit_price: number }
    const cat = categoryMap[r.menu_item_name] ?? '기타'
    if (!map[cat]) map[cat] = { revenue: 0, count: 0 }
    map[cat].revenue += (r.quantity ?? 0) * (r.unit_price ?? 0)
    map[cat].count += r.quantity ?? 0
  }

  return Object.entries(map)
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.revenue - a.revenue)
}
