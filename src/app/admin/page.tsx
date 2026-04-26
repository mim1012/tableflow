import AdminDashboardClient from './AdminDashboardClient'
import AdminSettingsPreview from './AdminSettingsPreview'

export const dynamic = 'force-dynamic'

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ preview?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const preview = resolvedSearchParams?.preview ?? null

  if (process.env.NODE_ENV === 'development' && preview === 'settings') {
    return <AdminSettingsPreview />
  }

  return <AdminDashboardClient />
}
