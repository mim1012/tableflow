'use client'

export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Utensils, Mail, Lock, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'
import { useAuth } from '@/providers/AuthProvider'

export default function LoginPage() {
  const router = useRouter()
  const { signInWithEmail, refreshStoreUser } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)
  const [failCount, setFailCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const stored = sessionStorage.getItem('login_fail_count')
    return stored ? parseInt(stored, 10) : 0
  })
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = sessionStorage.getItem('login_lockout_until')
    if (!stored) return null
    const val = parseInt(stored, 10)
    return val > Date.now() ? val : null
  })
  const [countdown, setCountdown] = useState(0)

  function getLockoutDuration(failures: number): number {
    if (failures >= 10) return 60
    if (failures >= 5) return 15
    if (failures >= 3) return 5
    return 0
  }

  useEffect(() => {
    if (!lockoutUntil) return
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockoutUntil(null)
        setCountdown(0)
        sessionStorage.removeItem('login_lockout_until')
      } else {
        setCountdown(remaining)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockoutUntil])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const newErrors: { email?: string; password?: string } = {}
    if (!email.trim()) newErrors.email = '이메일을 입력하세요.'
    if (!password) newErrors.password = '비밀번호를 입력하세요.'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    setErrors({})

    if (lockoutUntil && Date.now() < lockoutUntil) {
      toast.error(`${countdown}초 후에 다시 시도해주세요.`)
      return
    }

    setLoading(true)

    try {
      const loginTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15_000)
      )
      const authUser = await Promise.race([signInWithEmail(email.trim(), password), loginTimeout])
      const refreshedUser = await refreshStoreUser(authUser)
      setFailCount(0)
      sessionStorage.removeItem('login_fail_count')
      sessionStorage.removeItem('login_lockout_until')

      if (refreshedUser?.isFirstLogin) {
        router.replace('/change-password')
        return
      }

      const isSuperAdmin = authUser?.app_metadata?.role === 'super_admin'
      router.replace(isSuperAdmin ? '/superadmin' : '/admin')
    } catch (err: unknown) {
      const newCount = failCount + 1
      setFailCount(newCount)
      sessionStorage.setItem('login_fail_count', String(newCount))
      const duration = getLockoutDuration(newCount)
      if (duration > 0) {
        const until = Date.now() + duration * 1000
        setLockoutUntil(until)
        sessionStorage.setItem('login_lockout_until', String(until))
      }
      console.error('Login failed:', err)
      const isTimeout = err instanceof Error && err.message === 'TIMEOUT'
      toast.error(isTimeout
        ? '서버 응답이 없습니다. 잠시 후 다시 시도해주세요.'
        : '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-zinc-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-zinc-900">TableFlow</span>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
          <h1 className="text-lg font-semibold text-zinc-900 mb-5 text-center">로그인</h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600" htmlFor="email">
                이메일
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="staff@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600" htmlFor="password">
                비밀번호
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            <Button
              type="submit"
              disabled={loading || (lockoutUntil !== null && Date.now() < lockoutUntil)}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white mt-1"
            >
              <LogIn className="w-4 h-4" />
              {loading ? '로그인 중...' : lockoutUntil !== null && countdown > 0 ? `${countdown}초 후 재시도` : '로그인'}
            </Button>
          </form>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 mb-2">Dev Quick Login</p>
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'Superadmin', email: 'dksk0359@gmail.com', pw: 'TestAdmin1234!' },
                { label: 'Owner (강남지점)', email: 'owner@flow.com', pw: 'Test1234!!' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="text-left text-xs bg-white border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 transition-colors"
                  onClick={() => { setEmail(preset.email); setPassword(preset.pw) }}
                >
                  <span className="font-semibold text-amber-800">{preset.label}</span>
                  <span className="text-amber-600 ml-2">{preset.email}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-amber-500 mt-2">클릭하면 자동 입력됩니다. 로그인 버튼을 눌러주세요.</p>
          </div>
        )}

        <p className="text-center text-xs text-zinc-400 mt-6">
          &copy; {new Date().getFullYear()} TableFlow. All rights reserved.
        </p>
      </div>
    </div>
  )
}
