import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase as _supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any
import { deleteOrder as apiDeleteOrder, getOrders, updateOrderStatus as apiUpdateOrderStatus, updateOrderPax as apiUpdateOrderPax } from '@/lib/api/admin'
import type { OrderRow, OrderItemRow, OrderStatus } from '@/types/database'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { notifyNewOrder, notifyOrderStatusChanged } from '@/hooks/useOrderNotification'

export interface OrderWithItems extends OrderRow {
  order_items: OrderItemRow[]
}

export function useOrders(storeId: string | null) {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const knownIdsRef = useRef<Set<string>>(new Set())

  const notifyIfNew = useCallback((order: OrderWithItems | OrderRow, tableLabel?: string) => {
    if (knownIdsRef.current.has(order.id)) return
    knownIdsRef.current.add(order.id)
    const label = tableLabel ?? `테이블 ${order.table_id ?? '-'}`
    toast.success(`새 주문이 들어왔습니다! (${label})`)
    notifyNewOrder(label, order.id)
  }, [])

  const fetchOrders = useCallback(async () => {
    if (!storeId) {
      setOrders([])
      setLoading(false)
      return
    }
    try {
      const data = await getOrders(storeId)
      const rows = (data as OrderWithItems[]) ?? []
      setOrders(rows)
      // Mark all initially loaded orders as known (no toast for them)
      for (const o of rows) knownIdsRef.current.add(o.id)
    } catch (err) {
      console.error('useOrders fetchOrders:', err)
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeId) return
    setOrders([])
    knownIdsRef.current = new Set()
    setLoading(true)
    fetchOrders()

    async function handleInsert(payload: RealtimePostgresChangesPayload<OrderRow>) {
      const incoming = payload.new as OrderRow
      const orderId = incoming?.id
      if (!orderId) return

      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*), tables(table_number, name)')
          .eq('id', orderId)
          .single()

        if (error) throw error
        if (!data) return

        const order = data as OrderWithItems & { tables?: { table_number: number; name: string | null } }
        const t = order.tables
        const tableLabel = t?.name || (t?.table_number ? `테이블 ${t.table_number}번` : undefined)
        notifyIfNew(order, tableLabel)

        setOrders((prev) => {
          if (prev.some((item) => item.id === order.id)) return prev
          return [order, ...prev]
        })
      } catch (err) {
        console.error('useOrders INSERT handler:', err)
      }
    }

    function handleUpdate(payload: RealtimePostgresChangesPayload<OrderRow>) {
      try {
        const updated = payload.new as OrderRow
        if (!updated?.id) return

        setOrders((prev) =>
          prev.map((o) =>
            o.id === updated.id ? { ...o, ...updated } : o
          )
        )
        const tableLabel = `테이블 ${updated.table_id ?? '-'}`
        notifyOrderStatusChanged(tableLabel, updated.id, updated.status)
      } catch (err) {
        console.error('useOrders UPDATE handler:', err)
      }
    }

    const channel = supabase
      .channel(`orders:${storeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        (payload: any) => {
          void handleInsert(payload as RealtimePostgresChangesPayload<OrderRow>)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
        (payload: any) => {
          try {
            handleUpdate(payload as RealtimePostgresChangesPayload<OrderRow>)
          } catch (err) {
            console.error('useOrders UPDATE callback:', err)
          }
        }
      )
      .subscribe()

    // Polling fallback — always syncs state and notifies for new orders
    const pollTimer = setInterval(async () => {
      try {
        const data = await getOrders(storeId)
        const fresh = (data as OrderWithItems[]) ?? []
        // Always sync state so the UI reflects DB truth even if realtime SELECT was slow/failed
        setOrders(fresh)
        // Notify only for orders not yet seen (knownIdsRef deduplicates toasts)
        for (const order of fresh) {
          notifyIfNew(order)
        }
      } catch (err: any) {
        // 401/403 = JWT 만료 → 세션 갱신 시도
        if (err?.status === 401 || err?.status === 403 || err?.message?.includes('JWT')) {
          await supabase.auth.refreshSession()
        }
        console.error('useOrders poll:', err instanceof Error ? err.message : JSON.stringify(err))
      }
    }, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollTimer)
    }
  }, [storeId, fetchOrders, notifyIfNew])

  const updateOrderStatus = useCallback(async (orderId: string, status: OrderStatus) => {
    try {
      await apiUpdateOrderStatus(orderId, status)
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      )
    } catch (err) {
      console.error('useOrders updateOrderStatus:', err)
      toast.error('주문 상태 변경에 실패했습니다.')
    }
  }, [])

  const deleteOrder = useCallback(async (orderId: string) => {
    try {
      await apiDeleteOrder(orderId)
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
    } catch (err) {
      console.error('useOrders deleteOrder:', err)
      throw err
    }
  }, [])

  const updateOrderPax = useCallback(async (orderId: string, pax: number) => {
    try {
      await apiUpdateOrderPax(orderId, pax)
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, pax } : o))
      )
    } catch (err) {
      console.error('useOrders updateOrderPax:', err)
    }
  }, [])

  return { orders, loading, updateOrderStatus, deleteOrder, updateOrderPax, refetch: fetchOrders }
}
