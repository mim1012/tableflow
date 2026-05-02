'use client'

import React, { useState } from 'react'
import { ShoppingBag, ChevronLeft, Plus, Minus, X, Receipt, Utensils, Coffee, LayoutGrid, Droplets, Star, Gift, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { StoreRow, TableRow, MenuCategoryRow, SelectedOption } from '@/types/database'
import { getSafeMenuImageSrc } from '../../../ui-helpers'

export interface MenuItemOption {
  name: string
  required: boolean
  choices: { id: string; name: string; price: number }[]
}

export interface MenuItem {
  id: string
  name: string
  price: number
  category: string
  desc: string
  image: string
  badge: string
  options?: MenuItemOption[]
}

interface Props {
  store: StoreRow
  table: TableRow
  categories: MenuCategoryRow[]
  items: MenuItem[]
}

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  '브런치': Utensils,
  '커피': Coffee,
  '음료': Droplets,
  '디저트': Star,
}

type CartItem = {
  id: string
  cartId: string
  name: string
  price: number
  qty: number
  options: string[]
  selectedOptions: SelectedOption[]
  image: string
}

type OrderHistoryEntry = {
  id: string
  items: Array<{ name: string; qty: number; price: number; options: string[] }>
  total: number
  time: Date
  status: string
}

export default function CustomerMenuClient({ store, table, categories, items }: Props) {
  const storeSlug = store.slug
  const tableId = table.id
  const orderHistoryKey = `order-history:${storeSlug}:${table.qr_token}`
  const tableDisplayName = table.name || `테이블 ${table.table_number}번`

  const [activeCategory, setActiveCategory] = useState('전체')
  const [cart, setCart] = useState<CartItem[]>([])

  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false)
  const [isEventOpen, setIsEventOpen] = useState(false)

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [selectedOptions, setSelectedOptions] = useState<{ [key: string]: string }>({})
  const [itemQuantity, setItemQuantity] = useState(1)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [showOrderConfirm, setShowOrderConfirm] = useState(false)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})

  React.useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1200)
    return () => clearTimeout(timer)
  }, [])

  const [orderHistory, setOrderHistory] = useState<OrderHistoryEntry[]>(() => {
    if (typeof window === 'undefined') return []
    const raw = sessionStorage.getItem(orderHistoryKey)
    if (!raw) return []
    try {
      const saved = JSON.parse(raw) as Array<Omit<OrderHistoryEntry, 'time'> & { time: string }>
      return saved.map((entry) => ({ ...entry, time: new Date(entry.time) }))
    } catch {
      sessionStorage.removeItem(orderHistoryKey)
      return []
    }
  })

  React.useEffect(() => {
    sessionStorage.setItem(orderHistoryKey, JSON.stringify(
      orderHistory.map((entry) => ({ ...entry, time: entry.time.toISOString() }))
    ))
  }, [orderHistoryKey, orderHistory])

  const categoryTabs = [
    { id: '전체', icon: LayoutGrid },
    ...categories.map((cat) => ({
      id: cat.name,
      icon: CATEGORY_ICON_MAP[cat.name] ?? LayoutGrid,
    })),
  ]

  const filteredItems = items.filter((item) =>
    activeCategory === '전체' ? true : item.category === activeCategory
  )

  const totalItems = cart.reduce((a, b) => a + b.qty, 0)
  const totalPrice = cart.reduce((total, item) => total + item.price * item.qty, 0)

  const handleImageError = (itemId: string) => {
    setImageErrors((prev) => prev[itemId] ? prev : { ...prev, [itemId]: true })
  }

  const renderMenuImage = (item: Pick<MenuItem, 'id' | 'name' | 'image'>, className: string) => {
    const imageSrc = getSafeMenuImageSrc(item.image)

    if (!imageSrc || imageErrors[item.id]) {
      return (
        <div className={`${className} bg-gradient-to-br from-zinc-200 via-zinc-100 to-white flex items-center justify-center text-zinc-500`}>
          <div className="text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg font-black text-zinc-700 shadow-sm">
              {item.name.slice(0, 1)}
            </div>
            <p className="px-3 text-[11px] font-semibold text-zinc-500">이미지 준비중</p>
          </div>
        </div>
      )
    }

    return (
      <img
        src={imageSrc}
        alt={item.name}
        className={className}
        onError={() => handleImageError(item.id)}
      />
    )
  }

  const openItemDetail = (item: MenuItem) => {
    setSelectedItem(item)
    setItemQuantity(1)
    const defaultOptions: { [key: string]: string } = {}
    if (item.options) {
      item.options.forEach((opt) => {
        if (opt.required) defaultOptions[opt.name] = opt.choices[0].name
      })
    }
    setSelectedOptions(defaultOptions)
  }

  const handleOptionSelect = (optionName: string, choiceName: string, isRequired: boolean) => {
    if (isRequired) {
      setSelectedOptions((prev) => ({ ...prev, [optionName]: choiceName }))
    } else {
      setSelectedOptions((prev) => {
        const next = { ...prev }
        if (next[optionName] === choiceName) {
          delete next[optionName]
        } else {
          next[optionName] = choiceName
        }
        return next
      })
    }
  }

  const addToCart = () => {
    if (!selectedItem) return

    // 필수 옵션 미선택 검증
    const missingRequired = selectedItem.options?.find(
      (opt) => opt.required && !selectedOptions[opt.name]
    )
    if (missingRequired) {
      toast.error(`${missingRequired.name}을(를) 선택해주세요.`)
      return
    }

    let extraPrice = 0
    const optionStrings: string[] = []
    const optionsForOrder: SelectedOption[] = []
    if (selectedItem.options) {
      selectedItem.options.forEach((opt) => {
        const choiceName = selectedOptions[opt.name]
        if (choiceName) {
          const choiceObj = opt.choices.find((c) => c.name === choiceName)
          if (choiceObj) {
            extraPrice += choiceObj.price
            optionStrings.push(`${opt.name}: ${choiceName}`)
            optionsForOrder.push({
              option_choice_id: choiceObj.id,
              group: opt.name,
              choice: choiceName,
              extra_price: choiceObj.price,
            })
          }
        }
      })
    }

    // 동일 메뉴+옵션 조합은 수량 병합
    const cartId = [selectedItem.id, ...optionsForOrder.map((o) => o.option_choice_id).sort()].join('_')
    const cartItem: CartItem = {
      id: selectedItem.id,
      cartId,
      name: selectedItem.name,
      price: selectedItem.price + extraPrice,
      qty: itemQuantity,
      options: optionStrings,
      selectedOptions: optionsForOrder,
      image: selectedItem.image,
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.cartId === cartId)
      if (existing) {
        return prev.map((item) =>
          item.cartId === cartId ? { ...item, qty: item.qty + itemQuantity } : item
        )
      }
      return [...prev, cartItem]
    })
    setSelectedItem(null)
    toast.success('장바구니에 담겼습니다.')
  }

  const updateCartItemQuantity = (cartId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => item.cartId === cartId ? { ...item, qty: Math.max(0, item.qty + delta) } : item)
        .filter((item) => item.qty > 0)
    )
  }

  const handleOrder = async () => {
    if (totalItems === 0 || isSubmitting) return
    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const rpcArgs = {
        p_store_id: store.id,
        p_table_id: table.id,
        p_items: cart.map((item) => ({
          menu_item_id: item.id,
          menu_item_name: item.name,
          quantity: item.qty,
          selected_options: item.selectedOptions.length > 0
            ? item.selectedOptions
            : null,
        })),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('create_order_atomic', rpcArgs)

      if (error || !data) throw new Error(error?.message ?? '주문 생성 실패')

      const newOrder: OrderHistoryEntry = {
        id: data as string,
        items: cart.map((item) => ({ name: item.name, qty: item.qty, price: item.price, options: item.options })),
        total: totalPrice,
        time: new Date(),
        status: '조리 대기중',
      }

      setOrderHistory((prev) => [newOrder, ...prev])
      toast.success(`주문이 성공적으로 접수되었습니다! (${tableDisplayName})`, {
        description: '주방으로 주문이 전달되었습니다.',
        duration: 4000,
      })

      setCart([])
      setIsCartOpen(false)
    } catch {
      toast.error('주문에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 sm:bg-zinc-100 flex justify-center pb-0 sm:pb-28 font-sans">
      <div className="w-full max-w-md bg-zinc-50 min-h-[100dvh] sm:min-h-screen sm:shadow-[0_0_40px_rgba(0,0,0,0.1)] relative overflow-hidden flex flex-col sm:rounded-[40px] sm:mt-10 sm:border-8 sm:border-zinc-800">

        {/* Splash Screen */}
        <AnimatePresence>
          {showSplash && (
            <motion.div
              key="splash"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
              className="absolute inset-0 z-[100] bg-zinc-900 flex flex-col items-center justify-center text-white"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="w-36 h-36 sm:w-44 sm:h-44 relative mb-8"
              >
                <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-orange-500 rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-orange-500 rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-orange-500 rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-orange-500 rounded-br-2xl" />
                <motion.div
                  initial={{ top: 0 }} animate={{ top: '100%' }} transition={{ duration: 1.5, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
                  className="absolute left-0 right-0 h-1 bg-orange-500 shadow-[0_0_20px_5px_rgba(249,115,22,0.6)] z-10 rounded-full"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="w-2/3 h-2/3 border-[8px] border-dashed border-white rounded-3xl" />
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="text-center">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1, type: 'spring' }} className="bg-orange-500/20 text-orange-400 font-bold px-6 py-2.5 rounded-full text-sm inline-flex items-center gap-2 mb-6 border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" /> {tableDisplayName} 인식 완료
                </motion.div>
                <h2 className="text-2xl font-black mb-2 tracking-tight">메뉴를 불러오고 있어요</h2>
                <p className="text-zinc-400 text-sm font-medium">곧 바로 주문할 수 있어요.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cover Image & Header */}
        <div className="relative h-[188px] bg-zinc-900 overflow-hidden shrink-0">
          <img src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080" alt="Cafe Cover" className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/50" />

          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start text-white z-10">
            <div className="flex gap-2">
              <button onClick={() => window.history.back()} className="px-3 py-2 bg-black/30 backdrop-blur-md rounded-full hover:bg-black/50 transition-colors border border-white/20 flex items-center gap-1 shadow-sm">
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs sm:text-sm font-bold pr-1">뒤로</span>
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsOrderHistoryOpen(true)} className="relative px-3 py-2 bg-black/30 backdrop-blur-md rounded-full hover:bg-black/50 transition-colors border border-white/20 flex items-center gap-1.5 shadow-sm text-white">
                <Receipt className="w-4 h-4" />
                <span className="text-xs sm:text-sm font-bold">
                  {orderHistory.length > 0
                    ? `₩${orderHistory.reduce((sum, o) => sum + o.total, 0).toLocaleString()}`
                    : '내역'}
                </span>
                {orderHistory.length > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-zinc-900 animate-pulse"></span>}
              </button>
            </div>
          </div>

          <div className="absolute bottom-5 left-5 right-5 z-10">
            <p className="text-white/70 text-[11px] font-bold mb-1.5 uppercase tracking-[0.22em] drop-shadow-md">{store.name}</p>
            <h1 className="text-3xl font-black text-white drop-shadow-lg tracking-tight">{tableDisplayName}</h1>
            <p className="mt-2 text-sm font-medium text-white/80">원하는 메뉴를 고르고 바로 주문해 보세요.</p>
          </div>
        </div>

        {/* Categories & Menu List */}
        <div className="flex-1 flex flex-col overflow-hidden bg-zinc-50">
          <div className="sticky top-0 z-20 border-b border-zinc-100 bg-white/95 backdrop-blur">
            <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
              {categoryTabs.map((cat) => {
                const isActive = activeCategory === cat.id
                const Icon = cat.icon
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition-all ${
                      isActive
                        ? 'border-orange-500 bg-orange-50 text-orange-600 shadow-sm'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{cat.id}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-4 pt-3">
            <button
              onClick={() => setIsEventOpen(true)}
              className="w-full rounded-2xl border border-orange-100 bg-orange-50/80 px-4 py-3 text-left text-zinc-800 transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-orange-500 shadow-sm">
                    <Gift className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-500">이벤트</p>
                    <h4 className="text-sm font-extrabold leading-tight">영수증 리뷰 참여하고 아메리카노 받기</h4>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </div>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-4 space-y-4 pb-32 relative scroll-smooth">
            {activeCategory === '전체' && (
              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_2px_12px_rgb(0,0,0,0.03)]">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">주문 시작</p>
                <p className="mt-1 text-sm font-medium text-zinc-600">메뉴를 눌러 옵션을 고르고 바로 장바구니에 담아보세요.</p>
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item) => (
                <motion.div
                  data-testid="menu-card"
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => openItemDetail(item)}
                  className="bg-white rounded-[24px] p-3 sm:p-4 shadow-[0_2px_12px_rgb(0,0,0,0.03)] border border-zinc-100 flex gap-4 relative cursor-pointer hover:border-orange-200 transition-all active:scale-[0.98]"
                >
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[18px] overflow-hidden shrink-0 relative bg-zinc-100 shadow-sm">
                    {renderMenuImage(item, 'h-full w-full object-cover transition-transform duration-500 hover:scale-110')}
                    {item.badge && <div className={`absolute top-2 left-2 px-2.5 py-1 text-[10px] font-black rounded-full text-white shadow-sm ${item.badge === 'BEST' ? 'bg-red-500' : item.badge === 'NEW' ? 'bg-blue-500' : 'bg-orange-500'}`}>{item.badge}</div>}
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-0.5 pr-1">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-extrabold text-zinc-900 text-sm sm:text-base leading-snug break-keep">{item.name}</h3>
                        <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-500">{item.category}</span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-zinc-500 mt-1.5 leading-relaxed line-clamp-2">{item.desc || '메뉴 설명을 준비하고 있어요.'}</p>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="font-black text-zinc-900 text-base tracking-tight">₩{item.price.toLocaleString()}</span>
                      <button className="h-9 rounded-full bg-zinc-100 px-3 text-sm font-bold text-zinc-700 hover:bg-orange-50 hover:text-orange-500 transition-colors flex items-center gap-1.5">
                        <Plus className="w-4 h-4" /> 담기
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Floating Cart Button */}
        <AnimatePresence>
          {totalItems > 0 && !isCartOpen && (
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} className="absolute bottom-6 left-4 right-4 z-20">
              <button onClick={() => setIsCartOpen(true)} className="w-full bg-zinc-900 text-white p-4 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] flex items-center justify-between hover:bg-zinc-800 transition-all border border-zinc-800 active:scale-[0.98]">
                <div className="flex items-center gap-4">
                  <div className="relative bg-zinc-800 w-12 h-12 rounded-full flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-orange-400" />
                    <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-extrabold w-6 h-6 flex items-center justify-center rounded-full border-2 border-zinc-900 shadow-sm animate-bounce">{totalItems}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-zinc-400 text-xs font-bold">{totalItems}개 메뉴 · 총 예상금액</p>
                    <p className="font-black text-lg tracking-tight">₩{totalPrice.toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-white text-zinc-900 px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-1.5">
                  장바구니 보기 <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Item Detail Modal */}
        <AnimatePresence>
          {selectedItem && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedItem(null)} className="absolute inset-0 bg-black/60 z-40 backdrop-blur-sm" />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-50 flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
                <div className="relative h-72 shrink-0 bg-zinc-100">
                  {renderMenuImage(selectedItem, 'h-full w-full object-cover')}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <button onClick={() => setSelectedItem(null)} className="absolute top-4 right-4 p-2.5 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-black/40 transition border border-white/10"><X className="w-5 h-5" /></button>
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                    {selectedItem.badge && <span className="inline-block bg-orange-500 text-white text-[10px] font-black px-2 py-1 rounded-md mb-2">{selectedItem.badge}</span>}
                    <h2 className="text-2xl sm:text-3xl font-black mb-2 leading-tight">{selectedItem.name}</h2>
                    <p className="text-white/80 text-sm leading-relaxed font-medium">{selectedItem.desc}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50 pb-32">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-zinc-500">기본 금액</span>
                      <span className="text-2xl font-black text-zinc-900 tracking-tight">₩{selectedItem.price.toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedItem.options && selectedItem.options.map((opt, idx) => (
                    <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-black text-zinc-900 text-lg">{opt.name}</h4>
                        {opt.required ? (
                          <span className="bg-orange-50 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-lg">필수 선택</span>
                        ) : (
                          <span className="bg-zinc-100 text-zinc-500 text-xs font-bold px-2.5 py-1 rounded-lg">선택 (추가)</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {opt.choices.map((choice, cIdx) => {
                          const isSelected = selectedOptions[opt.name] === choice.name
                          return (
                            <button
                              key={cIdx}
                              data-testid={`option-choice-${choice.name}`}
                              onClick={() => handleOptionSelect(opt.name, choice.name, opt.required)}
                              className={`w-full flex justify-between items-center p-4 rounded-xl border-2 transition-all ${isSelected ? 'border-orange-500 bg-orange-50/50' : 'border-zinc-100 hover:border-zinc-200'}`}
                            >
                              <span className={`font-bold ${isSelected ? 'text-orange-700' : 'text-zinc-700'}`}>{choice.name}</span>
                              <span className={`text-sm ${isSelected ? 'text-orange-600 font-bold' : 'text-zinc-400 font-medium'}`}>
                                {choice.price > 0 ? `+₩${choice.price.toLocaleString()}` : '추가금 없음'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-100 flex items-center justify-between">
                    <span className="font-bold text-zinc-900">수량 선택</span>
                    <div className="flex items-center gap-4 bg-zinc-50 rounded-full p-1 border border-zinc-200">
                      <button onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-600 shadow-sm hover:bg-zinc-100"><Minus className="w-4 h-4" /></button>
                      <span className="text-lg font-black w-6 text-center text-zinc-900">{itemQuantity}</span>
                      <button onClick={() => setItemQuantity(itemQuantity + 1)} className="w-10 h-10 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-sm hover:bg-zinc-800"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-6 bg-white border-t border-zinc-100 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-10 pb-safe">
                  <button onClick={addToCart} className="w-full bg-orange-500 text-white py-4 sm:py-5 rounded-2xl font-black text-lg hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 flex justify-center items-center gap-2 active:scale-[0.98]">
                    <ShoppingBag className="w-5 h-5" /> {((selectedItem.price + (selectedItem.options ?? []).reduce((sum, opt) => {
                      const chosen = selectedOptions[opt.name]
                      if (!chosen) return sum
                      const choiceObj = opt.choices.find((c) => c.name === chosen)
                      return sum + (choiceObj?.price ?? 0)
                    }, 0)) * itemQuantity).toLocaleString()}원 담기
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Cart Drawer */}
        <AnimatePresence>
          {isCartOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCartOpen(false)} className="absolute inset-0 bg-black/60 z-30 backdrop-blur-sm" />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-40 max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-6 flex justify-between items-center bg-white sticky top-0 z-10 border-b border-zinc-100">
                  <div>
                    <h2 className="font-extrabold text-2xl text-zinc-900">장바구니</h2>
                    <p className="text-sm text-zinc-500 mt-1 font-medium">선택하신 메뉴를 확인해주세요.</p>
                  </div>
                  <button onClick={() => setIsCartOpen(false)} className="bg-zinc-100 hover:bg-zinc-200 p-3 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-600" /></button>
                </div>

                <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4 bg-zinc-50/50">
                  {cart.map((item) => (
                    <div key={item.cartId} className="flex justify-between items-start bg-white p-4 rounded-2xl border border-zinc-100 shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                      <div className="flex gap-4">
                        {renderMenuImage(item, "w-20 h-20 rounded-xl object-cover bg-zinc-100")}
                        <div className="py-1">
                          <h4 className="font-bold text-zinc-900 text-base mb-1">{item.name}</h4>
                          {item.options.length > 0 && (
                            <ul className="text-[11px] text-zinc-500 mb-2 space-y-0.5">
                              {item.options.map((opt, i) => <li key={i}>• {opt}</li>)}
                            </ul>
                          )}
                          <p className="text-orange-600 font-black text-sm">₩{(item.price * item.qty).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between h-20">
                        <button onClick={() => updateCartItemQuantity(item.cartId, -item.qty)} className="text-zinc-300 hover:text-red-500 p-1 transition-colors"><X className="w-4 h-4" /></button>
                        <div className="flex items-center gap-3 bg-zinc-50 rounded-full p-1 border border-zinc-200">
                          <button onClick={() => updateCartItemQuantity(item.cartId, -1)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-zinc-600 shadow-sm"><Minus className="w-4 h-4" /></button>
                          <span className="text-sm font-bold w-4 text-center text-zinc-900">{item.qty}</span>
                          <button onClick={() => updateCartItemQuantity(item.cartId, 1)} className="w-10 h-10 bg-zinc-900 text-white rounded-full flex items-center justify-center shadow-sm"><Plus className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-6 bg-white border-t border-zinc-100 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] pb-safe">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-zinc-500 font-bold text-lg">총 주문금액</span>
                    <span className="text-3xl font-black text-zinc-900 tracking-tight">₩{totalPrice.toLocaleString()}</span>
                  </div>
                  <button onClick={() => setShowOrderConfirm(true)} disabled={isSubmitting} className="w-full bg-orange-500 text-white py-5 rounded-2xl font-black text-lg hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 flex justify-center items-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSubmitting ? (
                      <><span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" /> 주문 처리중...</>
                    ) : (
                      <><ShoppingBag className="w-6 h-6" /> 주문하기</>
                    )}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Event Modal */}
        <AnimatePresence>
          {isEventOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsEventOpen(false)} className="absolute inset-0 bg-black/60 z-50 backdrop-blur-sm" />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-50 flex flex-col shadow-2xl overflow-hidden">
                <div className="p-8 bg-gradient-to-br from-orange-500 to-pink-500 text-white relative">
                  <button onClick={() => setIsEventOpen(false)} className="absolute top-6 right-6 text-white/80 hover:text-white bg-black/10 p-2.5 rounded-full backdrop-blur-sm transition-colors"><X className="w-5 h-5" /></button>
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md mb-5 shadow-inner"><Gift className="w-7 h-7 text-white" /></div>
                  <h2 className="font-extrabold text-2xl tracking-tight mb-2">영수증 리뷰 작성하고<br/>시원한 커피 한 잔!</h2>
                  <p className="text-white/90 text-sm leading-relaxed">사진과 함께 예쁜 리뷰를 남겨주시면<br/>현장에서 즉시 <b>아메리카노 1잔</b>을 드립니다.</p>
                </div>
                <div className="p-6 bg-white space-y-3 pb-safe">
                  <div className="flex gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-100 shadow-sm">
                    <div className="w-7 h-7 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-sm shrink-0">1</div>
                    <p className="text-sm text-zinc-700 font-bold pt-1">하단 버튼을 눌러 직원에게 영수증을 먼저 요청해주세요.</p>
                  </div>
                  <div className="flex gap-4 p-5 bg-zinc-50 rounded-2xl border border-zinc-100 shadow-sm">
                    <div className="w-7 h-7 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-sm shrink-0">2</div>
                    <p className="text-sm text-zinc-700 font-bold pt-1">네이버 마이플레이스에 영수증을 인증하고 리뷰를 작성합니다.</p>
                  </div>
                  <button onClick={() => { setIsEventOpen(false); toast.info('직원에게 영수증을 요청해 주세요.') }} className="w-full bg-zinc-900 text-white py-5 rounded-2xl font-bold mt-4 hover:bg-zinc-800 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-center gap-2 active:scale-[0.98]">
                    <Receipt className="w-5 h-5" /> 확인
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Order History Modal */}
        <AnimatePresence>
          {isOrderHistoryOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOrderHistoryOpen(false)} className="absolute inset-0 bg-black/60 z-50 backdrop-blur-sm" />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute bottom-0 left-0 right-0 bg-zinc-50 rounded-t-[32px] z-50 max-h-[90vh] flex flex-col shadow-2xl pb-safe">
                <div className="p-6 flex justify-between items-center bg-white sticky top-0 rounded-t-[32px] z-10 border-b border-zinc-100">
                  <div>
                    <h2 className="font-extrabold text-2xl text-zinc-900 mb-1">주문 내역</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-500 font-medium">총 주문금액</span>
                      <span className="text-lg font-black text-orange-600">₩{orderHistory.reduce((sum, o) => sum + o.total, 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <button onClick={() => setIsOrderHistoryOpen(false)} className="bg-zinc-100 hover:bg-zinc-200 p-2.5 rounded-full transition-colors"><X className="w-5 h-5 text-zinc-600" /></button>
                </div>
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                  {orderHistory.length === 0 ? (
                    <div className="text-center py-20 flex flex-col items-center justify-center">
                      <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-5"><Receipt className="w-10 h-10 text-zinc-300" /></div>
                      <h3 className="font-bold text-zinc-900 text-lg mb-1">주문 내역이 없습니다</h3>
                      <p className="text-zinc-500 text-sm font-medium">맛있는 메뉴를 먼저 주문해주세요.</p>
                    </div>
                  ) : (
                    orderHistory.map((order) => (
                      <div key={order.id} className="bg-white p-5 rounded-3xl border border-zinc-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
                        <div className="flex justify-between items-center mb-4 border-b border-zinc-100 pb-4">
                          <div>
                            <span className="text-xs font-bold text-zinc-400 mb-0.5 block">{order.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <h4 className="font-black text-zinc-900 text-lg">{order.id}</h4>
                          </div>
                          <span className="bg-orange-50 text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-orange-100"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>{order.status}</span>
                        </div>
                        <ul className="space-y-3 mb-5">
                          {order.items.map((item, idx) => (
                            <li key={idx} className="text-sm">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-zinc-900 font-bold">{item.name} <span className="text-orange-500 ml-1.5 font-black">{item.qty}개</span></span>
                                <span className="text-zinc-900 font-bold tracking-tight">₩{(item.price * item.qty).toLocaleString()}</span>
                              </div>
                              {item.options && item.options.length > 0 && (
                                <p className="text-xs text-zinc-400 font-medium leading-relaxed">• {item.options.join(', ')}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                        <div className="flex justify-between items-center pt-4 border-t border-dashed border-zinc-200">
                          <span className="font-bold text-zinc-500">총 주문금액</span>
                          <span className="font-black text-xl text-orange-600 tracking-tight">₩{order.total.toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Order Confirmation Dialog */}
        <AnimatePresence>
          {showOrderConfirm && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowOrderConfirm(false)} className="absolute inset-0 bg-black/60 z-50 backdrop-blur-sm flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-white rounded-[28px] w-full max-w-sm overflow-hidden shadow-2xl">
                  <div className="p-6 text-center">
                    <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShoppingBag className="w-7 h-7 text-orange-500" />
                    </div>
                    <h3 className="text-xl font-extrabold text-zinc-900 mb-4">주문을 확인해주세요</h3>
                    <div className="bg-zinc-50 rounded-2xl p-4 mb-4 text-left space-y-2 border border-zinc-100">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 font-medium">테이블</span>
                        <span className="font-bold text-zinc-900">{tableDisplayName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 font-medium">총 수량</span>
                        <span className="font-bold text-zinc-900">{totalItems}개</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-zinc-200">
                        <span className="text-zinc-500 font-bold">총 금액</span>
                        <span className="font-black text-orange-600">₩{totalPrice.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-500 mb-6">주문하시겠습니까?</p>
                    <div className="flex gap-3">
                      <button onClick={() => setShowOrderConfirm(false)} className="flex-1 py-3.5 rounded-xl font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors">
                        취소
                      </button>
                      <button onClick={() => { setShowOrderConfirm(false); handleOrder() }} disabled={isSubmitting} className="flex-1 py-3.5 rounded-xl font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 disabled:opacity-50">
                        확인
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
