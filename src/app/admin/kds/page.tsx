import KDSFullscreenClient from './KDSFullscreenClient'
import { resolveAdminStoreContext } from '@/lib/server/storeAccess'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'KDS — TableFlow',
  description: '주방 디스플레이 시스템',
}

export default async function KDSPage({
  searchParams,
}: {
  searchParams?: Promise<{ storeId?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const context = await resolveAdminStoreContext(resolvedSearchParams?.storeId)
  if (context.kind === 'ready') {
    return <KDSFullscreenClient resolvedStoreId={context.storeId} resolvedStoreName={context.storeName} supportMode={context.supportMode} />
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-white">KDS 접근 불가</h1>
        <p className="mt-2 text-sm text-zinc-300">
          {context.kind === 'select-store' ? '슈퍼관리자는 슈퍼관리자 화면에서 활성 매장을 선택해야 합니다.' : context.message}
        </p>
      </div>
    </main>
  )
}
