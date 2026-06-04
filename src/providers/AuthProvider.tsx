'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StoreUser } from '@/types/auth'
import { isStoreSubscriptionActive } from '@/lib/utils/subscription'

interface AuthContextValue {
  user: StoreUser | null
  loading: boolean
  isFirstLogin: boolean
  signInWithEmail: (email: string, password: string) => Promise<import('@supabase/supabase-js').User | null>
  signOut: () => Promise<void>
  refreshStoreUser: (authUser?: import('@supabase/supabase-js').User | null) => Promise<(StoreUser & { isFirstLogin: boolean }) | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface StoreUserWithFirstLogin extends StoreUser {
  isFirstLogin: boolean
}

export function NextAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoreUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFirstLogin, setIsFirstLogin] = useState(false)
  const [supabase] = useState(() => createClient())

  const fetchStoreUser = useCallback(async (supabaseUserId: string, email: string, appMetadata?: Record<string, unknown>): Promise<StoreUserWithFirstLogin | null> => {
    // super_admin은 매장 소속 없이 바로 통과
    if (appMetadata?.role === 'super_admin') {
      setIsFirstLogin(false)
      return {
        id: supabaseUserId,
        email,
        isFirstLogin: false,
        role: 'owner' as StoreUser['role'],
        storeId: '',
        storeName: 'SuperAdmin',
      }
    }

    const { data, error } = await supabase
      .from('store_members')
      .select('role, store_id, is_first_login, is_active, stores(name, is_active, subscription_end)')
      .eq('user_id', supabaseUserId)
      .eq('is_active', true)
      .limit(2)

    if (error || !data || data.length !== 1) return null

    const row = data[0] as unknown as {
      role: string
      store_id: string
      is_first_login: boolean | null
      is_active: boolean | null
      stores: { name?: string; is_active: boolean; subscription_end: string | null } | null
    }

    if (row.is_active === false || !isStoreSubscriptionActive(row.stores)) return null

    const storeUserFirstLogin = row.is_first_login ?? false
    setIsFirstLogin(storeUserFirstLogin)

    return {
      id: supabaseUserId,
      email,
      isFirstLogin: storeUserFirstLogin,
      role: row.role as StoreUser['role'],
      storeId: row.store_id,
      storeName: row.stores?.name ?? '',
    }
  }, [supabase])

  const refreshStoreUser = useCallback(async (authUser?: import('@supabase/supabase-js').User | null) => {
    setLoading(true)
    const user = authUser !== undefined ? authUser : (await supabase.auth.getUser()).data.user
    if (user) {
      const storeUser = await fetchStoreUser(user.id, user.email ?? '', user.app_metadata)
      setUser(storeUser)
      setLoading(false)
      return storeUser
    }
    setUser(null)
    setIsFirstLogin(false)
    setLoading(false)
    return null
  }, [supabase, fetchStoreUser])

  useEffect(() => {
    refreshStoreUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === 'TOKEN_REFRESHED') {
        // 토큰 갱신 시 사용자 상태도 동기화 (역할 변경 등 반영)
        if (session?.user) {
          const storeUser = await fetchStoreUser(session.user.id, session.user.email ?? '', session.user.app_metadata)
          setUser(storeUser)
        }
        setLoading(false)
        return
      }
      if (_event === 'USER_UPDATED') {
        setLoading(false)
        return
      }
      // SIGNED_IN: 로그인 페이지에서 refreshStoreUser를 직접 호출하므로 중복 쿼리 방지
      if (_event === 'SIGNED_IN') {
        setLoading(false)
        return
      }
      if (session?.user) {
        const storeUser = await fetchStoreUser(session.user.id, session.user.email ?? '', session.user.app_metadata)
        setUser(storeUser)
      } else {
        setUser(null)
        setIsFirstLogin(false)
      }
      setLoading(false)
    })

    // 탭이 백그라운드에서 돌아올 때 세션 갱신 (POS 장시간 사용 대응)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // getUser()는 네트워크 요청 → 로그인 요청과 충돌 가능. getSession()으로 로컬 읽기
        supabase.auth.getSession().then(({ data: { session } }) => {
          const authUser = session?.user
          if (authUser) {
            fetchStoreUser(authUser.id, authUser.email ?? '', authUser.app_metadata).then((storeUser) => {
              if (storeUser) setUser(storeUser)
            })
          }
        }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [supabase, refreshStoreUser, fetchStoreUser])

  async function signInWithEmail(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data.user
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, isFirstLogin, signInWithEmail, signOut, refreshStoreUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside NextAuthProvider')
  return ctx
}
