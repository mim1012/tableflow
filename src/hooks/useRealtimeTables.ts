import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase as _supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any
import { getTables, updateTableStatus as apiUpdateTableStatus } from '@/lib/api/admin'
import { getTablesAction } from '@/app/actions/admin'
import type { TableRow, TableStatus } from '@/types/database'

export function useRealtimeTables(storeId: string | null) {
  const [tables, setTables] = useState<TableRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTables = useCallback(async () => {
    if (!storeId) {
      setTables([])
      setLoading(false)
      return
    }
    try {
      const data = await getTables(storeId)
      // 빈 배열은 정상 (테이블 0개인 신규 매장). 에러 시에만 서버 액션 fallback
      setTables(data ?? [])
    } catch {
      // anon 클라이언트 실패(RLS 차단 등) → service_role 서버 액션으로 재시도
      try {
        const serverData = await getTablesAction(storeId)
        setTables(serverData as TableRow[])
      } catch (err2) {
        console.error('useRealtimeTables fetchTables:', err2)
      }
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!storeId) {
      setTables([])
      setLoading(false)
      return
    }
    fetchTables()

    const channel = supabase
      .channel(`tables:${storeId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tables', filter: `store_id=eq.${storeId}` },
        (payload: any) => {
          setTables((prev) =>
            prev.map((t) =>
              t.id === payload.new.id ? { ...t, ...(payload.new as TableRow) } : t
            )
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tables', filter: `store_id=eq.${storeId}` },
        (payload: any) => {
          setTables((prev) => [...prev, payload.new as TableRow].sort((a, b) => a.table_number - b.table_number))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [storeId, fetchTables])

  const updateTableStatus = useCallback(async (tableId: string, status: TableStatus) => {
    try {
      await apiUpdateTableStatus(tableId, status)
      setTables((prev) =>
        prev.map((t) => (t.id === tableId ? { ...t, status } : t))
      )
      return true
    } catch (err) {
      console.error('useRealtimeTables updateTableStatus:', err)
      toast.error('테이블 상태 변경에 실패했습니다.')
      return false
    }
  }, [])

  return { tables, loading, updateTableStatus, refetch: fetchTables }
}
