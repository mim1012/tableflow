import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase as _supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any
import { getWaitings } from '@/lib/api/waiting'
import type { WaitingRow } from '@/types/database'

const ACTIVE_WAITING_STATUSES = new Set<WaitingRow['status']>(['waiting', 'called'])

type ActiveWaitingStatus = Extract<WaitingRow['status'], 'waiting' | 'called'>
export type WaitingOverrideStatus = ActiveWaitingStatus | 'completed' | 'cancelled' | 'no_show' | 'seated'

function sortWaitings(waitings: WaitingRow[]) {
  return [...waitings].sort((a, b) => a.queue_number - b.queue_number)
}

export function applyWaitingUpdate(prev: WaitingRow[], updated: WaitingRow): WaitingRow[] {
  const withoutUpdated = prev.filter((waiting) => waiting.id !== updated.id)

  if (!ACTIVE_WAITING_STATUSES.has(updated.status)) {
    return withoutUpdated
  }

  return sortWaitings([...withoutUpdated, updated])
}

export function applyWaitingOverrides(
  waitings: WaitingRow[],
  overrides: Map<string, WaitingOverrideStatus>,
): WaitingRow[] {
  return sortWaitings(
    waitings
      .map((waiting) => {
        const status = overrides.get(waiting.id)
        return status ? { ...waiting, status } : waiting
      })
      .filter((waiting) => ACTIVE_WAITING_STATUSES.has(waiting.status)),
  )
}

export function clearConfirmedWaitingOverrides(
  overrides: Map<string, WaitingOverrideStatus>,
  waitings: WaitingRow[],
): Map<string, WaitingOverrideStatus> {
  if (overrides.size === 0) return overrides

  const waitingsById = new Map(waitings.map((waiting) => [waiting.id, waiting]))
  const next = new Map(overrides)
  let changed = false

  for (const [waitingId, status] of overrides) {
    const waiting = waitingsById.get(waitingId)

    if (!waiting) {
      if (!ACTIVE_WAITING_STATUSES.has(status)) {
        next.delete(waitingId)
        changed = true
      }
      continue
    }

    if (waiting.status === status) {
      next.delete(waitingId)
      changed = true
    }
  }

  return changed ? next : overrides
}

export function useWaitingQueue(storeId: string | null) {
  const [waitings, setWaitings] = useState<WaitingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!storeId) return
    try {
      const data = await getWaitings(storeId)
      setWaitings(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeId) return
    refresh()

    const channel = supabase
      .channel(`waiting-queue:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'waitings',
          filter: `store_id=eq.${storeId}`,
        },
        (payload: any) => {
          const newRow = payload.new as WaitingRow
          if (!ACTIVE_WAITING_STATUSES.has(newRow.status)) {
            return
          }
          setWaitings((prev) => {
            // avoid duplicates
            if (prev.some((w) => w.id === newRow.id)) return prev
            toast.success(
              `새 대기 등록: ${newRow.queue_number}번 (${newRow.party_size}명)`,
              { duration: 4000 },
            )
            return sortWaitings([...prev, newRow])
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'waitings',
          filter: `store_id=eq.${storeId}`,
        },
        (payload: any) => {
          const updated = payload.new as WaitingRow
          setWaitings((prev) => applyWaitingUpdate(prev, updated))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, refresh])

  return { waitings, loading, error, refresh }
}
