'use client'

import React, { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { ChefHat, ArrowLeft, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/providers/AuthProvider'
import { supabase } from '@/lib/supabase'
import { isStoreSubscriptionActive } from '@/lib/utils/subscription'
import { useOrders } from '@/hooks/useOrders'
import { useRealtimeTables } from '@/hooks/useRealtimeTables'
import { adaptOrder, ORDER_STATUS_MAP } from '@/app/components/admin/types'
import type { UIOrder, UITable } from '@/app/components/admin/types'
import type { OrderStatus } from '@/types/database'

import KDSPanel from '@/app/components/admin/panels/KDSPanel'

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function KDSFullscreenClient() {
  const { user, loading: authLoading } = useAuth()
  const storeId = user?.storeId ?? ''
  const now = useCurrentTime()

  // --- Subscription check ---
  const [storeExpired, setStoreExpired] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!storeId) {
      setLoading(false)
      return
    }
    let mounted = true
    supabase
      .from('stores')
      .select('is_active, subscription_end')
      .eq('id', storeId)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) { setLoading(false); return }
        if (data && !isStoreSubscriptionActive(data)) setStoreExpired(true)
        setLoading(false)
      })
      .catch(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [storeId])

  // --- Realtime hooks ---
  const {
    orders: rawOrders,
    updateOrderStatus: apiUpdateOrderStatus,
    deleteOrder: apiDeleteOrder,
    updateOrderPax: apiUpdateOrderPax,
  } = useOrders(storeId || null)

  const { tables: rawTables } = useRealtimeTables(storeId || null)

  // --- Lookup maps ---
  const tableNumberMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of rawTables) m.set(t.id, t.table_number)
    return m
  }, [rawTables])

  // --- Adapted data ---
  const orders = useMemo<UIOrder[]>(
    () => rawOrders.map((o) => adaptOrder(o, tableNumberMap)),
    [rawOrders, tableNumberMap],
  )

  const tables = useMemo<UITable[]>(
    () => rawTables.map((t) => ({
      id: t.table_number,
      _realId: t.id,
      name: t.name ?? '',
      qrToken: t.qr_token,
      status: t.status,
      time: '',
      amount: 0,
      pax: 0,
    })),
    [rawTables],
  )

  // --- Order handlers ---
  const updateOrderStatus = async (id: string, newStatus: string) => {
    const dbStatus = ORDER_STATUS_MAP[newStatus] as OrderStatus | undefined
    if (!dbStatus) { toast.error('잘못된 주문 상태입니다.'); return }
    try {
      await apiUpdateOrderStatus(id, dbStatus)
      if (newStatus === 'preparing') toast.success('주방으로 전달되었습니다.', { icon: <ChefHat className="w-5 h-5 text-orange-500" /> })
      if (newStatus === 'completed') toast.success('서빙을 준비해주세요.')
      if (newStatus === 'served') toast.success('서빙이 완료되었습니다.')
    } catch {
      toast.error('주문 상태 변경에 실패했습니다.')
    }
  }

  const deleteOrder = async (id: string) => {
    try {
      await apiDeleteOrder(id)
      toast.success('주문이 삭제되었습니다.')
    } catch {
      toast.error('주문 삭제에 실패했습니다.')
    }
  }

  const updateOrderPax = async (id: string, pax: number) => {
    try {
      await apiUpdateOrderPax(id, pax)
    } catch {
      toast.error('인원 수 변경에 실패했습니다.')
    }
  }

  // --- Derived counts ---
  const pendingCount = orders.filter((o) => o.status === 'pending').length
  const preparingCount = orders.filter((o) => o.status === 'preparing').length
  const completedCount = orders.filter((o) => o.status === 'completed').length

  // --- Guards ---
  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <span className="text-zinc-400 font-bold text-lg">로딩 중...</span>
      </div>
    )
  }

  if (storeExpired) {
    return (
      <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="text-4xl">⚠️</span>
        <h1 className="text-xl font-bold text-white">이용 기간이 만료되었습니다</h1>
        <p className="text-zinc-400 text-sm">구독 기간이 만료되어 서비스를 이용할 수 없습니다.</p>
        <Link href="/admin" className="text-orange-500 hover:text-orange-400 font-bold text-sm mt-2">
          ← 어드민으로 돌아가기
        </Link>
      </div>
    )
  }

  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col">
      {/* Header Bar */}
      <header className="h-14 bg-zinc-800 border-b border-zinc-700 px-4 md:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">어드민</span>
          </Link>
          <div className="w-px h-6 bg-zinc-700" />
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-500" />
            <span className="text-white font-black text-base">{user.storeName ?? 'KDS'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex items-center gap-1.5 text-zinc-400 text-sm font-bold">
            <Clock className="w-4 h-4" />
            <span>{timeStr}</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-black">
            <span className="bg-red-500/20 text-red-400 px-2.5 py-1 rounded-lg">
              신규 {pendingCount}
            </span>
            <span className="bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded-lg">
              조리 {preparingCount}
            </span>
            <span className="bg-green-500/20 text-green-400 px-2.5 py-1 rounded-lg">
              서빙 {completedCount}
            </span>
          </div>
        </div>
      </header>

      {/* KDS Content */}
      <main className="flex-1 p-4 md:p-6 overflow-hidden">
        <KDSPanel
          orders={orders}
          tables={tables}
          updateOrderStatus={updateOrderStatus}
          deleteOrder={deleteOrder}
          updateOrderPax={updateOrderPax}
        />
      </main>
    </div>
  )
}
