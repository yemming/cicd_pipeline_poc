import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

  // 公開路由不需要驗證
  // /api/admin/notifications/*：route handler 自己做 admin 檢查（含 dev bypass token），不走 cookie middleware
  const publicPaths = ['/login', '/onboarding', '/api/auth', '/api/holidays', '/api/weather', '/api/line', '/api/admin/notifications', '/stitch']
  const isPublic =
    request.nextUrl.pathname === '/' ||
    publicPaths.some(p => request.nextUrl.pathname.startsWith(p))

  if (isPublic) {
    return supabaseResponse
  }

  // 從本地 cookie 讀取 session（不打 Supabase 網路，避免 middleware 延遲）
  // 注意：getSession() 不驗證 JWT 簽名，僅適合 demo/內部環境；
  // 正式生產若需要嚴格驗證，改回 getUser()。
  const { data: { session } } = await supabase.auth.getSession()

  // 未登入時重導到 /login
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
