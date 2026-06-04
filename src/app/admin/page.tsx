import AdminDashboardClient from './AdminDashboardClient'
import AdminSettingsPreview from './AdminSettingsPreview'
import { resolveAdminStoreContext } from '@/lib/server/storeAccess'

export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string; storeId?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const preview = resolvedSearchParams?.preview ?? null

  if (process.env.NODE_ENV === 'development' && preview === 'settings') {
    return <AdminSettingsPreview />
  }

  const context = await resolveAdminStoreContext(resolvedSearchParams?.storeId)
  if (context.kind === 'ready') {
    return <AdminDashboardClient resolvedStoreId={context.storeId} resolvedStoreName={context.storeName} supportMode={context.supportMode} />
  }

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">관리자 접근 불가</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {context.kind === 'select-store' ? '슈퍼관리자는 슈퍼관리자 화면에서 활성 매장을 선택해야 합니다.' : context.message}
        </p>
      </div>
    </main>
  )
}
