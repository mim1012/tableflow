import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase as _supabase } from '@/lib/supabase'
import { getPendingStaffCalls } from '@/lib/api/staffCall'
import type { StaffCallRow } from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any

function sortStaffCalls(staffCalls: StaffCallRow[]) {
  return [...staffCalls].sort((a, b) => b.requested_at.localeCompare(a.requested_at))
}

function applyStaffCallUpdate(prev: StaffCallRow[], updated: StaffCallRow) {
  const withoutUpdated = prev.filter((staffCall) => staffCall.id !== updated.id)

  if (updated.status !== 'pending') {
    return withoutUpdated
  }

  return sortStaffCalls([...withoutUpdated, updated])
}

export function useStaffCalls(storeId: string | null) {
  const [staffCalls, setStaffCalls] = useState<StaffCallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!storeId) return
    try {
      const data = await getPendingStaffCalls(storeId)
      setStaffCalls(data)
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
      .channel(`staff-calls:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'staff_calls',
          filter: `store_id=eq.${storeId}`,
        },
        (payload: any) => {
          const newRow = payload.new as StaffCallRow
          if (newRow.status !== 'pending') return

          setStaffCalls((prev) => {
            if (prev.some((staffCall) => staffCall.id === newRow.id)) return prev
            toast.success(`직원 호출 접수: ${newRow.option_name}`, { duration: 4000 })
            return sortStaffCalls([newRow, ...prev])
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'staff_calls',
          filter: `store_id=eq.${storeId}`,
        },
        (payload: any) => {
          const updated = payload.new as StaffCallRow
          setStaffCalls((prev) => applyStaffCallUpdate(prev, updated))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, refresh])

  return { staffCalls, loading, error, refresh }
}
