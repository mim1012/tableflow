import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const preview = request.nextUrl.searchParams.get('preview')

  if (process.env.NODE_ENV === 'development' && pathname === '/admin' && preview === 'settings') {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  try {
    const { data } = await supabase.auth.getSession()
    user = data.session?.user ?? null
  } catch {
    // 세션 읽기 실패 시 미인증으로 처리
  }

  const isSuperAdmin = user?.app_metadata?.role === 'super_admin'

  // 루트 → 로그인 리다이렉트 (super_admin은 /superadmin으로)
  if (pathname === '/') {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    return NextResponse.redirect(new URL(isSuperAdmin ? '/superadmin' : '/admin', request.url))
  }

  // Protected routes
  if (!user && (pathname.startsWith('/admin') || pathname === '/change-password')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Superadmin route
  if (pathname.startsWith('/superadmin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/', '/admin/:path*', '/change-password', '/superadmin', '/superadmin/:path*'],
}
