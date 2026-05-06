'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { getMyWaitingRouteDecision } from './session'

function readWaitingStorage() {
  const snapshot: Record<string, string> = {}

  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index)
    if (!key || !key.startsWith('waiting:')) continue

    const value = window.sessionStorage.getItem(key)
    if (typeof value === 'string') {
      snapshot[key] = value
    }
  }

  return snapshot
}

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

export default function MyWaitingLandingClient() {
  const router = useRouter()
  const [storage, setStorage] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    const snapshot = readWaitingStorage()
    setStorage(snapshot)
  }, [])

  const decision = useMemo(() => {
    if (!storage) return null
    return getMyWaitingRouteDecision(storage)
  }, [storage])

  useEffect(() => {
    if (!decision) return

    for (const staleKey of decision.staleKeys) {
      window.sessionStorage.removeItem(staleKey)
    }

    if (decision.type === 'redirect') {
      router.replace(decision.href)
    }
  }, [decision, router])

  if (!decision || decision.type === 'redirect') {
    return (
      <div className="min-h-screen bg-zinc-900 px-4 py-10 text-white">
        <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center rounded-[2rem] bg-zinc-950/70 p-8 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">My Waiting</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">내 대기를 찾는 중이에요</h1>
          <p className="mt-3 text-sm text-zinc-300">이전에 등록한 대기 정보가 있으면 바로 해당 매장 화면으로 보내드릴게요.</p>
        </div>
      </div>
    )
  }

  if (decision.type === 'empty') {
    return (
      <div className="min-h-screen bg-zinc-900 px-4 py-10 text-white">
        <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center rounded-[2rem] bg-zinc-950/70 p-8 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">My Waiting</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">저장된 대기 내역이 없어요</h1>
          <p className="mt-3 text-sm text-zinc-300">이 기기에서 등록한 대기만 다시 찾을 수 있어요. 매장 QR 또는 대기 등록 링크로 다시 들어가 주세요.</p>
          <Link href="/" className="mt-6 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/30">
            홈으로 이동
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-[2rem] bg-zinc-950/70 p-8 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-400">My Waiting</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">어느 매장 대기인지 선택해 주세요</h1>
        <p className="mt-3 text-sm text-zinc-300">같은 기기에서 저장된 대기만 보여줘요. 이어서 확인할 매장을 선택하면 기존 대기 화면으로 이동합니다.</p>

        <div className="mt-8 space-y-4">
          {decision.entries.map((entry) => (
            <Link
              key={entry.waitingId}
              href={`/waiting/${entry.storeSlug}`}
              className="block rounded-[1.5rem] border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/10"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black text-white">{entry.storeSlug}</p>
                  <p className="mt-1 text-sm text-zinc-300">{maskPhone(entry.phone)} · {entry.pax}명</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">대기번호</p>
                  <p className="mt-1 text-2xl font-black text-orange-400">{entry.queueNumber}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
