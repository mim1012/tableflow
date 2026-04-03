import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  // 빌드 타임 SSR 프리렌더링 시 env 없으면 placeholder — useEffect는 브라우저에서만 실행됨
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
  return createBrowserClient<Database>(url, key)
}
