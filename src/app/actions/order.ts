'use server'

import { createClient } from '@/lib/supabase/server'
import type { OrderStatus, PaymentMethod, SelectedOption } from '@/types/database'
import { canTransition } from '@/lib/utils/orderStatus'
import { assertStoreActiveWithClient } from '@/lib/server/storeAccess'

export interface OrderItemInput {
  menuItemId: string
  menuItemName: string
  unitPrice: number
  quantity: number
  totalPrice: number
  selectedOptions: SelectedOption[]
}

export async function createOrderAction(params: {
  storeId: string
  tableId: string
  items: OrderItemInput[]
  guestName?: string
  specialRequests?: string
  paymentMethod?: PaymentMethod
}): Promise<{ orderId: string }> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  await assertStoreActiveWithClient(sb, params.storeId)

  const { data, error } = await sb.rpc('create_order_atomic', {
    p_store_id: params.storeId,
    p_table_id: params.tableId,
    p_items: params.items.map((item) => ({
      menu_item_id: item.menuItemId,
      menu_item_name: item.menuItemName,
      quantity: item.quantity,
      selected_options: item.selectedOptions.length > 0 ? item.selectedOptions : null,
    })),
    p_guest_name: params.guestName ?? null,
    p_special_requests: params.specialRequests ?? null,
    p_payment_method: params.paymentMethod ?? null,
  })

  if (error || !data) throw new Error(`주문 생성 실패: ${error?.message ?? '알 수 없는 오류'}`)

  return { orderId: data as string }
}

export async function updateOrderStatusAction(
  orderId: string,
  newStatus: OrderStatus,
): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: current, error: fetchError } = await sb
    .from('orders')
    .select('status, store_id')
    .eq('id', orderId)
    .single()

  if (fetchError || !current) throw fetchError ?? new Error('주문을 찾을 수 없습니다.')

  const row = current as { status: string; store_id: string }
  await assertStoreActiveWithClient(sb, row.store_id)
  if (row.status !== newStatus && !canTransition(row.status as OrderStatus, newStatus)) {
    throw new Error(`유효하지 않은 상태 전환: ${row.status} → ${newStatus}`)
  }

  const { error } = await sb
    .from('orders')
    .update({ status: newStatus })
    .eq('id', orderId)

  if (error) throw new Error(`주문 상태 업데이트 실패: ${error.message}`)
}

export async function deleteOrderAction(orderId: string): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: current, error: fetchError } = await sb
    .from('orders')
    .select('store_id')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchError || !current) throw fetchError ?? new Error('주문을 찾을 수 없습니다.')
  await assertStoreActiveWithClient(sb, (current as { store_id: string }).store_id)

  const { error } = await sb
    .from('orders')
    .delete()
    .eq('id', orderId)

  if (error) throw new Error(`주문 삭제 실패: ${error.message}`)
}

export async function updateOrderPaxAction(orderId: string, pax: number): Promise<void> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any
  const { data: current, error: fetchError } = await sb
    .from('orders')
    .select('store_id')
    .eq('id', orderId)
    .maybeSingle()

  if (fetchError || !current) throw fetchError ?? new Error('주문을 찾을 수 없습니다.')
  await assertStoreActiveWithClient(sb, (current as { store_id: string }).store_id)

  const { error } = await sb
    .from('orders')
    .update({ pax })
    .eq('id', orderId)

  if (error) throw new Error(`주문 인원 업데이트 실패: ${error.message}`)
}
