'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Building2, Plus, Pencil, LogOut, Utensils, RefreshCw, Copy, KeyRound, Users, Info, CreditCard, UtensilsCrossed, Search } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/tabs'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Badge } from '@/app/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table'
import { Switch } from '@/app/components/ui/switch'
import { useAuth } from '@/providers/AuthProvider'
import { createClient } from '@/lib/supabase/client'
import type { StoreRow, MenuCategoryRow, MenuItemRow } from '@/types/database'
import { getKstDateString } from '@/lib/utils/subscription'


const PASSWORD_MIN_LENGTH = 8
const PASSWORD_REGEX = /^(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/

function generateSlug(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function randomIndex(max: number): number {
  if (max <= 0) throw new RangeError('randomIndex: max must be > 0')
  const limit = Math.floor(256 / max) * max
  let v: number
  do { v = crypto.getRandomValues(new Uint8Array(1))[0] } while (v >= limit)
  return v % max
}

function generateTempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const specials = '!@#$%&*'
  const password = Array.from({ length: 7 }, () => chars[randomIndex(chars.length)]).join('')
  const special = specials[randomIndex(specials.length)]
  const insertAt = randomIndex(password.length + 1)
  return password.slice(0, insertAt) + special + password.slice(insertAt)
}

function getStoreStatus(store: StoreRow): 'active' | 'expired' | 'inactive' {
  if (!store.is_active) return 'inactive'
  if (!store.subscription_end) return 'active'
  return store.subscription_end >= getKstDateString() ? 'active' : 'expired'
}

const STATUS_LABEL: Record<string, string> = {
  active: '활성',
  expired: '만료',
  inactive: '정지',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  expired: 'secondary',
  inactive: 'destructive',
}

// ============================================================
// Inline Edge Function helpers
// ============================================================

const EDGE_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('세션이 만료되었습니다.')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': ANON_KEY,
  }
}

async function callSuperadmin<T>(action: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const url = `${EDGE_FUNCTION_URL}/superadmin?action=${action}`
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new Error(`서버 응답 오류 (HTTP ${res.status})`)
  }
  const j = json as Record<string, unknown>
  if (!res.ok) throw new Error((j.error ?? j.message ?? `요청 실패 (${res.status})`) as string)
  return json as T
}

interface CreateStoreWithOwnerParams {
  name: string
  slug: string
  address?: string
  phone?: string
  subscriptionStart?: string
  subscriptionEnd?: string
  ownerEmail: string
  ownerPassword: string
}

async function getAllStores(): Promise<StoreRow[]> {
  return callSuperadmin<StoreRow[]>('list-stores')
}

async function updateStoreSubscription(params: {
  storeId: string
  subscriptionStart: string | null
  subscriptionEnd: string | null
  isActive: boolean
}): Promise<void> {
  await callSuperadmin('update-subscription', params)
}

async function createStoreWithOwner(params: CreateStoreWithOwnerParams): Promise<StoreRow> {
  const headers = await getAuthHeaders()
  const url = `${EDGE_FUNCTION_URL}/create-store-with-owner`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  })
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new Error(`서버 응답 오류 (HTTP ${res.status})`)
  }
  const j = json as Record<string, unknown>
  if (!res.ok) throw new Error((j.error ?? j.message ?? `요청 실패 (${res.status})`) as string)
  return (j.store ?? json) as StoreRow
}

async function updateStoreInfo(storeId: string, data: { name?: string; address?: string; phone?: string }): Promise<StoreRow> {
  return callSuperadmin<StoreRow>('update-store-info', { storeId, ...data })
}

async function resetUserPassword(userId: string): Promise<{ tempPassword: string }> {
  return callSuperadmin<{ tempPassword: string }>('reset-password', { userId })
}

interface StoreMember {
  userId: string
  email: string
  role: string
  isFirstLogin: boolean
}

async function getStoreMembers(storeId: string): Promise<StoreMember[]> {
  return callSuperadmin<StoreMember[]>(`list-store-members&storeId=${storeId}`)
}

async function getStoreMenuData(storeId: string): Promise<{ categories: MenuCategoryRow[]; items: MenuItemRow[] }> {
  return callSuperadmin<{ categories: MenuCategoryRow[]; items: MenuItemRow[] }>('get-store-menu', { storeId })
}

async function updateMenuItem(
  itemId: string,
  updates: { name?: string; price?: number; is_available?: boolean },
): Promise<MenuItemRow> {
  return callSuperadmin<MenuItemRow>('update-menu-item', { itemId, ...updates })
}

// ============================================================
// Inline editable cell
// ============================================================

interface InlineEditCellProps {
  value: string
  onSave: (newValue: string) => void
  type?: 'text' | 'number'
  className?: string
}

function InlineEditCell({ value, onSave, type = 'text', className = '' }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed === '' || trimmed === value) {
      setDraft(value)
      return
    }
    onSave(trimmed)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`text-left hover:bg-zinc-100 rounded px-1.5 py-0.5 cursor-pointer transition-colors ${className}`}
        onClick={() => setEditing(true)}
      >
        {type === 'number' ? `${Number(value).toLocaleString()}원` : value}
      </button>
    )
  }

  return (
    <Input
      ref={inputRef}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      className={`h-7 px-1.5 text-sm ${className}`}
    />
  )
}

// ============================================================
// Store menu dialog
// ============================================================

interface StoreMenuDialogProps {
  store: StoreRow | null
  onClose: () => void
}

function StoreMenuDialog({ store, onClose }: StoreMenuDialogProps) {
  const [categories, setCategories] = useState<MenuCategoryRow[]>([])
  const [items, setItems] = useState<MenuItemRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!store) return
    setLoading(true)
    getStoreMenuData(store.id)
      .then((data) => { setCategories(data.categories); setItems(data.items) })
      .catch((err: unknown) => {
        const e = err as { message?: string }
        toast.error(e?.message ?? '메뉴를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [store])

  async function handleUpdateItem(
    itemId: string,
    updates: { name?: string; price?: number; is_available?: boolean },
  ) {
    try {
      const updated = await updateMenuItem(itemId, updates)
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...updated } : it)))
      toast.success('메뉴가 수정되었습니다.')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? '메뉴 수정에 실패했습니다.')
    }
  }

  function itemsForCategory(categoryId: string): MenuItemRow[] {
    return items.filter((item) => item.category_id === categoryId)
  }

  return (
    <Dialog open={!!store} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{store?.name} — 메뉴 관리</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
            <UtensilsCrossed className="w-10 h-10 opacity-40" />
            <p className="text-sm">등록된 메뉴가 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 py-2">
            {categories.map((cat) => {
              const catItems = itemsForCategory(cat.id)
              if (catItems.length === 0) return null
              return (
                <div key={cat.id}>
                  <h3 className="text-sm font-semibold text-zinc-700 border-b border-zinc-200 pb-1 mb-3">
                    {cat.name}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {catItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2 hover:bg-zinc-50/60"
                      >
                        {item.image_url && (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-10 h-10 rounded-md object-cover shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <InlineEditCell
                            value={item.name}
                            onSave={(name) => handleUpdateItem(item.id, { name })}
                            className="font-medium text-zinc-900 text-sm"
                          />
                          <InlineEditCell
                            value={String(item.price)}
                            type="number"
                            onSave={(v) => handleUpdateItem(item.id, { price: Number(v) })}
                            className="text-zinc-600 text-sm shrink-0"
                          />
                          {item.badge && (
                            <Badge variant="outline" className="shrink-0 text-xs">
                              {item.badge}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-zinc-400">
                            {item.is_available ? '판매중' : '품절'}
                          </span>
                          <Switch
                            checked={item.is_available}
                            onCheckedChange={(checked) =>
                              handleUpdateItem(item.id, { is_available: checked })
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Store detail dialog (tabbed: info, subscription, members)
// ============================================================

interface StoreDetailDialogProps {
  store: StoreRow | null
  onClose: () => void
  onSaved: () => void
}

function StoreDetailDialog({ store, onClose, onSaved }: StoreDetailDialogProps) {
  const [dialogTab, setDialogTab] = useState('info')

  // --- Info tab state ---
  const [infoName, setInfoName] = useState('')
  const [infoAddress, setInfoAddress] = useState('')
  const [infoPhone, setInfoPhone] = useState('')
  const [infoLoading, setInfoLoading] = useState(false)

  // --- Subscription tab state ---
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [subLoading, setSubLoading] = useState(false)

  // --- Members tab state ---
  const [members, setMembers] = useState<StoreMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [resetConfirmUserId, setResetConfirmUserId] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)

  const loadMembers = useCallback(async (storeId: string) => {
    setMembersLoading(true)
    try {
      const data = await getStoreMembers(storeId)
      setMembers(data)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? '멤버 목록을 불러오지 못했습니다.')
    } finally {
      setMembersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (store) {
      setInfoName(store.name ?? '')
      setInfoAddress(store.address ?? '')
      setInfoPhone(store.phone ?? '')
      setStart(store.subscription_start?.slice(0, 10) ?? '')
      setEnd(store.subscription_end?.slice(0, 10) ?? '')
      setIsActive(store.is_active ?? true)
      setDialogTab('info')
      setGeneratedPassword(null)
      setResetConfirmUserId(null)
      loadMembers(store.id)
    }
  }, [store, loadMembers])

  // --- Info save ---
  async function handleInfoSave() {
    if (!store) return
    if (!infoName.trim()) {
      toast.error('매장명은 필수입니다.')
      return
    }
    setInfoLoading(true)
    try {
      await updateStoreInfo(store.id, {
        name: infoName.trim(),
        address: infoAddress.trim(),
        phone: infoPhone.trim(),
      })
      toast.success('매장 정보가 업데이트되었습니다.')
      onSaved()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? '저장에 실패했습니다.')
    } finally {
      setInfoLoading(false)
    }
  }

  // --- Subscription save ---
  async function handleSubSave() {
    if (!store) return
    if (!start || !end) {
      toast.error('이용 시작일과 종료일을 모두 입력하세요.')
      return
    }
    setSubLoading(true)
    try {
      await updateStoreSubscription({
        storeId: store.id,
        subscriptionStart: start,
        subscriptionEnd: end,
        isActive,
      })
      toast.success('이용기간이 업데이트되었습니다.')
      onSaved()
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? '저장에 실패했습니다.')
    } finally {
      setSubLoading(false)
    }
  }

  // --- Password reset ---
  async function handleResetPassword() {
    if (!resetConfirmUserId) return
    setResetLoading(true)
    try {
      const { tempPassword } = await resetUserPassword(resetConfirmUserId)
      setGeneratedPassword(tempPassword)
      setResetConfirmUserId(null)
      toast.success('비밀번호가 초기화되었습니다.')
      if (store) loadMembers(store.id)
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? '비밀번호 초기화에 실패했습니다.')
    } finally {
      setResetLoading(false)
    }
  }

  const ROLE_LABEL: Record<string, string> = {
    owner: '점주',
    manager: '매니저',
    staff: '직원',
  }

  return (
    <>
      <Dialog open={!!store} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>매장 상세 — {store?.name}</DialogTitle>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={setDialogTab}>
            <TabsList className="w-full">
              <TabsTrigger value="info" className="gap-1 flex-1">
                <Info className="w-3.5 h-3.5" />
                기본 정보
              </TabsTrigger>
              <TabsTrigger value="subscription" className="gap-1 flex-1">
                <CreditCard className="w-3.5 h-3.5" />
                구독
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1 flex-1">
                <Users className="w-3.5 h-3.5" />
                멤버
              </TabsTrigger>
            </TabsList>

            {/* Info tab */}
            <TabsContent value="info">
              <div className="flex flex-col gap-3 py-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-600">매장명 *</label>
                  <Input value={infoName} onChange={(e) => setInfoName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-600">주소</label>
                  <Input value={infoAddress} onChange={(e) => setInfoAddress(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-600">전화번호</label>
                  <Input value={infoPhone} onChange={(e) => setInfoPhone(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={infoLoading}>취소</Button>
                <Button
                  onClick={handleInfoSave}
                  disabled={infoLoading}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {infoLoading ? '저장 중...' : '저장'}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* Subscription tab */}
            <TabsContent value="subscription">
              <div className="flex flex-col gap-3 py-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-600">이용 시작일</label>
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-zinc-600">이용 종료일</label>
                  <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="is_active"
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <label htmlFor="is_active" className="text-sm text-zinc-700">활성 상태</label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={subLoading}>취소</Button>
                <Button
                  onClick={handleSubSave}
                  disabled={subLoading}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {subLoading ? '저장 중...' : '저장'}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* Members tab */}
            <TabsContent value="members">
              <div className="flex flex-col gap-3 py-2">
                {/* Generated password display */}
                {generatedPassword && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-orange-700">임시 비밀번호가 생성되었습니다</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono bg-white px-2 py-1 rounded border border-orange-200">
                        {generatedPassword}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 px-2"
                        title="복사"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(generatedPassword)
                            toast.success('임시 비밀번호가 복사되었습니다.')
                          } catch {
                            toast.error('클립보드 복사에 실패했습니다.')
                          }
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-orange-600">이 비밀번호는 다시 확인할 수 없습니다. 지금 복사하세요.</p>
                  </div>
                )}

                {membersLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-zinc-400 text-center py-6">멤버가 없습니다.</p>
                ) : (
                  <div className="rounded-lg border border-zinc-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-zinc-50">
                          <TableHead className="text-xs font-semibold text-zinc-700">이메일</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-700">역할</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-700">상태</TableHead>
                          <TableHead className="text-xs font-semibold text-zinc-700 w-24">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.userId}>
                            <TableCell className="text-sm text-zinc-900">{member.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{ROLE_LABEL[member.role] ?? member.role}</Badge>
                            </TableCell>
                            <TableCell>
                              {member.isFirstLogin ? (
                                <Badge variant="secondary">첫 로그인 대기</Badge>
                              ) : (
                                <Badge variant="default">활성</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 gap-1 text-zinc-600 hover:text-orange-600 text-xs"
                                onClick={() => setResetConfirmUserId(member.userId)}
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                비밀번호 초기화
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Password reset confirmation dialog */}
      <Dialog open={!!resetConfirmUserId} onOpenChange={(open) => { if (!open) setResetConfirmUserId(null) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>비밀번호 초기화</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 py-2">
            <strong>{members.find((m) => m.userId === resetConfirmUserId)?.email}</strong>의 비밀번호를 임시 비밀번호로 초기화하시겠습니까?
            <br />
            사용자는 다음 로그인 시 비밀번호를 변경해야 합니다.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetConfirmUserId(null)} disabled={resetLoading}>취소</Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetLoading}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {resetLoading ? '초기화 중...' : '초기화'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// Store list tab
// ============================================================

interface StoreListTabProps {
  stores: StoreRow[]
  loading: boolean
  onEdit: (store: StoreRow) => void
  onMenuView: (store: StoreRow) => void
  onAddClick: () => void
}

function StoreListTab({ stores, loading, onEdit, onMenuView, onAddClick }: StoreListTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const filteredStores = useMemo(() => {
    if (!normalizedSearchQuery) return stores
    return stores.filter((store) => store.name.toLowerCase().includes(normalizedSearchQuery))
  }, [stores, normalizedSearchQuery])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">전체 매장 ({stores.length})</h2>
          {normalizedSearchQuery && (
            <p className="text-xs text-zinc-500 mt-0.5">검색 결과 {filteredStores.length}개</p>
          )}
        </div>
        <Button
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
          onClick={onAddClick}
        >
          <Plus className="w-4 h-4" />
          매장 추가
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="매장명 검색"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
          <Building2 className="w-10 h-10 opacity-40" />
          <p className="text-sm">등록된 매장이 없습니다.</p>
        </div>
      ) : filteredStores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
          <Search className="w-10 h-10 opacity-40" />
          <p className="text-sm">검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50">
                <TableHead className="font-semibold text-zinc-700">매장명</TableHead>
                <TableHead className="font-semibold text-zinc-700">Slug</TableHead>
                <TableHead className="font-semibold text-zinc-700">이용기간</TableHead>
                <TableHead className="font-semibold text-zinc-700">상태</TableHead>
                <TableHead className="font-semibold text-zinc-700 w-36">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStores.map((store) => {
                const status = getStoreStatus(store)
                return (
                  <TableRow key={store.id} className="hover:bg-zinc-50/60">
                    <TableCell className="font-medium text-zinc-900">{store.name}</TableCell>
                    <TableCell className="text-zinc-500 font-mono text-sm">{store.slug}</TableCell>
                    <TableCell className="text-zinc-600 text-sm">
                      {store.subscription_start && store.subscription_end
                        ? `${store.subscription_start.slice(0, 10)} ~ ${store.subscription_end.slice(0, 10)}`
                        : <span className="text-zinc-400">미설정</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[status]}>
                        {STATUS_LABEL[status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 gap-1 text-zinc-600 hover:text-orange-600"
                          onClick={() => window.open(`/admin?storeId=${store.id}`, '_blank')}
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          관리자
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 gap-1 text-zinc-600 hover:text-orange-600"
                          onClick={() => onMenuView(store)}
                        >
                          <UtensilsCrossed className="w-3.5 h-3.5" />
                          메뉴
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 gap-1 text-zinc-600 hover:text-orange-600"
                          onClick={() => onEdit(store)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          수정
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Add store tab
// ============================================================

interface AddStoreTabProps {
  onCreated: () => void
  onTabChange: (tab: string) => void
}

interface AddStoreForm {
  name: string
  address: string
  phone: string
  subscriptionStart: string
  subscriptionEnd: string
  ownerEmail: string
  ownerPassword: string
}

function AddStoreTab({ onCreated, onTabChange }: AddStoreTabProps) {
  const [form, setForm] = useState<AddStoreForm>(() => ({
    name: '',
    address: '',
    phone: '',
    subscriptionStart: '',
    subscriptionEnd: '',
    ownerEmail: '',
    ownerPassword: generateTempPassword(),
  }))
  const [loading, setLoading] = useState(false)

  function handleChange(field: keyof AddStoreForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const slug = generateSlug()

    if (!form.name) {
      toast.error('매장명은 필수입니다.')
      return
    }

    if (form.ownerPassword.length < PASSWORD_MIN_LENGTH) {
      toast.error('비밀번호는 최소 8자 이상이어야 합니다.')
      return
    }

    if (!PASSWORD_REGEX.test(form.ownerPassword)) {
      toast.error('임시 비밀번호는 특수문자를 1개 이상 포함해야 합니다.')
      return
    }

    if (form.subscriptionStart && form.subscriptionEnd && form.subscriptionEnd < form.subscriptionStart) {
      toast.error('이용 종료일은 시작일보다 빠를 수 없습니다.')
      return
    }

    if (!form.ownerEmail || !form.ownerPassword) {
      toast.error('점주 이메일과 임시 비밀번호를 입력하세요.')
      return
    }
    setLoading(true)
    try {
      await createStoreWithOwner({
        name: form.name,
        slug,
        address: form.address || undefined,
        phone: form.phone || undefined,
        subscriptionStart: form.subscriptionStart || undefined,
        subscriptionEnd: form.subscriptionEnd || undefined,
        ownerEmail: form.ownerEmail,
        ownerPassword: form.ownerPassword,
      })

      toast.success(`'${form.name}' 매장이 생성되었습니다.`)
      setForm({
        name: '', address: '', phone: '',
        subscriptionStart: '', subscriptionEnd: '',
        ownerEmail: '', ownerPassword: generateTempPassword(),
      })
      onCreated()
      onTabChange('stores')
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? '매장 생성에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-base font-semibold text-zinc-900 mb-5">새 매장 추가</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Store info */}
        <div className="rounded-xl border border-zinc-200 p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">매장 정보</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">매장명 *</label>
            <Input
              placeholder="예) 맛있는 식당"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">주소</label>
            <Input
              placeholder="예) 서울특별시 강남구 ..."
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">전화번호</label>
            <Input
              placeholder="예) 02-1234-5678"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </div>
        </div>

        {/* Subscription */}
        <div className="rounded-xl border border-zinc-200 p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">이용기간</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">시작일</label>
              <Input
                type="date"
                value={form.subscriptionStart}
                onChange={(e) => handleChange('subscriptionStart', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">만료일</label>
              <Input
                type="date"
                value={form.subscriptionEnd}
                onChange={(e) => handleChange('subscriptionEnd', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Owner account */}
        <div className="rounded-xl border border-zinc-200 p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">점주 계정</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">점주 이메일 *</label>
            <Input
              type="email"
              placeholder="owner@example.com"
              value={form.ownerEmail}
              onChange={(e) => handleChange('ownerEmail', e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600">임시 비밀번호 *</label>
            <div className="flex gap-1.5">
              <Input
                type="text"
                placeholder="8자 이상"
                value={form.ownerPassword}
                onChange={(e) => handleChange('ownerPassword', e.target.value)}
                className="font-mono text-sm"
                autoComplete="off"
                autoCorrect="off"
                required
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 px-2"
                title="새로 생성"
                onClick={() => handleChange('ownerPassword', generateTempPassword())}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 px-2"
                title="복사"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(form.ownerPassword)
                    toast.success('임시 비밀번호가 복사되었습니다.')
                  } catch {
                    toast.error('클립보드 복사에 실패했습니다.')
                  }
                }}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-zinc-400">자동 생성됨 · 첫 로그인 시 변경 필요</p>
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 text-white w-full"
        >
          {loading ? '생성 중...' : '매장 생성'}
        </Button>
      </form>
    </div>
  )
}

// ============================================================
// SuperAdmin page
// ============================================================

export default function SuperAdminPage() {
  const { user, signOut } = useAuth()
  const [stores, setStores] = useState<StoreRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [editingStore, setEditingStore] = useState<StoreRow | null>(null)
  const [menuViewStore, setMenuViewStore] = useState<StoreRow | null>(null)
  const [activeTab, setActiveTab] = useState('stores')

  async function loadStores() {
    setListLoading(true)
    try {
      const data = await getAllStores()
      setStores(data as StoreRow[])
    } catch (err: unknown) {
      const e = err as { message?: string }
      toast.error(e?.message ?? '매장 목록을 불러오지 못했습니다.')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    loadStores()
  }, [])

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-sm">
            <Utensils className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-base font-bold text-zinc-900">TableFlow</span>
            <span className="ml-2 text-xs text-orange-500 font-semibold bg-orange-50 px-1.5 py-0.5 rounded">
              SuperAdmin
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500 hidden sm:block">{user?.email}</span>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-zinc-600"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="stores" className="gap-1.5">
              <Building2 className="w-4 h-4" />
              매장 목록
            </TabsTrigger>
            <TabsTrigger value="add" className="gap-1.5">
              <Plus className="w-4 h-4" />
              매장 추가
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stores">
            <StoreListTab
              stores={stores}
              loading={listLoading}
              onEdit={setEditingStore}
              onMenuView={setMenuViewStore}
              onAddClick={() => setActiveTab('add')}
            />
          </TabsContent>

          <TabsContent value="add">
            <AddStoreTab
              onCreated={loadStores}
              onTabChange={setActiveTab}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Store detail dialog */}
      <StoreDetailDialog
        store={editingStore}
        onClose={() => setEditingStore(null)}
        onSaved={loadStores}
      />

      {/* Store menu dialog */}
      <StoreMenuDialog
        store={menuViewStore}
        onClose={() => setMenuViewStore(null)}
      />
    </div>
  )
}
