// Next.js requires static process.env.NEXT_PUBLIC_X access (dot notation) for build-time inlining.
// Dynamic access like process.env[key] is NOT replaced by Next.js compiler.

// 빌드 타임 SSR 프리렌더링 시 env 없으면 placeholder — 실제 요청은 브라우저/런타임에서만 실행됨
export const SUPABASE_URL: string =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'

export const SUPABASE_ANON_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
