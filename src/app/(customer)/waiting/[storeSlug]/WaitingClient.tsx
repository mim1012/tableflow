'use client'

import React, { useState, useEffect } from 'react'
import { ChevronLeft, Users, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { createClient } from '@/lib/supabase/client'
import { createWaitingAction } from '@/app/actions/waiting'
import type { StoreRow, WaitingStatus } from '@/types/database'

async function createWaiting(params: { storeId: string; phone: string; partySize: number }) {
  return createWaitingAction(params.storeId, params.phone, params.partySize)
}

async function getWaitingStatus(storeId: string, waitingId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const { data, error } = await supabase
    .from('waitings_public')
    .select('id, queue_number')
    .eq('store_id', storeId)
    .eq('status', 'waiting')
    .order('queue_number', { ascending: true })
  if (error) throw new Error(error.message)
  const list = (data ?? []) as Array<{ id: string; queue_number: number }>
  const myIndex = list.findIndex((w) => w.id === waitingId)
  const myPosition = myIndex >= 0 ? myIndex : list.length
  return { myPosition, totalWaiting: list.length }
}

interface Props {
  store: StoreRow
}

export default function WaitingClient({ store }: Props) {
  const storeSlug = store.slug
  const storeId = store.id
  const storageKey = `waiting:${storeSlug}`

  const readSaved = () => {
    if (typeof window === 'undefined') return null
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null
    try {
      return JSON.parse(raw) as {
        phone?: string
        pax?: number
        queueNumber?: number
        waitingId?: string
        waitingCount?: number
        step?: number
      }
    } catch {
      sessionStorage.removeItem(storageKey)
      return null
    }
  }

  // 서버/클라이언트 동일한 초기값으로 hydration mismatch 방지
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('010')
  const [pax, setPax] = useState(2)
  const [queueNumber, setQueueNumber] = useState(0)
  const [waitingId, setWaitingId] = useState('')
  const [waitingCount, setWaitingCount] = useState(0)

  // hydration 완료 후 sessionStorage에서 복원
  useEffect(() => {
    const saved = readSaved()
    if (!saved) return
    if (saved.step === 2 || saved.step === 3) setStep(saved.step)
    if (typeof saved.phone === 'string') setPhone(saved.phone)
    if (typeof saved.pax === 'number') setPax(saved.pax)
    if (typeof saved.queueNumber === 'number') setQueueNumber(saved.queueNumber)
    if (typeof saved.waitingId === 'string') setWaitingId(saved.waitingId)
    if (typeof saved.waitingCount === 'number') setWaitingCount(saved.waitingCount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Inline useMyWaiting logic
  const [waitingStatus, setWaitingStatus] = useState<WaitingStatus | null>('waiting')
  const [myPosition, setMyPosition] = useState(0)

  useEffect(() => {
    if (!storeId || !waitingId) return

    getWaitingStatus(storeId, waitingId)
      .then(({ myPosition: pos }) => setMyPosition(pos))
      .catch(() => {/* silent */})

    const supabase = createClient()
    const channel = supabase
      .channel(`my-waiting:${waitingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'waitings', filter: `id=eq.${waitingId}` },
        (payload) => {
          const row = payload.new as { status: WaitingStatus; queue_number: number }
          setWaitingStatus(row.status)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'waitings', filter: `store_id=eq.${storeId}` },
        () => {
          getWaitingStatus(storeId, waitingId)
            .then(({ myPosition: pos }) => setMyPosition(pos))
            .catch(() => {/* silent */})
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, waitingId])

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify({
      phone, pax, queueNumber, waitingId, waitingCount, step,
    }))
  }, [storageKey, phone, pax, queueNumber, waitingId, waitingCount, step])

  const handleKeypad = (num: string) => {
    if (phone.length < 13) {
      if (phone.length === 3 || phone.length === 8) {
        setPhone(phone + '-' + num)
      } else {
        setPhone(phone + num)
      }
    }
  }

  const handleDelete = () => {
    if (phone.length > 3) {
      if (phone.endsWith('-')) {
        setPhone(phone.slice(0, -2))
      } else {
        setPhone(phone.slice(0, -1))
      }
    }
  }

  const handleComplete = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const rawPhone = phone.replace(/-/g, '')
      const result = await createWaiting({ storeId, phone: rawPhone, partySize: pax })
      const status = await getWaitingStatus(storeId, result.waitingId)
      sessionStorage.setItem(storageKey, JSON.stringify({
        phone, pax,
        queueNumber: result.queueNumber,
        waitingId: result.waitingId,
        waitingCount: status.totalWaiting,
        step: 3,
      }))
      setQueueNumber(result.queueNumber)
      setWaitingId(result.waitingId)
      setWaitingCount(status.totalWaiting)
      setStep(3)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center font-sans p-4 select-none">
      <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col min-h-[600px] relative">
        {/* Header */}
        <header className="px-8 py-6 border-b border-zinc-100 flex items-center justify-between">
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">TableFlow <span className="text-orange-500">대기 등록</span></h1>
          <div className="flex gap-3">
            <button onClick={() => window.history.back()} className="text-zinc-600 hover:text-zinc-900 font-bold text-sm bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-full transition-colors">
              대기 확인/취소
            </button>
            <button onClick={() => window.location.href = '/'} className="text-zinc-400 hover:text-zinc-600 font-bold text-sm bg-white border border-zinc-200 hover:bg-zinc-50 px-4 py-2 rounded-full transition-colors">
              홈으로 나가기
            </button>
          </div>
        </header>

        <div className="flex-1 relative flex">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col p-8 md:p-12 items-center justify-center w-full"
              >
                <h2 className="text-3xl font-extrabold text-zinc-900 mb-2">연락처를 입력해주세요</h2>
                <p className="text-zinc-500 mb-8 font-medium">매장에서 직접 순서를 안내해 드립니다.</p>

                <div className="text-2xl font-black tracking-wider text-zinc-800 mb-10 h-12 flex items-center justify-center border-b-2 border-zinc-900 pb-2 w-72 text-center">
                  {phone}
                  <span className="w-1 h-8 bg-orange-500 animate-pulse ml-1"></span>
                </div>

                <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                  {[1,2,3,4,5,6,7,8,9].map(num => (
                    <button key={num} onClick={() => handleKeypad(num.toString())} className="h-16 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-2xl font-bold text-zinc-800 transition-colors active:scale-95">
                      {num}
                    </button>
                  ))}
                  <button onClick={() => setPhone('010')} className="h-16 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-lg font-bold text-zinc-500 transition-colors active:scale-95">초기화</button>
                  <button onClick={() => handleKeypad('0')} className="h-16 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-2xl font-bold text-zinc-800 transition-colors active:scale-95">0</button>
                  <button onClick={handleDelete} className="h-16 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-lg font-bold text-zinc-500 transition-colors active:scale-95">지우기</button>
                </div>

                <button
                  onClick={() => phone.length >= 13 ? setStep(2) : undefined}
                  className={`mt-10 w-full max-w-sm py-5 rounded-2xl text-xl font-black transition-all ${
                    phone.length >= 13 ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  다음
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="flex-1 flex flex-col p-8 md:p-12 items-center justify-center w-full"
              >
                <div className="w-full max-w-sm">
                  <button onClick={() => setStep(1)} className="flex items-center text-zinc-500 font-bold mb-6 hover:text-zinc-800">
                    <ChevronLeft className="w-5 h-5" /> 뒤로
                  </button>
                  <h2 className="text-3xl font-extrabold text-zinc-900 mb-2">방문 인원을 선택해주세요</h2>
                  <p className="text-zinc-500 mb-12 font-medium">유아를 포함한 총 인원수를 선택해주세요.</p>

                  <div className="flex items-center justify-between bg-zinc-50 p-6 rounded-3xl mb-12">
                    <button onClick={() => setPax(Math.max(1, pax - 1))} className="w-16 h-16 bg-white shadow-sm rounded-2xl text-3xl font-bold text-zinc-600 active:scale-95">-</button>
                    <div className="flex items-center gap-3">
                      <Users className="w-8 h-8 text-orange-500" />
                      <span className="text-5xl font-black text-zinc-900">{pax}</span>
                      <span className="text-2xl font-bold text-zinc-500 mt-2">명</span>
                    </div>
                    <button onClick={() => setPax(Math.min(20, pax + 1))} className="w-16 h-16 bg-white shadow-sm rounded-2xl text-3xl font-bold text-zinc-600 active:scale-95">+</button>
                  </div>

                  {submitError && (
                    <p className="text-red-500 text-sm font-medium mb-4 text-center">{submitError}</p>
                  )}
                  <button
                    onClick={handleComplete}
                    disabled={isSubmitting}
                    className={`w-full py-5 rounded-2xl text-xl font-black shadow-lg shadow-orange-500/30 transition-all active:scale-95 ${
                      isSubmitting ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600'
                    }`}
                  >
                    {isSubmitting ? '등록 중...' : '대기 등록 완료하기'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex-1 flex flex-col p-8 md:p-12 items-center justify-center w-full text-center"
              >
                <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-extrabold text-zinc-900 mb-4">대기 등록이 완료되었습니다!</h2>
                <div className="bg-zinc-50 px-8 py-6 rounded-3xl w-full max-w-sm mb-8 border border-zinc-100">
                  <p className="text-zinc-500 font-medium mb-1">고객님의 대기 번호는</p>
                  <p className="text-5xl font-black text-orange-500 mb-4">{queueNumber}<span className="text-2xl text-zinc-800 ml-1">번</span></p>
                  <div className="flex justify-between items-center text-sm font-bold text-zinc-600 border-t border-zinc-200 pt-4">
                    <span>현재 내 앞 대기</span>
                    <span className="text-red-500 text-lg">{waitingStatus === 'called' ? '호출됨' : `${myPosition}팀`}</span>
                  </div>
                </div>
                {waitingStatus === 'called' ? (
                  <div className="bg-green-50 border border-green-200 px-8 py-6 rounded-3xl w-full max-w-sm">
                    <p className="text-green-700 font-black text-xl">호출되었습니다! 입장해 주세요.</p>
                  </div>
                ) : (
                  <p className="text-zinc-500 font-medium leading-relaxed">
                    매장에서 직접 호출해 드립니다.<br/>
                    잠시만 기다려 주세요.
                  </p>
                )}
                <button
                  onClick={() => {
                    sessionStorage.removeItem(storageKey)
                    setPhone('010')
                    setPax(2)
                    setQueueNumber(0)
                    setWaitingId('')
                    setWaitingCount(0)
                    setSubmitError(null)
                    setStep(1)
                  }}
                  className="mt-8 text-sm font-bold text-zinc-500 hover:text-zinc-800"
                >
                  새 대기 등록 시작
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
