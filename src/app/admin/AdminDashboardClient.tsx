'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Bell, ChefHat, CheckCircle2, RefreshCcw, LayoutDashboard, LayoutGrid,
  UtensilsCrossed, Settings, BarChart4, Users, Receipt, Search, LogOut,
  QrCode, Volume2,
} from 'lucide-react'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'motion/react'

import { useAuth } from '@/providers/AuthProvider'
import { supabase } from '@/lib/supabase'
import { isStoreSubscriptionActive } from '@/lib/utils/subscription'
import { getDailyRevenue, getOrderStats, getTopMenuItems, getCategorySales } from '@/lib/api/admin'
import { addTableAction, renameTableAction, deleteTableAction } from '@/app/actions/admin'
import { fetchCustomers, fetchStorePointEvents, grantPoints, createCustomerByPhone, setKakaoFriend } from '@/lib/api/customers'
import type { OrderStats, TopMenuItem, CategorySales } from '@/lib/api/admin'
import { createOrder } from '@/lib/api/order'
import { completeWaiting as apiCompleteWaiting } from '@/lib/api/waiting'
import { callWaitingAction } from '@/app/actions/waiting'

import { primeStaffAlertAudio, isStaffAlertSoundEnabled, setStaffAlertSoundEnabled } from '@/hooks/useOrderNotification'
import { useOrders } from '@/hooks/useOrders'
import { useRealtimeTables } from '@/hooks/useRealtimeTables'
import { useMenuAdmin } from '@/hooks/useMenuAdmin'
import { useWaitingQueue } from '@/hooks/useWaitingQueue'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'

import {
  adaptOrder, minutesAgo,
  STAFF_ALLOWED_TABS, ORDER_STATUS_MAP,
} from '@/app/components/admin/types'
import type { UIOrder, UITable, UIMenu, RecentActivity } from '@/app/components/admin/types'
import type { ItemBadge } from '@/types/database'

import { NotificationDeniedBanner } from '@/app/components/admin/NotificationDeniedBanner'
import { StaffManagement } from '@/app/components/admin/StaffManagement'
import DashboardSummary from '@/app/components/admin/panels/DashboardSummary'
import KDSPanel from '@/app/components/admin/panels/KDSPanel'
import TablesPanel from '@/app/components/admin/panels/TablesPanel'
import WaitingPanel from '@/app/components/admin/panels/WaitingPanel'
import AnalyticsPanel from '@/app/components/admin/panels/AnalyticsPanel'
import MenuPanel from '@/app/components/admin/panels/MenuPanel'
import CategoryManagePanel from '@/app/components/admin/panels/CategoryManagePanel'
import QRPanel from '@/app/components/admin/panels/QRPanel'
import EventPanel from '@/app/components/admin/panels/EventPanel'
import CustomersPanel from '@/app/components/admin/panels/CustomersPanel'
import SettingsPanel from '@/app/components/admin/panels/SettingsPanel'
import { PointPolicyModal } from '@/app/components/admin/modals/PointPolicyModal'
import { CustomerEditModal } from '@/app/components/admin/modals/CustomerEditModal'
import { MenuEditModal } from '@/app/components/admin/modals/MenuEditModal'
import { TableDetailModal } from '@/app/components/admin/modals/TableDetailModal'
import { AddOrderModal } from '@/app/components/admin/modals/AddOrderModal'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/app/components/ui/alert-dialog'
import type { EventSettings, PointEvent } from '@/app/components/admin/panels/EventPanel'
import type { Customer } from '@/app/components/admin/panels/CustomersPanel'
import type { StaffCallOption } from '@/app/components/admin/panels/SettingsPanel'

function toUICustomer(c: {
  id: string; name: string; profileImage?: string | null; phone?: string | null;
  kakaoFriend?: boolean; totalPoints: number; visitCount: number; lastVisitedAt?: string | null
}): Customer {
  return { id: c.id, name: c.name, profileImage: c.profileImage, phone: c.phone, kakaoFriend: c.kakaoFriend, points: c.totalPoints, visitCount: c.visitCount, lastVisitedAt: c.lastVisitedAt }
}

export default function AdminDashboardClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isFirstLogin, signOut } = useAuth()
  // super_admin can override storeId via ?storeId= query param
  const queryStoreId = searchParams.get('storeId')
  const storeId = queryStoreId || user?.storeId || ''

  // --- Store slug for QR URLs ---
  const [storeSlug, setStoreSlug] = useState('')
  useEffect(() => {
    if (!storeId) return
    supabase.from('stores').select('slug').eq('id', storeId).single()
      .then(({ data }) => { if (data) setStoreSlug((data as { slug: string }).slug) })
  }, [storeId])

  // --- Notification permission ---
  const { showBanner, dismissBanner, requestPermission } = useNotificationPermission()
  const [staffAlertSoundEnabled, setStaffAlertSoundEnabledState] = useState(true)

  useEffect(() => {
    setStaffAlertSoundEnabledState(isStaffAlertSoundEnabled())
  }, [])

  useEffect(() => {
    const requestOnce = () => {
      window.removeEventListener('pointerdown', requestOnce)
      window.removeEventListener('keydown', requestOnce)
      void requestPermission()
      void primeStaffAlertAudio()
    }
    window.addEventListener('pointerdown', requestOnce, { once: true })
    window.addEventListener('keydown', requestOnce, { once: true })
    return () => {
      window.removeEventListener('pointerdown', requestOnce)
      window.removeEventListener('keydown', requestOnce)
    }
  }, [requestPermission])

  // --- Supabase Realtime hooks ---
  const {
    orders: rawOrders,
    updateOrderStatus: apiUpdateOrderStatus,
    deleteOrder: apiDeleteOrder,
  } = useOrders(storeId || null)

  const {
    tables: rawTables,
    updateTableStatus: apiUpdateTableStatus,
    refetch: refetchTables,
  } = useRealtimeTables(storeId || null)

  const {
    menuItems: rawMenuItems,
    categories: rawCategories,
    addMenuItem,
    editMenuItem,
    toggleAvailability,
    uploadImage,
    removeMenuItem: apiRemoveMenuItem,
    addCategory,
    removeCategory,
    updateCategoryName,
    reorderCategories,
  } = useMenuAdmin(storeId || null)

  const { waitings: rawWaitings } = useWaitingQueue(storeId || null)

  // --- Lookup maps ---
  const tableNumberMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of rawTables) m.set(t.id, t.table_number)
    return m
  }, [rawTables])

  const categoryNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of rawCategories) m.set(c.id, c.name)
    return m
  }, [rawCategories])

  // --- Adapted data ---
  const adaptedOrders = useMemo<UIOrder[]>(
    () => rawOrders.map((o) => adaptOrder(o, tableNumberMap)),
    [rawOrders, tableNumberMap],
  )

  const adaptedTables = useMemo<UITable[]>(
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

  const adaptedMenus = useMemo<UIMenu[]>(
    () => rawMenuItems.map((m) => ({
      id: m.id,
      name: m.name,
      category: categoryNameMap.get(m.category_id) ?? '',
      price: m.price,
      stock: m.is_available,
      image: m.image_url ?? undefined,
      desc: m.description ?? undefined,
      badge: m.badge ?? undefined,
      options: [],
    })),
    [rawMenuItems, categoryNameMap],
  )

  // --- Revenue data ---
  const [revenueData, setRevenueData] = useState<{ time: string; amount: number }[]>([])
  const [orderStats, setOrderStats] = useState<OrderStats>({ totalRevenue: 0, orderCount: 0, averageOrderValue: 0 })
  const [topMenuItems, setTopMenuItems] = useState<TopMenuItem[]>([])
  const [categorySales, setCategorySales] = useState<CategorySales[]>([])

  useEffect(() => {
    if (!storeId) return
    getDailyRevenue(storeId, 7)
      .then((rows) =>
        setRevenueData(rows.map((r) => ({ time: r.date.slice(5), amount: Math.round(r.amount / 10000) }))),
      )
      .catch(() => {})
    getOrderStats(storeId, 7).then(setOrderStats).catch(() => {})
    getTopMenuItems(storeId, 7, 5).then(setTopMenuItems).catch(() => {})
    getCategorySales(storeId, 7).then(setCategorySales).catch(() => {})
  }, [storeId])

  // --- Optimistic overlay pattern ---
  // Realtime data = source of truth. Local modifications in overlay Maps.
  // Merged via useMemo. Overlays cleared when Realtime confirms the change.

  // Orders: only pax is local-only
  const [orderPaxMap, setOrderPaxMap] = useState<Map<string, number>>(new Map())
  const orders = useMemo<UIOrder[]>(
    () => adaptedOrders.map((o) => {
      const pax = orderPaxMap.get(o.id)
      return pax !== undefined ? { ...o, pax } : o
    }),
    [adaptedOrders, orderPaxMap],
  )

  // Tables: status (optimistic), amount/pax/time (local-only)
  const [tableOverrides, setTableOverrides] = useState<Map<number, Partial<UITable>>>(new Map())
  const tables = useMemo<UITable[]>(
    () => adaptedTables.map((t) => {
      const override = tableOverrides.get(t.id)
      return override ? { ...t, ...override } : t
    }),
    [adaptedTables, tableOverrides],
  )

  // Clear table overrides when Realtime confirms the status change
  useEffect(() => {
    setTableOverrides((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const t of adaptedTables) {
        const override = next.get(t.id)
        if (override?.status && override.status === t.status) {
          next.delete(t.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [adaptedTables])

  // Menus: no local state — Realtime is single source of truth
  const menus = adaptedMenus

  // --- App mode / tab ---
  const [appMode, setAppMode] = useState<'pos' | 'admin'>('pos')
  const [activeTab, setActiveTab] = useState('orders')

  useEffect(() => {
    if (user?.role === 'staff' && appMode === 'admin') setAppMode('pos')
    if (user?.role === 'staff' && !STAFF_ALLOWED_TABS.has(activeTab)) setActiveTab('orders')
  }, [user?.role, appMode, activeTab])

  // --- Subscription check ---
  const [storeExpired, setStoreExpired] = useState(false)
  useEffect(() => {
    if (!storeId) return
    supabase
      .from('stores')
      .select('is_active, subscription_end')
      .eq('id', storeId)
      .single()
      .then(({ data }) => {
        if (data && !isStoreSubscriptionActive(data)) setStoreExpired(true)
      })
  }, [storeId])

  // --- Derived values ---
  const pendingOrders = orders.filter((o) => o.status === 'pending')
  const preparingOrders = orders.filter((o) => o.status === 'preparing')
  const totalToday = orders.reduce((sum, o) => sum + o.total, 0)
  const occupiedTablesCount = tables.filter((t) => t.status === 'occupied').length

  const recentActivities = useMemo<RecentActivity[]>(() => {
    return rawOrders.slice(0, 5).map((o) => {
      const tableNum = tableNumberMap.get(o.table_id ?? '') ?? 0
      return {
        time: `${minutesAgo(o.created_at)}분 전`,
        text: `${tableNum}번 테이블 주문 (${o.total_price.toLocaleString()}원)`,
        type: 'order' as const,
        icon: Receipt,
        color: 'text-blue-500',
        bg: 'bg-blue-50',
      }
    })
  }, [rawOrders, tableNumberMap])

  const POS_CATEGORIES = useMemo(
    () => ['전체', ...Array.from(new Set(menus.map((m) => m.category)))],
    [menus],
  )

  // --- Helper ---
  const findRealTableId = (tableNumber: number): string | undefined =>
    tables.find((t) => t.id === tableNumber)?._realId

  // --- Order handlers ---
  const updateOrderStatus = async (id: string, newStatus: string) => {
    const dbStatus = ORDER_STATUS_MAP[newStatus]
    if (!dbStatus) { toast.error('잘못된 주문 상태입니다.'); return }
    try {
      await apiUpdateOrderStatus(id, dbStatus)
      if (newStatus === 'preparing') toast.success('주방으로 전달되었습니다.', { icon: <ChefHat className="w-5 h-5 text-orange-500" /> })
      if (newStatus === 'completed') toast.success('서빙을 준비해주세요.', { icon: <CheckCircle2 className="w-5 h-5 text-green-500" /> })
      if (newStatus === 'served') toast.success('서빙이 완료되었습니다.')
    } catch {
      toast.error('주문 상태 변경에 실패했습니다.')
    }
  }

  const updateOrderPax = (id: string, pax: number) => {
    setOrderPaxMap((prev) => new Map(prev).set(id, pax))
  }

  const deleteOrder = async (id: string) => {
    try {
      await apiDeleteOrder(id)
      toast.success('주문이 삭제되었습니다.')
    } catch {
      toast.error('주문 삭제에 실패했습니다.')
    }
  }

  // --- Table handlers ---
  const handleOpenTableModal = (table: UITable) => {
    setSelectedTable(table)
    setIsTableModalOpen(true)
  }

  const markTableAvailable = (id: number) => {
    const realId = findRealTableId(id)
    if (realId) apiUpdateTableStatus(realId, 'available')
    setTableOverrides((prev) => new Map(prev).set(id, { status: 'available', amount: 0, time: '', pax: 0 }))
    toast.info(`${id}번 테이블 정리가 완료되었습니다.`)
  }

  const handleCheckoutTable = (id: number) => {
    const realId = findRealTableId(id)
    if (realId) apiUpdateTableStatus(realId, 'cleaning')
    setTableOverrides((prev) => new Map(prev).set(id, { status: 'cleaning', amount: 0, time: '', pax: 0 }))
    toast.success(`${id}번 테이블 정산이 완료되었습니다. 정리 대기 중입니다.`)
    setIsTableModalOpen(false)
  }

  const cancelTableOrder = (id: number) => {
    const realId = findRealTableId(id)
    if (realId) apiUpdateTableStatus(realId, 'available')
    setTableOverrides((prev) => new Map(prev).set(id, { status: 'available', amount: 0, time: '', pax: 0 }))
    toast.success(`${id}번 테이블 주문이 전체 취소되었습니다.`)
    setIsTableModalOpen(false)
  }

  // TODO: cancelTableMenuItem is local-only (no API call) — should call order item delete API
  const cancelTableMenuItem = (tableId: number, orderId: string, itemIndex: number) => {
    const order = orders.find((o) => o.id === orderId)
    if (!order) return
    const removedItem = order.items[itemIndex]
    const removedPrice = (removedItem.price || 0) * removedItem.qty

    const currentTable = tables.find((t) => t.id === tableId)
    if (!currentTable) return
    const newAmount = Math.max(0, currentTable.amount - removedPrice)
    const tableOrders = orders.filter((o) => o.table === tableId && o.id !== orderId)
    const isLastItem = order.items.length === 1 && tableOrders.length === 0

    if (isLastItem) {
      setTableOverrides((prev) => new Map(prev).set(tableId, { status: 'cleaning', amount: 0, time: '', pax: 0 }))
    } else {
      setTableOverrides((prev) => {
        const existing = prev.get(tableId) ?? {}
        return new Map(prev).set(tableId, { ...existing, amount: newAmount })
      })
    }

    if (selectedTable && selectedTable.id === tableId) {
      setSelectedTable((prev) => prev ? { ...prev, amount: isLastItem ? 0 : newAmount } : prev)
    }
    toast.success('메뉴가 취소되었습니다.')
  }

  const markTableOccupied = (id: number) => {
    const realId = findRealTableId(id)
    if (realId) apiUpdateTableStatus(realId, 'occupied')
    setTableOverrides((prev) => new Map(prev).set(id, { status: 'occupied', amount: 0, time: '방금 전', pax: 2 }))
    toast.success(`${id}번 테이블 착석 처리되었습니다.`)
    setIsTableModalOpen(false)
  }

  const updateTablePax = (id: number, pax: number) => {
    setTableOverrides((prev) => {
      const existing = prev.get(id) ?? {}
      return new Map(prev).set(id, { ...existing, pax })
    })
    if (selectedTable && selectedTable.id === id) {
      setSelectedTable((prev) => prev ? { ...prev, pax } : prev)
    }
  }

  // --- Waiting handlers ---
  const callWaiting = async (waitingId: string, queueNumber: number) => {
    try {
      await callWaitingAction(waitingId)
      toast.success(`대기 ${queueNumber}번 고객님을 호출했습니다.`, { icon: <Volume2 className="w-5 h-5 text-blue-500" /> })
    } catch {
      toast.error('호출에 실패했습니다.')
    }
  }

  const completeWaiting = async (waitingId: string, queueNumber: number) => {
    try {
      await apiCompleteWaiting(waitingId)
      toast.success(`대기 ${queueNumber}번 고객님 입장이 완료되었습니다.`)
    } catch {
      toast.error('입장 처리에 실패했습니다.')
    }
  }

  // --- Menu handlers ---
  const toggleMenuStock = (id: string) => {
    const menu = menus.find((m) => m.id === id)
    if (menu) toggleAvailability(id, menu.stock)
    // No local state update needed — toggleAvailability updates DB, Realtime propagates
  }

  const handleSaveMenu = async (e: React.FormEvent<HTMLFormElement>, menuOptions: any[], imageUrl?: string) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const categoryName = formData.get('category') as string
    const price = Number(formData.get('price'))
    const desc = formData.get('desc') as string || ''
    const badgeVal = formData.get('badge') as string
    const badge = (badgeVal === '없음' ? null : (badgeVal?.toLowerCase() || null)) as ItemBadge | null
    const cat = rawCategories.find((c) => c.name === categoryName)
    const category_id = cat?.id ?? ''

    try {
      if (editingMenu) {
        await editMenuItem(editingMenu.id, { name, category_id, price, description: desc || null, badge, ...(imageUrl !== undefined && { image_url: imageUrl }) })
      } else {
        await addMenuItem({ store_id: storeId, name, category_id, price, description: desc || null, badge, image_url: imageUrl ?? null })
      }
    } catch {
      // toast handled by hook
    }
    setIsMenuModalOpen(false)
  }

  // --- Add Order handlers ---
  const handleAddToCart = (menu: UIMenu) => {
    if (!menu.stock) { toast.error('품절된 메뉴입니다.'); return }
    setCart((prev) => {
      const existing = prev.find((item) => item.id === menu.id)
      if (existing) return prev.map((item) => item.id === menu.id ? { ...item, qty: item.qty + 1 } : item)
      return [...prev, { ...menu, qty: 1 }]
    })
  }

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item)
        .filter((item) => item.qty > 0),
    )
  }

  const handlePlaceOrder = async () => {
    if (cart.length === 0) { toast.error('메뉴를 선택해주세요.'); return }
    if (!storeId) { toast.error('매장 정보를 찾을 수 없습니다.'); return }
    if (!orderTableId) { toast.error('테이블을 선택해주세요.'); return }
    const tableRealId = findRealTableId(orderTableId)
    if (!tableRealId) { toast.error('테이블 정보를 불러오지 못했습니다.'); return }

    const orderItems = cart.map((item) => ({
      menuItemId: item.id,
      menuItemName: item.name,
      unitPrice: item.price,
      quantity: item.qty,
      totalPrice: item.price * item.qty,
      selectedOptions: [],
    }))
    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.qty, 0)

    setIsPlacingOrder(true)
    try {
      await createOrder({ storeId, tableId: tableRealId, items: orderItems })
      await apiUpdateTableStatus(tableRealId, 'occupied')
      setTableOverrides((prev) => {
        const existing = prev.get(orderTableId!) ?? {}
        const currentTable = tables.find((t) => t.id === orderTableId)
        return new Map(prev).set(orderTableId!, {
          ...existing,
          status: 'occupied',
          amount: (currentTable?.amount ?? 0) + totalAmount,
          time: existing.time || currentTable?.time || '방금 전',
          pax: existing.pax || currentTable?.pax || 2,
        })
      })
      if (selectedTable && selectedTable.id === orderTableId) {
        setSelectedTable((prev) => prev ? ({
          ...prev, status: 'occupied', amount: (prev.amount || 0) + totalAmount,
          time: prev.time || '방금 전', pax: prev.pax || 2,
        }) : prev)
      }
      toast.success(`${orderTableId}번 테이블 주문이 주방으로 전달되었습니다.`, {
        icon: <ChefHat className="w-5 h-5 text-orange-500" />,
      })
      setIsAddOrderModalOpen(false)
      setCart([])
    } catch {
      toast.error('주문 전송에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsPlacingOrder(false)
    }
  }

  const handleAddTable = async () => {
    const result = await addTableAction(storeId)
    if (!result.success) {
      toast.error(`테이블 추가 실패: ${result.error}`)
      return
    }
    await refetchTables()
    toast.success('테이블이 추가되었습니다.')
  }

  const handleRenameTable = async (realId: string, name: string) => {
    const result = await renameTableAction(realId, name)
    if (!result.success) {
      toast.error(`이름 변경 실패: ${result.error}`)
      return
    }
    await refetchTables()
    toast.success('테이블 이름이 변경되었습니다.')
  }

  const handleDeleteTable = async (realId: string) => {
    const result = await deleteTableAction(realId)
    if (!result.success) {
      toast.error(`삭제 실패: ${result.error}`)
      return
    }
    await refetchTables()
    toast.success('테이블이 삭제되었습니다.')
  }

  // --- Settings state ---
  const [eventSettings, setEventSettings] = useState<EventSettings>({
    enabled: true,
    title: '네이버 영수증 리뷰 이벤트 🎉',
    desc: '참여하고 아메리카노 1잔 무료로 받기!',
    reward: '아메리카노 1잔',
  })
  const [pointEvents, setPointEvents] = useState<PointEvent[]>([])

  useEffect(() => {
    if (!storeId) return
    fetchStorePointEvents(storeId)
      .then((data) => setPointEvents(data.map((e) => ({ id: e.id, name: e.name, points: e.points, isActive: e.isActive }))))
      .catch(() => {})
  }, [storeId])

  const handleGrantEventPoint = async (customerId: string, event: PointEvent) => {
    try {
      await grantPoints(customerId, event.points, 'event_grant', event.name)
      setCustomers((prev) =>
        prev.map((c) => c.id === customerId ? { ...c, points: c.points + event.points } : c),
      )
      toast.success(`${event.name} — ${event.points.toLocaleString()}P 지급 완료`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '포인트 지급에 실패했습니다.')
      throw err
    }
  }

  const [staffCallOptions, setStaffCallOptions] = useState<StaffCallOption[]>([
    { id: 1, name: '직원만 호출' },
    { id: 2, name: '물/얼음물 주세요' },
    { id: 3, name: '물티슈 주세요' },
    { id: 4, name: '앞치마 주세요' },
    { id: 5, name: '주문 수정할게요' },
  ])

  const handleAddCallOption = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const newName = formData.get('name') as string
    if (!newName) return
    setStaffCallOptions((prev) => [...prev, { id: Date.now(), name: newName }])
    e.currentTarget.reset()
    toast.success('직원 호출 옵션이 추가되었습니다.')
  }

  const handleRemoveCallOption = (id: number) => {
    setStaffCallOptions((prev) => prev.filter((opt) => opt.id !== id))
    toast.success('직원 호출 옵션이 삭제되었습니다.')
  }

  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwNew || !pwConfirm) { toast.error('모든 항목을 입력하세요.'); return }
    if (!/^(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(pwNew)) {
      toast.error('8자 이상, 특수문자를 포함해야 합니다.'); return
    }
    if (pwNew !== pwConfirm) { toast.error('새 비밀번호가 일치하지 않습니다.'); return }
    setPwLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNew })
      if (error) throw error
      toast.success('비밀번호가 변경되었습니다.')
      setPwNew(''); setPwConfirm('')
    } catch (err: any) {
      toast.error(err?.message ?? '비밀번호 변경에 실패했습니다.')
    } finally {
      setPwLoading(false)
    }
  }

  // --- Customers state ---
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isCustomersLoading, setIsCustomersLoading] = useState(false)

  const [pointRate, setPointRate] = useState(5)
  const [isPointPolicyModalOpen, setIsPointPolicyModalOpen] = useState(false)
  const [isCustomerEditModalOpen, setIsCustomerEditModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  useEffect(() => {
    if (!storeId) return
    setIsCustomersLoading(true)
    fetchCustomers(storeId)
      .then((data) => setCustomers(data.map(toUICustomer)))
      .catch(() => toast.error('고객 목록을 불러오지 못했습니다.'))
      .finally(() => setIsCustomersLoading(false))
  }, [storeId])

  const handleSavePointPolicy = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    setPointRate(Number(formData.get('rate')))
    setIsPointPolicyModalOpen(false)
    toast.success('포인트 적립 정책이 저장되었습니다.')
  }

  const handleSaveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingCustomer) return
    const formData = new FormData(e.currentTarget)
    const newPoints = Number(formData.get('points'))
    const delta = newPoints - editingCustomer.points
    if (delta === 0) {
      setIsCustomerEditModalOpen(false)
      return
    }

    try {
      await grantPoints(editingCustomer.id, delta, 'manual_grant', '관리자 수동 조정')
      setCustomers((prev) =>
        prev.map((c) => c.id === editingCustomer.id ? { ...c, points: newPoints } : c),
      )
      setIsCustomerEditModalOpen(false)
      toast.success('포인트가 업데이트 되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '포인트 업데이트에 실패했습니다.')
    }
  }

  const handleAddCustomer = async (name: string, phone: string) => {
    try {
      const created = await createCustomerByPhone(storeId, name, phone)
      setCustomers((prev) => [...prev, toUICustomer(created)])
      toast.success('고객이 추가되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '고객 추가에 실패했습니다.')
      throw err
    }
  }

  const handleKakaoFriendConfirm = async () => {
    if (!editingCustomer) return
    try {
      await setKakaoFriend(editingCustomer.id)
      const kakaoEvent = pointEvents.find((e) => e.isActive && e.name.includes('카카오'))
      if (kakaoEvent) {
        await grantPoints(editingCustomer.id, kakaoEvent.points, 'event_grant', kakaoEvent.name)
        setCustomers((prev) =>
          prev.map((c) => c.id === editingCustomer.id
            ? { ...c, kakaoFriend: true, points: c.points + kakaoEvent.points }
            : c,
          ),
        )
        toast.success(`카카오 친구 확인 완료 — ${kakaoEvent.points.toLocaleString()}P 지급됐습니다.`)
      } else {
        setCustomers((prev) =>
          prev.map((c) => c.id === editingCustomer.id ? { ...c, kakaoFriend: true } : c),
        )
        toast.success('카카오 채널 친구로 등록됐습니다.')
      }
      setEditingCustomer((prev) => prev ? { ...prev, kakaoFriend: true } : prev)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '처리에 실패했습니다.')
      throw err
    }
  }

  // --- Table modal state ---
  const [selectedTable, setSelectedTable] = useState<UITable | null>(null)
  const [isTableModalOpen, setIsTableModalOpen] = useState(false)

  // --- Add order modal state ---
  const [isAddOrderModalOpen, setIsAddOrderModalOpen] = useState(false)
  const [orderTableId, setOrderTableId] = useState<number | null>(null)
  const [cart, setCart] = useState<any[]>([])
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [posCategory, setPosCategory] = useState('전체')

  // --- Menu modal state ---
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<UIMenu | null>(null)

  const handleOpenMenuModal = (menu?: UIMenu) => {
    setEditingMenu(menu ?? null)
    setIsMenuModalOpen(true)
  }

  // --- Guards ---
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-zinc-500 font-bold">로딩 중...</span>
      </div>
    )
  }

  if (isFirstLogin) {
    window.location.href = '/change-password'
    return null
  }

  if (storeExpired) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-8 text-center">
        <span className="text-4xl">⚠️</span>
        <h1 className="text-xl font-bold text-zinc-800">이용 기간이 만료되었습니다</h1>
        <p className="text-zinc-500 text-sm">
          구독 기간이 만료되어 서비스를 이용할 수 없습니다.<br />관리자에게 문의해 주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-zinc-50 flex flex-col lg:flex-row font-sans overflow-hidden">

      {/* Mobile Bottom Navigation — flex 마지막에 위치 (하단 고정) */}
      <nav className="lg:hidden order-last shrink-0 w-full bg-white border-t border-zinc-200 h-[60px] z-50 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] overflow-x-auto no-scrollbar relative">
        <div className="flex items-center h-full w-full justify-around px-1">
          {(appMode === 'pos' ? [
            { id: 'orders', icon: ChefHat, label: 'KDS', badge: pendingOrders.length + preparingOrders.length },
            { id: 'waiting', icon: Users, label: '웨이팅', badge: rawWaitings.length },
            { id: 'tables', icon: LayoutGrid, label: '홀현황' },
          ] : [
            { id: 'analytics', icon: LayoutDashboard, label: '대시보드' },
            { id: 'menu', icon: UtensilsCrossed, label: '메뉴' },
            { id: 'customers', icon: Users, label: '고객' },
            { id: 'qr', icon: QrCode, label: 'QR' },
            { id: 'settings', icon: Settings, label: '설정' },
            ...(user.role === 'owner' ? [{ id: 'staff', icon: Users, label: '직원' }] : []),
          ] as { id: string; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number }[]).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full relative transition-colors ${
                activeTab === item.id ? 'text-orange-600' : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              <div className="relative mb-1 flex justify-center">
                <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'fill-orange-50 stroke-orange-600' : ''}`} />
                {item.badge ? (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full shadow-sm">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span className={`text-[10px] font-bold ${activeTab === item.id ? 'text-orange-600' : 'text-zinc-500'}`}>
                {item.label}
              </span>
            </button>
          ))}
          {/* 모드 전환 버튼 — owner/manager만 */}
          {user.role !== 'staff' && (
            <button
              onClick={() => {
                if (appMode === 'pos') { setAppMode('admin'); setActiveTab('analytics') }
                else { setAppMode('pos'); setActiveTab('orders') }
              }}
              className="flex flex-col items-center justify-center flex-1 h-full transition-colors text-zinc-400"
            >
              <div className="mb-1">
                {appMode === 'pos'
                  ? <Settings className="w-5 h-5" />
                  : <ChefHat className="w-5 h-5" />}
              </div>
              <span className="text-[10px] font-bold text-zinc-500">
                {appMode === 'pos' ? '매장관리' : 'POS'}
              </span>
            </button>
          )}
        </div>
        {appMode === 'admin' && (
          <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-white to-transparent" />
        )}
      </nav>

      {/* PC Sidebar */}
      <aside className="w-64 bg-zinc-950 text-zinc-400 flex-col hidden lg:flex shrink-0">
        <div className="h-20 flex items-center px-6 border-b border-zinc-800/50">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center mr-3 shadow-lg shadow-orange-500/20">
            <UtensilsCrossed className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-black text-xl tracking-tight leading-none">TableFlow</h1>
            <span className="text-orange-500 font-bold text-[10px] tracking-wider uppercase">Pro POS</span>
          </div>
        </div>

        <div className="px-4 py-4 border-b border-zinc-800/50">
          <div className="flex bg-zinc-900 rounded-xl p-1 border border-zinc-800">
            <button
              onClick={() => { setAppMode('pos'); setActiveTab('orders') }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${appMode === 'pos' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              👨‍🍳 현장 POS
            </button>
            {user.role !== 'staff' && (
              <button
                onClick={() => { setAppMode('admin'); setActiveTab('analytics') }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${appMode === 'admin' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                ⚙️ 매장 관리
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1">
          {(appMode === 'pos' ? [
            { id: 'orders', icon: ChefHat, label: '주방 디스플레이', badge: pendingOrders.length },
            { id: 'waiting', icon: Users, label: '웨이팅 관리', badge: rawWaitings.length },
            { id: 'tables', icon: LayoutDashboard, label: '홀 테이블 현황' },
          ] : [
            { id: 'analytics', icon: BarChart4, label: '매출 분석' },
            { id: 'menu', icon: UtensilsCrossed, label: '메뉴 관리' },
            { id: 'qr', icon: QrCode, label: 'QR 코드 관리' },
            { id: 'settings', icon: Settings, label: '매장 설정' },
            ...(user.role === 'owner' ? [{ id: 'staff', icon: Users, label: '직원 관리' }] : []),
          ] as { id: string; icon: React.ComponentType<{ className?: string }>; label: string; badge?: number }[]).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all font-bold ${
                activeTab === item.id ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-orange-500' : ''}`} />
                <span>{item.label}</span>
              </div>
              {item.badge ? (
                <span className="bg-orange-500 text-white text-xs font-black px-2 py-0.5 rounded-full shadow-sm">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-zinc-800/50">
          <div className="bg-zinc-900 rounded-2xl p-4 flex items-center gap-3 mb-3 border border-zinc-800">
            <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center font-bold text-white shrink-0">
              {(user.storeName ?? '').slice(0, 2)}
            </div>
            <div className="truncate">
              <p className="text-white font-bold text-sm truncate">{user.storeName ?? ''}</p>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                {user.role === 'owner' ? '최고관리자' : user.role === 'manager' ? '매니저' : '직원'}
              </p>
            </div>
            <button className="ml-auto text-zinc-500 hover:text-white shrink-0">
              <Settings className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setIsLogoutConfirmOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors text-sm font-bold border border-zinc-800"
          >
            <LogOut className="w-4 h-4" /> 로그아웃
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-zinc-50/50 w-full">
        {/* Header */}
        <header className="h-14 lg:h-20 bg-white border-b border-zinc-200/80 px-4 lg:px-8 flex items-center justify-between shrink-0 shadow-sm z-10 sticky top-0">
          <div className="flex items-center gap-2 lg:gap-4 w-full lg:w-auto">
            <button onClick={() => setIsLogoutConfirmOpen(true)} className="lg:hidden p-2 -ml-2 text-zinc-600 hover:bg-zinc-100 rounded-xl">
              <LogOut className="w-5 h-5" />
            </button>
            <div className="lg:hidden flex bg-zinc-100/80 p-1 rounded-xl mx-auto border border-zinc-200/50 shadow-inner">
              <button
                onClick={() => { setAppMode('pos'); setActiveTab('orders') }}
                className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${appMode === 'pos' ? 'bg-white text-orange-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-zinc-500'}`}
              >
                👨‍🍳 현장 POS
              </button>
              {user.role !== 'staff' && (
                <button
                  onClick={() => { setAppMode('admin'); setActiveTab('analytics') }}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${appMode === 'admin' ? 'bg-white text-orange-600 shadow-[0_2px_8px_rgba(0,0,0,0.08)]' : 'text-zinc-500'}`}
                >
                  ⚙️ 매장 관리
                </button>
              )}
            </div>
            <div className="hidden lg:flex items-center bg-zinc-100/80 px-4 py-2.5 rounded-2xl border border-zinc-200/50 focus-within:bg-white focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/10 transition-all">
              <Search className="w-5 h-5 text-zinc-400 mr-2" />
              <input type="text" placeholder="검색어 입력..." className="bg-transparent border-none outline-none text-sm w-64 font-medium text-zinc-800 placeholder:text-zinc-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-5">
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 font-bold rounded-full text-xs border border-green-200/50">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> 정상 가동중
            </div>
            <button className="hidden lg:flex items-center gap-2 text-zinc-500 hover:text-zinc-900 font-bold text-sm">
              <RefreshCcw className="w-4 h-4" /> 동기화
            </button>
            <div className="hidden lg:block w-px h-6 bg-zinc-200"></div>
            <button className="lg:hidden p-2 text-zinc-600 hover:bg-zinc-100 rounded-xl">
              <Search className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const next = !staffAlertSoundEnabled
                setStaffAlertSoundEnabledState(next)
                setStaffAlertSoundEnabled(next)
                if (next) void primeStaffAlertAudio()
              }}
              className={`hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-colors ${staffAlertSoundEnabled ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:bg-zinc-100'}`}
              title={staffAlertSoundEnabled ? '직원 알림음 끄기' : '직원 알림음 켜기'}
            >
              <Volume2 className="w-4 h-4" />
              {staffAlertSoundEnabled ? '알림음 ON' : '알림음 OFF'}
            </button>
            <button className="relative p-2 text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors">
              <Bell className="w-5 h-5 md:w-6 md:h-6" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        {showBanner && (
          <div className="px-4 md:px-8 pt-3 shrink-0">
            <NotificationDeniedBanner onDismiss={dismissBanner} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 w-full max-w-[100vw]">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <DashboardSummary
                  tables={tables}
                  revenueData={revenueData}
                  recentActivities={recentActivities}
                  pendingOrdersCount={pendingOrders.length}
                  occupiedTablesCount={occupiedTablesCount}
                  totalToday={totalToday}
                  orderCount={orderStats.orderCount}
                />
              </motion.div>
            )}
            {activeTab === 'orders' && (
              <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
                <KDSPanel
                  orders={orders}
                  tables={tables}
                  updateOrderStatus={updateOrderStatus}
                  deleteOrder={deleteOrder}
                  updateOrderPax={updateOrderPax}
                />
              </motion.div>
            )}
            {activeTab === 'waiting' && (
              <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <WaitingPanel
                  waitings={rawWaitings}
                  callWaiting={callWaiting}
                  completeWaiting={completeWaiting}
                  onOpenKioskMode={() => {}}
                />
              </motion.div>
            )}
            {activeTab === 'tables' && (
              <motion.div key="tables" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <TablesPanel
                  tables={tables}
                  onTableClick={handleOpenTableModal}
                  markTableAvailable={markTableAvailable}
                  occupiedTablesCount={occupiedTablesCount}
                />
              </motion.div>
            )}
            {activeTab === 'analytics' && (
              <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <AnalyticsPanel
                  revenueData={revenueData}
                  totalToday={totalToday}
                  orderCount={orderStats.orderCount}
                  averageOrderValue={orderStats.averageOrderValue}
                  categorySales={categorySales}
                  topMenuItems={topMenuItems}
                />
              </motion.div>
            )}
            {activeTab === 'menu' && (
              <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <CategoryManagePanel
                  categories={rawCategories}
                  menuItems={rawMenuItems}
                  onAdd={addCategory}
                  onRemove={removeCategory}
                  onUpdateName={updateCategoryName}
                  onReorder={reorderCategories}
                />
                <MenuPanel
                  menus={menus}
                  categories={Array.from(new Set(menus.map((m) => m.category)))}
                  onEditMenu={handleOpenMenuModal}
                  toggleAvailability={toggleMenuStock}
                  removeMenuItem={apiRemoveMenuItem}
                  onAddMenu={() => handleOpenMenuModal()}
                />
              </motion.div>
            )}
            {activeTab === 'qr' && (
              <motion.div key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <QRPanel
                  tables={tables}
                  storeSlug={storeSlug}
                  onAddTable={handleAddTable}
                  onRenameTable={handleRenameTable}
                  onDeleteTable={handleDeleteTable}
                />
              </motion.div>
            )}
            {activeTab === 'event' && (
              <motion.div key="event" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EventPanel
                  eventSettings={eventSettings}
                  setEventSettings={setEventSettings}
                  storeId={storeId}
                  pointEvents={pointEvents}
                  customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
                  onGrantEventPoint={handleGrantEventPoint}
                />
              </motion.div>
            )}
            {activeTab === 'customers' && (
              <motion.div key="customers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <CustomersPanel
                  storeId={storeId}
                  customers={customers}
                  onEditCustomer={(c) => { setEditingCustomer(c); setIsCustomerEditModalOpen(true) }}
                  onAddCustomer={handleAddCustomer}
                  pointRate={pointRate}
                  onEditPointPolicy={() => setIsPointPolicyModalOpen(true)}
                  isLoading={isCustomersLoading}
                />
              </motion.div>
            )}
            {activeTab === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SettingsPanel
                  staffCallOptions={staffCallOptions}
                  setStaffCallOptions={setStaffCallOptions}
                  pwNew={pwNew}
                  setPwNew={setPwNew}
                  pwConfirm={pwConfirm}
                  setPwConfirm={setPwConfirm}
                  pwLoading={pwLoading}
                  handleChangePassword={handleChangePassword}
                  handleAddCallOption={handleAddCallOption}
                  handleRemoveCallOption={handleRemoveCallOption}
                />
              </motion.div>
            )}
            {activeTab === 'staff' && user.role === 'owner' && (
              <motion.div key="staff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <StaffManagement storeId={storeId} currentUserId={user.id} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <PointPolicyModal
        isOpen={isPointPolicyModalOpen}
        onClose={() => setIsPointPolicyModalOpen(false)}
        pointRate={pointRate}
        onSave={handleSavePointPolicy}
      />

      <CustomerEditModal
        isOpen={isCustomerEditModalOpen}
        onClose={() => setIsCustomerEditModalOpen(false)}
        customer={editingCustomer}
        onSave={handleSaveCustomer}
        onKakaoFriendConfirm={handleKakaoFriendConfirm}
      />

      <MenuEditModal
        isOpen={isMenuModalOpen}
        onClose={() => setIsMenuModalOpen(false)}
        editingMenu={editingMenu}
        categories={rawCategories.map((c) => c.name)}
        onSave={handleSaveMenu}
        onImageUpload={uploadImage}
      />

      <TableDetailModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        table={selectedTable}
        orders={orders}
        onUpdatePax={updateTablePax}
        onCancelMenuItem={cancelTableMenuItem}
        onCancelOrder={cancelTableOrder}
        onMarkOccupied={markTableOccupied}
        onMarkAvailable={markTableAvailable}
        onCheckout={handleCheckoutTable}
        onAddOrder={(tableId) => {
          setOrderTableId(tableId)
          setIsAddOrderModalOpen(true)
        }}
      />

      <AddOrderModal
        isOpen={isAddOrderModalOpen}
        onClose={() => { setIsAddOrderModalOpen(false); setCart([]) }}
        tableId={orderTableId}
        menus={menus}
        categories={POS_CATEGORIES}
        cart={cart}
        posCategory={posCategory}
        setPosCategory={setPosCategory}
        onAddToCart={handleAddToCart}
        onUpdateCartQty={handleUpdateCartQty}
        onPlaceOrder={handlePlaceOrder}
        isPlacingOrder={isPlacingOrder}
      />

      <AlertDialog open={isLogoutConfirmOpen} onOpenChange={setIsLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>로그아웃</AlertDialogTitle>
            <AlertDialogDescription>로그아웃 하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut()} className="bg-zinc-900 hover:bg-zinc-800 text-white">
              로그아웃
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
