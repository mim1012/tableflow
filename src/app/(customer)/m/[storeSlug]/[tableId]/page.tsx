import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isStoreSubscriptionActive } from '@/lib/utils/subscription'
import CustomerMenuClient from './CustomerMenuClient'
import type { StoreRow, TableRow, MenuCategoryRow, MenuItemRow, OptionGroupRow, OptionChoiceRow } from '@/types/database'
import type { MenuItem } from './CustomerMenuClient'
import { normalizeStaffCallOptionNames } from './staffCallOptions'

interface Props {
  params: Promise<{ storeSlug: string; tableId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug } = await params
  return {
    title: `메뉴 — ${storeSlug}`,
  }
}

function badgeLabel(badge: string | null): string {
  if (badge === 'best') return 'BEST'
  if (badge === 'recommended') return '추천'
  return ''
}

export default async function CustomerMenuPage({ params }: Props) {
  const { storeSlug, tableId } = await params
  const supabase = await createClient()

  // Fetch store by slug
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('*')
    .eq('slug', storeSlug)
    .single()

  if (storeError || !store) notFound()
  const storeData = store as StoreRow

  if (!isStoreSubscriptionActive(storeData)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 p-8 text-center gap-3">
        <p className="text-5xl">🔒</p>
        <h1 className="text-xl font-black text-zinc-900">서비스 이용 불가</h1>
        <p className="text-sm text-zinc-500 leading-relaxed">
          해당 매장은 현재 서비스를 이용할 수 없습니다.<br />매장에 문의해 주세요.
        </p>
      </div>
    )
  }

  // Fetch table, categories, items in parallel
  const [tableResult, categoriesResult, itemsResult, staffCallOptionsResult] = await Promise.all([
    supabase.from('tables').select('*').eq('store_id', storeData.id).eq('qr_token', tableId).single(),
    supabase.from('menu_categories').select('*').eq('store_id', storeData.id).order('sort_order', { ascending: true }),
    supabase.from('menu_items').select('*').eq('store_id', storeData.id).eq('is_available', true).eq('is_deleted', false).order('sort_order', { ascending: true }),
    (supabase as any).rpc('get_staff_call_options', { p_store_id: storeData.id }),
  ])

  const tableData = tableResult.data as TableRow | null
  if (tableResult.error || !tableData) notFound()

  const staffCallOptionNames = normalizeStaffCallOptionNames(
    (staffCallOptionsResult.data as string[] | null) ?? [],
  )

  const categories: MenuCategoryRow[] = categoriesResult.data ?? []
  const itemRows: MenuItemRow[] = (itemsResult.data ?? []) as MenuItemRow[]

  // Build category id→name map
  const catMap = new Map<string, string>(categories.map((c) => [c.id, c.name]))

  // Load option groups + choices for all items in parallel
  const menuItems: MenuItem[] = await Promise.all(
    itemRows.map(async (row) => {
      const { data: groupsRaw } = await supabase
        .from('option_groups')
        .select('*')
        .eq('menu_item_id', row.id)
        .order('sort_order', { ascending: true })
      const groups = (groupsRaw ?? []) as OptionGroupRow[]

      const options = await Promise.all(
        groups.map(async (group) => {
          const { data: choicesRaw } = await supabase
            .from('option_choices')
            .select('*')
            .eq('option_group_id', group.id)
            .order('sort_order', { ascending: true })
          const choices = (choicesRaw ?? []) as OptionChoiceRow[]

          return {
            name: group.name,
            required: group.is_required,
            choices: choices.map((c) => ({
              id: c.id,
              name: c.name,
              price: c.extra_price,
            })),
          }
        })
      )

      return {
        id: row.id,
        name: row.name,
        price: row.price,
        category: catMap.get(row.category_id) ?? '',
        desc: row.description ?? '',
        image: row.image_url ?? '',
        badge: badgeLabel(row.badge),
        options: options.length > 0 ? options : undefined,
      }
    })
  )

  return (
    <CustomerMenuClient
      store={storeData}
      table={tableData}
      categories={categories}
      items={menuItems}
      staffCallOptionNames={staffCallOptionNames}
    />
  )
}
