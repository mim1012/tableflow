import type { OrderStatus } from '@/types/database';

// ============================================================
// UI-local types (adapted from Supabase row shapes)
// ============================================================

export interface UIOrderItem {
  name: string;
  qty: number;
  price: number;
  option?: string;
}

export interface UIOrder {
  id: string;
  table: number;
  items: UIOrderItem[];
  total: number;
  status: string;
  time: number;
  type: string;
  pax: number;
}

export interface UITable {
  id: number;
  _realId: string;
  name: string;
  qrToken: string;
  status: string;
  time: string;
  amount: number;
  pax: number;
}

export interface UIMenu {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: boolean;
  image?: string;
  desc?: string;
  badge?: string;
  options: any[];
}

export interface RecentActivity {
  time: string;
  text: string;
  type: 'order';
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

// ============================================================
// OrderWithItems — local definition (avoids importing from hooks/)
// ============================================================

export interface OrderItemRow {
  menu_item_name: string;
  quantity: number;
  unit_price: number;
  selected_options?: { choice: string }[] | null;
}

export interface OrderWithItems {
  id: string;
  table_id: string | null;
  created_at: string;
  total_price: number;
  status: string;
  order_items?: OrderItemRow[] | null;
}

// ============================================================
// Helper functions
// ============================================================

export function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function adaptOrder(o: OrderWithItems, tableNumberMap: Map<string, number>): UIOrder {
  return {
    id: o.id,
    table: tableNumberMap.get(o.table_id ?? '') ?? 0,
    items: (o.order_items ?? []).map((it) => ({
      name: it.menu_item_name,
      qty: it.quantity,
      price: it.unit_price,
      option: it.selected_options?.map((so) => so.choice).join(', ') || undefined,
    })),
    total: o.total_price,
    status: o.status === 'created' || o.status === 'confirmed' ? 'pending'
      : o.status === 'ready' ? 'completed'
      : o.status,
    time: minutesAgo(o.created_at),
    type: 'Dine-in',
    pax: (o as any).pax ?? 0,
  };
}

// ============================================================
// Constants
// ============================================================

export const WEEKLY_REVENUE = [
  { day: '월', amount: 120, prev: 110 },
  { day: '화', amount: 145, prev: 130 },
  { day: '수', amount: 135, prev: 125 },
  { day: '목', amount: 160, prev: 150 },
  { day: '금', amount: 210, prev: 180 },
  { day: '토', amount: 280, prev: 250 },
  { day: '일', amount: 260, prev: 240 },
];

export const CATEGORY_SALES = [
  { name: '브런치', value: 45, fill: '#f97316' },
  { name: '커피', value: 30, fill: '#fb923c' },
  { name: '디저트', value: 15, fill: '#fdba74' },
  { name: '음료', value: 10, fill: '#fed7aa' },
];

export const TOP_MENUS = [
  { name: '트러플 파스타', sales: 42 },
  { name: '아보카도 샌드', sales: 38 },
  { name: '아메리카노', sales: 85 },
  { name: '자몽 에이드', sales: 24 },
  { name: '크로플', sales: 31 },
];

export const STAFF_ALLOWED_TABS = new Set(['orders', 'tables', 'waiting']);

export const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  pending: 'confirmed',
  preparing: 'preparing',
  completed: 'ready',
  served: 'served',
  cancelled: 'cancelled',
};
