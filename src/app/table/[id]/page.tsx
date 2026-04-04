import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LegacyTablePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const { data: table, error } = await sb
    .from('tables')
    .select('qr_token, store_id')
    .eq('id', id)
    .single() as { data: { qr_token: string; store_id: string } | null; error: unknown }

  if (error || !table) notFound()

  const { data: store, error: storeError } = await sb
    .from('stores')
    .select('slug')
    .eq('id', table.store_id)
    .single() as { data: { slug: string } | null; error: unknown }

  if (storeError || !store) notFound()

  redirect(`/m/${store.slug}/${table.qr_token}`)
}
