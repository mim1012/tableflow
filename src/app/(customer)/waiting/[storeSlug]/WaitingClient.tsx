'use client'

import React, { useState, useEffect } from 'react'
import { ChevronLeft, Users, CheckCircle2, Delete, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { createClient } from '@/lib/supabase/client'
import { createWaiting as createWaitingRpc, cancelWaiting as cancelWaitingRpc } from '@/lib/api/waiting'
import type { StoreRow, WaitingStatus } from '@/types/database'
import { getWaitingNextButtonHelperText, isWaitingPhoneComplete } from '../../ui-helpers'

async function createWaiting(params: { storeId: string; phone: string; partySize: number }) {
  return createWaitingRpc({
    storeId: params.storeId,
    phone: params.phone.replace(/\D/g, ''),
    partySize: params.partySize,
  })
}

async function cancelWaiting(params: { storeId: string; waitingId: string; phone: string }) {
  return cancelWaitingRpc(params)
}

async function getWaitingSnapshot(storeId: string, waitingId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any

  const { data: current, error: currentError } = await supabase
    .from('waitings_public')
    .select('id, queue_number, status')
    .eq('store_id', storeId)
    .eq('id', waitingId)
    .maybeSingle()

  if (currentError) throw new Error(currentError.message)
  if (!current) {
    return { myPosition: 0, totalWaiting: 0, status: null as WaitingStatus | null }
  }

  const [{ count: totalWaitingCount, error: totalWaitingError }, { count: aheadCount, error: aheadError }] = await Promise.all([
    supabase
      .from('waitings_public')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'waiting'),
    current.status === 'waiting'
      ? supabase
          .from('waitings_public')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', storeId)
          .eq('status', 'waiting')
          .lt('queue_number', current.queue_number)
      : Promise.resolve({ count: 0, error: null }),
  ])

  if (totalWaitingError) throw new Error(totalWaitingError.message)
  if (aheadError) throw new Error(aheadError.message)

  const totalWaiting = Math.max(0, Number(totalWaitingCount ?? 0))
  const myPosition = current.status === 'waiting'
    ? Math.max(0, Number(aheadCount ?? 0))
    : totalWaiting

  return { myPosition, totalWaiting, status: current.status as WaitingStatus }
}

function toWaitingErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : '등록 중 오류가 발생했습니다.'

  if (raw.includes('active waiting already exists')) {
    return '이미 진행 중인 대기가 있어요. 기존 대기를 취소한 뒤 다시 등록해 주세요.'
  }
  if (raw.includes('rate limit exceeded')) {
    return '같은 번호로 대기 등록을 너무 자주 요청했어요. 잠시 후 다시 시도해 주세요.'
  }
  if (raw.includes('phone must be 8-15 digits')) {
    return '휴대폰 번호를 다시 확인해 주세요.'
  }
  if (raw.includes('party_size must be between 1 and 20')) {
    return '방문 인원은 1명부터 20명까지 선택할 수 있어요.'
  }
  if (raw.includes('already ended') || raw.includes('이미 종료된 대기')) {
    return '이미 종료된 대기예요. 새로 등록해 주세요.'
  }

  return raw
}

interface Props {
  store: StoreRow
}

const INITIAL_PHONE = '010'

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

  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState(INITIAL_PHONE)
  const [pax, setPax] = useState(2)
  const [queueNumber, setQueueNumber] = useState(0)
  const [waitingId, setWaitingId] = useState('')
  const [waitingCount, setWaitingCount] = useState(0)

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
  const [isCancelling, setIsCancelling] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isResetArmed, setIsResetArmed] = useState(false)

  const [waitingStatus, setWaitingStatus] = useState<WaitingStatus | null>('waiting')
  const [myPosition, setMyPosition] = useState(0)

  const resetWaitingFlow = () => {
    sessionStorage.removeItem(storageKey)
    setPhone(INITIAL_PHONE)
    setPax(2)
    setQueueNumber(0)
    setWaitingId('')
    setWaitingCount(0)
    setWaitingStatus('waiting')
    setMyPosition(0)
    setSubmitError(null)
    setStep(1)
  }

  useEffect(() => {
    if (!storeId || !waitingId) return

    getWaitingSnapshot(storeId, waitingId)
      .then(({ myPosition: pos, totalWaiting, status }) => {
        setMyPosition(pos)
        setWaitingCount(totalWaiting)
        setWaitingStatus(status)
      })
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
          getWaitingSnapshot(storeId, waitingId)
            .then(({ myPosition: pos, totalWaiting, status }) => {
              setMyPosition(pos)
              setWaitingCount(totalWaiting)
              setWaitingStatus(status)
            })
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

  useEffect(() => {
    if (!isResetArmed) return

    const timer = window.setTimeout(() => setIsResetArmed(false), 2200)
    return () => window.clearTimeout(timer)
  }, [isResetArmed])

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
    setIsResetArmed(false)
  }

  const resetPhone = () => {
    setPhone(INITIAL_PHONE)
    setIsResetArmed(false)
  }

  const handleSafeReset = () => {
    if (phone === INITIAL_PHONE) return

    if (!isResetArmed) {
      setIsResetArmed(true)
      return
    }

    resetPhone()
  }

  const handleComplete = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const rawPhone = phone.replace(/-/g, '')
      const result = await createWaiting({ storeId, phone: rawPhone, partySize: pax })
      const snapshot = await getWaitingSnapshot(storeId, result.waitingId)
      sessionStorage.setItem(storageKey, JSON.stringify({
        phone, pax,
        queueNumber: result.queueNumber,
        waitingId: result.waitingId,
        waitingCount: snapshot.totalWaiting,
        step: 3,
      }))
      setQueueNumber(result.queueNumber)
      setWaitingId(result.waitingId)
      setWaitingCount(snapshot.totalWaiting)
      setWaitingStatus(snapshot.status ?? 'waiting')
      setMyPosition(snapshot.myPosition)
      setStep(3)
    } catch (e) {
      setSubmitError(toWaitingErrorMessage(e))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelWaiting = async () => {
    if (!waitingId) {
      resetWaitingFlow()
      return
    }

    setIsCancelling(true)
    setSubmitError(null)
    try {
      await cancelWaiting({
        storeId,
        waitingId,
        phone: phone.replace(/-/g, ''),
      })
      resetWaitingFlow()
    } catch (e) {
      setSubmitError(toWaitingErrorMessage(e))
    } finally {
      setIsCancelling(false)
    }
  }

  const isPhoneReady = isWaitingPhoneComplete(phone)
  const nextButtonHelperText = getWaitingNextButtonHelperText(phone, isSubmitting)
  const resetButtonText = isResetArmed ? '한 번 더 누르면 모두 지워져요' : '입력 내용 지우기'
  const canCancelWaiting = waitingStatus === 'waiting' || waitingStatus === 'called'

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center font-sans p-4 select-none">
      <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col min-h-[600px] relative">
        <header className="px-6 md:px-8 py-5 border-b border-zinc-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">{store.name}</p>
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 tracking-tight">대기 등록</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.history.back()}
              className="text-zinc-500 hover:text-zinc-800 font-semibold text-xs bg-zinc-50 hover:bg-zinc-100 px-3.5 py-2 rounded-full transition-colors"
            >
              이전으로
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="text-zinc-400 hover:text-zinc-600 font-semibold text-xs bg-white border border-zinc-200 hover:bg-zinc-50 px-3.5 py-2 rounded-full transition-colors"
            >
              홈으로
            </button>
          </div>
        </header>

        <div className="flex-1 relative flex">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col p-8 md:p-12 items-center justify-center w-full"
              >
                <h2 className="text-3xl font-extrabold text-zinc-900 mb-2 text-center break-keep">연락받을 휴대폰 번호를 입력해 주세요</h2>
                <p className="text-zinc-500 mb-2 font-medium text-center">대기 호출과 순서 확인에 사용할 번호예요.</p>
                <p className="text-xs text-zinc-400 mb-8 text-center">입장 안내를 위한 정보만 받아요. 하이픈은 자동으로 입력돼요.</p>

                <div className="w-full max-w-sm rounded-[28px] border border-zinc-200 bg-zinc-50 px-5 py-4 mb-4">
                  <div className="text-2xl font-black tracking-wider text-zinc-800 h-12 flex items-center justify-center border-b-2 border-zinc-900 pb-2 text-center">
                    {phone}
                    <span className="w-1 h-8 bg-orange-500 animate-pulse ml-1"></span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-3 text-center font-medium" aria-live="polite">
                    {nextButtonHelperText}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      onClick={() => handleKeypad(num.toString())}
                      className="h-16 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-2xl font-bold text-zinc-800 transition-colors active:scale-95"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    onClick={handleSafeReset}
                    disabled={phone === INITIAL_PHONE}
                    className={`h-16 rounded-2xl text-sm font-bold transition-colors active:scale-95 flex flex-col items-center justify-center gap-1 ${
                      phone === INITIAL_PHONE
                        ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                        : isResetArmed
                          ? 'bg-orange-50 text-orange-600 border border-orange-200'
                          : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>{resetButtonText}</span>
                  </button>
                  <button onClick={() => handleKeypad('0')} className="h-16 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-2xl font-bold text-zinc-800 transition-colors active:scale-95">0</button>
                  <button onClick={handleDelete} className="h-16 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-sm font-bold text-zinc-500 transition-colors active:scale-95 flex flex-col items-center justify-center gap-1">
                    <Delete className="w-4 h-4" />
                    <span>한 자리 지우기</span>
                  </button>
                </div>

                <button
                  onClick={() => isPhoneReady ? setStep(2) : undefined}
                  disabled={!isPhoneReady}
                  className={`mt-8 w-full max-w-sm py-5 rounded-2xl text-xl font-black transition-all ${
                    isPhoneReady ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  다음
                </button>
                <p className="mt-3 text-xs text-zinc-400 text-center">입장 안내와 대기 확인을 위해 필요한 정보만 사용돼요.</p>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex-1 flex flex-col p-8 md:p-12 items-center justify-center w-full"
              >
                <div className="w-full max-w-sm">
                  <button onClick={() => setStep(1)} className="flex items-center text-zinc-500 font-bold mb-6 hover:text-zinc-800">
                    <ChevronLeft className="w-5 h-5" /> 뒤로
                  </button>
                  <div className="rounded-3xl border border-zinc-200 bg-zinc-50 px-5 py-4 mb-6">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2">연락처 확인</p>
                    <p className="text-lg font-black text-zinc-900">{phone}</p>
                    <p className="text-xs text-zinc-500 mt-2">호출과 대기 확인용 번호예요. 등록된 정보는 대기 서비스 운영 목적에만 사용돼요.</p>
                  </div>
                  <h2 className="text-3xl font-extrabold text-zinc-900 mb-2">방문 인원을 선택해 주세요</h2>
                  <p className="text-zinc-500 mb-8 font-medium">유아를 포함한 실제 입장 인원을 선택해 주세요.</p>

                  <div className="flex items-center justify-between bg-zinc-50 p-6 rounded-3xl mb-8">
                    <button onClick={() => setPax(Math.max(1, pax - 1))} className="w-16 h-16 bg-white shadow-sm rounded-2xl text-3xl font-bold text-zinc-600 active:scale-95">-</button>
                    <div className="flex items-center gap-3">
                      <Users className="w-8 h-8 text-orange-500" />
                      <span className="text-5xl font-black text-zinc-900">{pax}</span>
                      <span className="text-2xl font-bold text-zinc-500 mt-2">명</span>
                    </div>
                    <button onClick={() => setPax(Math.min(20, pax + 1))} className="w-16 h-16 bg-white shadow-sm rounded-2xl text-3xl font-bold text-zinc-600 active:scale-95">+</button>
                  </div>

                  <p className="text-xs text-zinc-400 mb-5 text-center">인원 수가 많을수록 좌석 준비가 조금 더 걸릴 수 있어요.</p>

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
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col p-8 md:p-12 items-center justify-center w-full text-center"
              >
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
                  waitingStatus === 'cancelled' ? 'bg-zinc-100 text-zinc-500' : 'bg-green-100 text-green-500'
                }`}>
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-extrabold text-zinc-900 mb-4">
                  {waitingStatus === 'cancelled' ? '대기가 취소되었습니다.' : '대기 등록이 완료되었습니다!'}
                </h2>
                <div className="bg-zinc-50 px-8 py-6 rounded-3xl w-full max-w-sm mb-8 border border-zinc-100">
                  <p className="text-zinc-500 font-medium mb-1">고객님의 대기 번호는</p>
                  <p className="text-5xl font-black text-orange-500 mb-4">{queueNumber}<span className="text-2xl text-zinc-800 ml-1">번</span></p>
                  <div className="flex justify-between items-center text-sm font-bold text-zinc-600 border-t border-zinc-200 pt-4">
                    <span>현재 내 앞 대기</span>
                    <span className="text-red-500 text-lg">
                      {waitingStatus === 'called'
                        ? '호출됨'
                        : waitingStatus === 'cancelled'
                          ? '취소됨'
                          : `${myPosition}팀`}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-3">현재 전체 대기는 {waitingCount}팀이에요.</p>
                </div>
                {waitingStatus === 'called' ? (
                  <div className="bg-green-50 border border-green-200 px-8 py-6 rounded-3xl w-full max-w-sm">
                    <p className="text-green-700 font-black text-xl">호출되었습니다! 입장해 주세요.</p>
                  </div>
                ) : waitingStatus === 'cancelled' ? (
                  <div className="bg-zinc-50 border border-zinc-200 px-8 py-6 rounded-3xl w-full max-w-sm">
                    <p className="text-zinc-700 font-black text-xl">기존 대기가 취소되었어요.</p>
                    <p className="text-zinc-500 mt-2">원하시면 새 번호로 다시 등록할 수 있어요.</p>
                  </div>
                ) : (
                  <p className="text-zinc-500 font-medium leading-relaxed">
                    매장에서 직접 호출해 드립니다.<br />
                    잠시만 기다려 주세요.
                  </p>
                )}
                {submitError && (
                  <p className="text-red-500 text-sm font-medium mt-4 text-center">{submitError}</p>
                )}
                {canCancelWaiting && (
                  <button
                    onClick={handleCancelWaiting}
                    disabled={isCancelling}
                    className={`mt-8 w-full max-w-sm py-4 rounded-2xl text-base font-black transition-all ${
                      isCancelling ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed' : 'bg-zinc-900 text-white hover:bg-zinc-800'
                    }`}
                  >
                    {isCancelling ? '취소 중...' : '대기 취소하기'}
                  </button>
                )}
                <button
                  onClick={resetWaitingFlow}
                  className="mt-4 text-sm font-bold text-zinc-500 hover:text-zinc-800"
                >
                  {waitingStatus === 'cancelled' ? '새 대기 등록 시작' : '처음으로 돌아가기'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
