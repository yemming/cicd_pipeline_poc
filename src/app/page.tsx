import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

async function getContacts() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
  const { data } = await supabase.from('test001').select('*').order('id')
  return data ?? []
}

export default async function Home() {
  const contacts = await getContacts()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold text-black dark:text-white">Hello World</h1>

      <table className="border-collapse text-sm text-black dark:text-white">
        <thead>
          <tr className="border-b border-gray-300 dark:border-gray-600">
            <th className="px-6 py-2 text-left">ID</th>
            <th className="px-6 py-2 text-left">姓名</th>
            <th className="px-6 py-2 text-left">電話</th>
            <th className="px-6 py-2 text-left">地址</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((row) => (
            <tr key={row.id} className="border-b border-gray-200 dark:border-gray-700">
              <td className="px-6 py-2">{row.id}</td>
              <td className="px-6 py-2">{row.姓名}</td>
              <td className="px-6 py-2">{row.電話}</td>
              <td className="px-6 py-2">{row.地址}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
