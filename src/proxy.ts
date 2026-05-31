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
  // 公開路由：
  // - /csi/surveys/respond：公開填問卷頁（持 token 即可訪問，給客戶用，不必登入）
  // - /api/csi/respond：對應的 submit API（用 token 寫回 survey_responses）
  // - /api/deploy/released：CI/CD 部署成功通知 endpoint（自己用 DEPLOY_NOTIFY_TOKEN 守門，外部 script 觸發、無 cookie）
  const publicPaths = ['/login', '/api/auth', '/api/holidays', '/api/weather', '/api/line', '/api/admin/notifications', '/api/deploy', '/stitch', '/parts-stitch', '/csi/surveys/respond', '/api/csi/respond']
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|ogg)$).*)',
  ],
}
