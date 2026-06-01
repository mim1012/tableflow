// ============================================================
// database.ts — TypeScript types generated from TableFlow schema v4
// Keep in sync with supabase/migrations/20260315000001_initial_schema.sql
// ============================================================

// ============================================================
// Enum types
// ============================================================

export type AlimtalkEvent =
  | 'order_created'
  | 'waiting_created'
  | 'waiting_called'
  | 'waiting_cancelled'

export type MemberRole = 'owner' | 'manager' | 'staff'

export type TableStatus = 'available' | 'occupied' | 'cleaning'

export type ItemBadge = 'best' | 'recommended'

export type OrderStatus =
  | 'created'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'cancelled'

export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'refunded'

export type PaymentMethod = 'card' | 'cash' | 'kakaopay' | 'naverpay'

export type WaitingStatus =
  | 'waiting'
  | 'called'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type NotificationStatus = 'pending' | 'sent' | 'failed'

export type NotificationProvider = 'kakao_alimtalk'

// ============================================================
// Table row types
// ============================================================

export interface StoreRow {
  id: string
  owner_id: string
  name: string
  slug: string
  address: string | null
  phone: string | null
  logo_url: string | null
  created_at: string
  subscription_start: string | null  // date → string (ISO)
  subscription_end: string | null
  is_active: boolean
}

export interface StoreInsert {
  id?: string
  owner_id: string
  name: string
  slug: string
  address?: string | null
  phone?: string | null
  logo_url?: string | null
  created_at?: string
  subscription_start?: string | null
  subscription_end?: string | null
  is_active?: boolean
}

export interface StoreUpdate {
  id?: string
  owner_id?: string
  name?: string
  slug?: string
  address?: string | null
  phone?: string | null
  logo_url?: string | null
  created_at?: string
  subscription_start?: string | null
  subscription_end?: string | null
  is_active?: boolean
}

// ------------------------------------------------------------

export interface StoreSettingsRow {
  id: string
  store_id: string
  kakao_receiver_phone: string | null
  alimtalk_enabled: boolean
  waiting_minutes_per_team: number
  staff_call_options: string[] | null
}

export interface StoreSettingsInsert {
  id?: string
  store_id: string
  kakao_receiver_phone?: string | null
  alimtalk_enabled?: boolean
  waiting_minutes_per_team?: number
  staff_call_options?: string[] | null
}

export interface StoreSettingsUpdate {
  id?: string
  store_id?: string
  kakao_receiver_phone?: string | null
  alimtalk_enabled?: boolean
  waiting_minutes_per_team?: number
  staff_call_options?: string[] | null
}

// ------------------------------------------------------------

export interface StoreQueueSequenceRow {
  store_id: string
  current_number: number
}

export interface StoreQueueSequenceInsert {
  store_id: string
  current_number?: number
}

export interface StoreQueueSequenceUpdate {
  store_id?: string
  current_number?: number
}

// ------------------------------------------------------------

export interface PlatformAlimtalkTemplateRow {
  id: string
  event: AlimtalkEvent
  template_code: string
  template_body: string
  is_active: boolean
  updated_at: string
}

export interface PlatformAlimtalkTemplateInsert {
  id?: string
  event: AlimtalkEvent
  template_code: string
  template_body: string
  is_active?: boolean
  updated_at?: string
}

export interface PlatformAlimtalkTemplateUpdate {
  id?: string
  event?: AlimtalkEvent
  template_code?: string
  template_body?: string
  is_active?: boolean
  updated_at?: string
}

// ------------------------------------------------------------

export interface StoreMemberRow {
  id: string
  store_id: string
  user_id: string
  role: MemberRole
  is_first_login: boolean
  is_active: boolean
  created_at: string
}

export interface StoreMemberInsert {
  id?: string
  store_id: string
  user_id: string
  role?: MemberRole
  is_first_login?: boolean
  is_active?: boolean
  created_at?: string
}

export interface StoreMemberUpdate {
  id?: string
  store_id?: string
  user_id?: string
  role?: MemberRole
  created_at?: string
  is_first_login?: boolean
  is_active?: boolean
}

// ------------------------------------------------------------

export interface TableRow {
  id: string
  store_id: string
  table_number: number
  name: string | null
  capacity: number | null
  status: TableStatus
  qr_token: string
  created_at: string
}

export interface TableInsert {
  id?: string
  store_id: string
  table_number: number
  name?: string | null
  capacity?: number | null
  status?: TableStatus
  qr_token?: string
  created_at?: string
}

export interface TableUpdate {
  id?: string
  store_id?: string
  table_number?: number
  name?: string | null
  capacity?: number | null
  status?: TableStatus
  qr_token?: string
  created_at?: string
}

// ------------------------------------------------------------

export interface MenuCategoryRow {
  id: string
  store_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface MenuCategoryInsert {
  id?: string
  store_id: string
  name: string
  sort_order?: number
  created_at?: string
}

export interface MenuCategoryUpdate {
  id?: string
  store_id?: string
  name?: string
  sort_order?: number
  created_at?: string
}

// ------------------------------------------------------------

export interface MenuItemRow {
  id: string
  store_id: string
  category_id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  badge: ItemBadge | null
  is_available: boolean
  is_deleted: boolean
  deleted_at: string | null
  sort_order: number
  created_at: string
}

export interface MenuItemInsert {
  id?: string
  store_id: string
  category_id: string
  name: string
  description?: string | null
  price: number
  image_url?: string | null
  badge?: ItemBadge | null
  is_available?: boolean
  is_deleted?: boolean
  deleted_at?: string | null
  sort_order?: number
  created_at?: string
}

export interface MenuItemUpdate {
  id?: string
  store_id?: string
  category_id?: string
  name?: string
  description?: string | null
  price?: number
  image_url?: string | null
  badge?: ItemBadge | null
  is_available?: boolean
  is_deleted?: boolean
  deleted_at?: string | null
  sort_order?: number
  created_at?: string
}

// ------------------------------------------------------------

export interface OptionGroupRow {
  id: string
  store_id: string
  menu_item_id: string
  name: string
  is_required: boolean
  sort_order: number
}

export interface OptionGroupInsert {
  id?: string
  store_id: string
  menu_item_id: string
  name: string
  is_required?: boolean
  sort_order?: number
}

export interface OptionGroupUpdate {
  id?: string
  store_id?: string
  menu_item_id?: string
  name?: string
  is_required?: boolean
  sort_order?: number
}

// ------------------------------------------------------------

export interface OptionChoiceRow {
  id: string
  store_id: string
  option_group_id: string
  name: string
  extra_price: number
  sort_order: number
}

export interface OptionChoiceInsert {
  id?: string
  store_id: string
  option_group_id: string
  name: string
  extra_price?: number
  sort_order?: number
}

export interface OptionChoiceUpdate {
  id?: string
  store_id?: string
  option_group_id?: string
  name?: string
  extra_price?: number
  sort_order?: number
}

// ------------------------------------------------------------

export interface OrderRow {
  id: string
  store_id: string
  table_id: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: PaymentMethod | null
  subtotal_price: number
  discount_price: number
  tax_price: number
  total_price: number
  guest_name: string | null
  special_requests: string | null
  pax: number
  created_at: string
}

export interface OrderInsert {
  id?: string
  store_id: string
  table_id?: string | null
  status?: OrderStatus
  payment_status?: PaymentStatus
  payment_method?: PaymentMethod | null
  subtotal_price: number
  discount_price?: number
  tax_price?: number
  total_price: number
  guest_name?: string | null
  special_requests?: string | null
  pax?: number
  created_at?: string
}

export interface OrderUpdate {
  id?: string
  store_id?: string
  table_id?: string | null
  status?: OrderStatus
  payment_status?: PaymentStatus
  payment_method?: PaymentMethod | null
  subtotal_price?: number
  discount_price?: number
  tax_price?: number
  total_price?: number
  guest_name?: string | null
  special_requests?: string | null
  pax?: number
  created_at?: string
}

// ------------------------------------------------------------

export interface SelectedOption {
  option_choice_id: string
  group: string
  choice: string
  extra_price: number
}

export interface OrderItemRow {
  id: string
  store_id: string
  order_id: string
  menu_item_id: string | null
  menu_item_name: string
  unit_price: number
  quantity: number
  total_price: number
  selected_options: SelectedOption[] | null
}

export interface OrderItemInsert {
  id?: string
  store_id: string
  order_id: string
  menu_item_id?: string | null
  menu_item_name: string
  unit_price: number
  quantity: number
  total_price: number
  selected_options?: SelectedOption[] | null
}

export interface OrderItemUpdate {
  id?: string
  store_id?: string
  order_id?: string
  menu_item_id?: string | null
  menu_item_name?: string
  unit_price?: number
  quantity?: number
  total_price?: number
  selected_options?: SelectedOption[] | null
}

// ------------------------------------------------------------

export type StaffCallStatus = 'pending' | 'resolved'

export interface StaffCallRow {
  id: string
  store_id: string
  table_id: string | null
  option_name: string
  status: StaffCallStatus
  requested_at: string
  resolved_at: string | null
}

export interface StaffCallInsert {
  id?: string
  store_id: string
  table_id?: string | null
  option_name: string
  status?: StaffCallStatus
  requested_at?: string
  resolved_at?: string | null
}

export interface StaffCallUpdate {
  id?: string
  store_id?: string
  table_id?: string | null
  option_name?: string
  status?: StaffCallStatus
  requested_at?: string
  resolved_at?: string | null
}

// ------------------------------------------------------------

export interface WaitingRow {
  id: string
  store_id: string
  queue_number: number
  phone: string
  party_size: number
  status: WaitingStatus
  table_id: string | null
  called_at: string | null
  seated_at: string | null
  completed_at: string | null
  created_at: string
}

export interface WaitingInsert {
  id?: string
  store_id: string
  queue_number: number
  phone: string
  party_size: number
  status?: WaitingStatus
  table_id?: string | null
  called_at?: string | null
  seated_at?: string | null
  completed_at?: string | null
  created_at?: string
}

export interface WaitingUpdate {
  id?: string
  store_id?: string
  queue_number?: number
  phone?: string
  party_size?: number
  status?: WaitingStatus
  table_id?: string | null
  called_at?: string | null
  seated_at?: string | null
  completed_at?: string | null
  created_at?: string
}

// ------------------------------------------------------------

export interface WaitingNotificationRow {
  id: string
  store_id: string
  waiting_id: string
  event: AlimtalkEvent
  status: NotificationStatus
  provider: NotificationProvider
  sent_at: string | null
  error_msg: string | null
  created_at: string
}

export interface WaitingNotificationInsert {
  id?: string
  store_id: string
  waiting_id: string
  event: AlimtalkEvent
  status?: NotificationStatus
  provider?: NotificationProvider
  sent_at?: string | null
  error_msg?: string | null
  created_at?: string
}

export interface WaitingNotificationUpdate {
  id?: string
  store_id?: string
  waiting_id?: string
  event?: AlimtalkEvent
  status?: NotificationStatus
  provider?: NotificationProvider
  sent_at?: string | null
  error_msg?: string | null
  created_at?: string
}

// ============================================================
// Customers & Points
// ============================================================

export type PointReason = 'manual_grant' | 'event_grant' | 'order_use'

export interface CustomerRow {
  id: string
  store_id: string
  auth_user_id: string | null
  name: string
  profile_image: string | null
  phone: string | null
  kakao_friend: boolean
  total_points: number
  visit_count: number
  last_visited_at: string | null
  created_at: string
}

export interface CustomerInsert {
  id?: string
  store_id: string
  auth_user_id?: string | null
  name?: string
  profile_image?: string | null
  phone?: string | null
  kakao_friend?: boolean
  total_points?: number
  visit_count?: number
  last_visited_at?: string | null
  created_at?: string
}

export interface CustomerUpdate {
  name?: string
  profile_image?: string | null
  phone?: string | null
  kakao_friend?: boolean
}

// ------------------------------------------------------------

export interface CustomerPointHistoryRow {
  id: string
  store_id: string
  customer_id: string
  order_id: string | null
  delta: number
  reason: PointReason
  memo: string | null
  granted_by: string | null
  created_at: string
}

export interface CustomerPointHistoryInsert {
  id?: string
  store_id: string
  customer_id: string
  order_id?: string | null
  delta: number
  reason?: PointReason
  memo?: string | null
  granted_by?: string | null
  created_at?: string
}

// ------------------------------------------------------------

export interface StorePointEventRow {
  id: string
  store_id: string
  name: string
  points: number
  is_active: boolean
  created_at: string
}

export interface StorePointEventInsert {
  id?: string
  store_id: string
  name: string
  points: number
  is_active?: boolean
  created_at?: string
}

export interface StorePointEventUpdate {
  name?: string
  points?: number
  is_active?: boolean
}

// ============================================================
// Supabase Database type (for createClient<Database>)
// ============================================================

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: StoreRow
        Insert: StoreInsert
        Update: StoreUpdate
        Relationships: never[]
      }
      store_settings: {
        Row: StoreSettingsRow
        Insert: StoreSettingsInsert
        Update: StoreSettingsUpdate
        Relationships: never[]
      }
      store_queue_sequences: {
        Row: StoreQueueSequenceRow
        Insert: StoreQueueSequenceInsert
        Update: StoreQueueSequenceUpdate
        Relationships: never[]
      }
      platform_alimtalk_templates: {
        Row: PlatformAlimtalkTemplateRow
        Insert: PlatformAlimtalkTemplateInsert
        Update: PlatformAlimtalkTemplateUpdate
        Relationships: never[]
      }
      store_members: {
        Row: StoreMemberRow
        Insert: StoreMemberInsert
        Update: StoreMemberUpdate
        Relationships: never[]
      }
      tables: {
        Row: TableRow
        Insert: TableInsert
        Update: TableUpdate
        Relationships: never[]
      }
      menu_categories: {
        Row: MenuCategoryRow
        Insert: MenuCategoryInsert
        Update: MenuCategoryUpdate
        Relationships: never[]
      }
      menu_items: {
        Row: MenuItemRow
        Insert: MenuItemInsert
        Update: MenuItemUpdate
        Relationships: never[]
      }
      option_groups: {
        Row: OptionGroupRow
        Insert: OptionGroupInsert
        Update: OptionGroupUpdate
        Relationships: never[]
      }
      option_choices: {
        Row: OptionChoiceRow
        Insert: OptionChoiceInsert
        Update: OptionChoiceUpdate
        Relationships: never[]
      }
      orders: {
        Row: OrderRow
        Insert: OrderInsert
        Update: OrderUpdate
        Relationships: never[]
      }
      order_items: {
        Row: OrderItemRow
        Insert: OrderItemInsert
        Update: OrderItemUpdate
        Relationships: never[]
      }
      staff_calls: {
        Row: StaffCallRow
        Insert: StaffCallInsert
        Update: StaffCallUpdate
        Relationships: never[]
      }
      waitings: {
        Row: WaitingRow
        Insert: WaitingInsert
        Update: WaitingUpdate
        Relationships: never[]
      }
      waiting_notifications: {
        Row: WaitingNotificationRow
        Insert: WaitingNotificationInsert
        Update: WaitingNotificationUpdate
        Relationships: never[]
      }
      customers: {
        Row: CustomerRow
        Insert: CustomerInsert
        Update: CustomerUpdate
        Relationships: never[]
      }
      customer_point_history: {
        Row: CustomerPointHistoryRow
        Insert: CustomerPointHistoryInsert
        Update: never
        Relationships: never[]
      }
      store_point_events: {
        Row: StorePointEventRow
        Insert: StorePointEventInsert
        Update: StorePointEventUpdate
        Relationships: never[]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      grant_points: {
        Args: {
          p_customer_id: string
          p_delta: number
          p_reason?: PointReason
          p_memo?: string | null
          p_order_id?: string | null
        }
        Returns: void
      }
      create_order_atomic: {
        Args: {
          p_store_id: string
          p_table_id: string
          p_items: Record<string, unknown>[]
          p_guest_name?: string | null
          p_special_requests?: string | null
          p_payment_method?: PaymentMethod | null
        }
        Returns: string
      }
      create_staff_call: {
        Args: {
          p_store_id: string
          p_table_id: string
          p_option_name: string
        }
        Returns: string
      }
      get_staff_call_options: {
        Args: {
          p_store_id: string
        }
        Returns: string[]
      }
      add_table_atomic: {
        Args: { p_store_id: string }
        Returns: {
          id: string
          store_id: string
          table_number: number
          name: string | null
          capacity: number | null
          status: TableStatus
          qr_token: string
          created_at: string
        }
      }
      cancel_waiting_public: {
          Args: { p_phone: string; p_store_id: string; p_waiting_id: string }
          Returns: string
        }
        create_waiting_atomic: {
        Args: { p_store_id: string; p_phone: string; p_party_size: number }
        Returns: { queue_number: number; waiting_id: string }
      }
      next_queue_number: {
        Args: { p_store_id: string }
        Returns: number
      }
      my_store_ids: {
        Args: Record<string, never>
        Returns: string[]
      }
    }
    Enums: {
      alimtalk_event: AlimtalkEvent
      member_role: MemberRole
      table_status: TableStatus
      item_badge: ItemBadge
      order_status: OrderStatus
      payment_status: PaymentStatus
      payment_method: PaymentMethod
      waiting_status: WaitingStatus
      notification_status: NotificationStatus
      notification_provider: NotificationProvider
      point_reason: PointReason
    }
  }
}
