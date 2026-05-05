import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase as _supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any
import { getWaitings } from '@/lib/api/waiting'
import type { WaitingRow } from '@/types/database'

const ACTIVE_WAITING_STATUSES = new Set<WaitingRow['status']>(['waiting', 'called'])

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
