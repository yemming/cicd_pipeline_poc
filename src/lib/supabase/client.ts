import { createBrowserClient } from '@supabase/ssr'

// 瀏覽器只應有一個 supabase client；多 client 同時 mount 會搶 Web Lock
// (lock:sb-...-auth-token) 並丟 NavigatorLockAcquireTimeoutError。
const makeClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

let _client: ReturnType<typeof makeClient> | null = null

export function createClient() {
  if (!_client) _client = makeClient()
  return _client
}
