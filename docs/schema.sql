-- ============================================================
-- TableFlow DB Schema v4 (Final)
-- Supabase PostgreSQL
-- ============================================================

-- ============================================================
-- 1. stores
-- ============================================================
CREATE TABLE stores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,           -- QR URL: tableflow.com/m/{slug}/{qr_token}
  address    text,
  phone      text,
  logo_url   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. store_settings (1:1)
-- ============================================================
CREATE TABLE store_settings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             uuid NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  kakao_receiver_phone text,
  alimtalk_enabled     bool NOT NULL DEFAULT false
);

-- ============================================================
-- 3. store_queue_sequences — 매장별 대기번호 시퀀스 (번호는 날짜별 재사용 없이 store 단위 전역 증가)
-- 동시 요청 시 row lock으로 중복 방지
-- ============================================================
CREATE TABLE store_queue_sequences (
  store_id         uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  current_number   int  NOT NULL DEFAULT 0,
  last_reset_date  date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date
);

-- 대기번호 채번 함수 (row lock + 당일 자동 리셋)
CREATE OR REPLACE FUNCTION next_queue_number(p_store_id uuid)
RETURNS int LANGUAGE plpgsql AS $func$
DECLARE
  v_next         int;
  v_max_existing int;
  v_today        date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  SELECT COALESCE(MAX(queue_number), 0)
  INTO v_max_existing
  FROM waitings
  WHERE store_id = p_store_id;

  INSERT INTO store_queue_sequences (store_id, current_number, last_reset_date)
  VALUES (p_store_id, v_max_existing + 1, v_today)
  ON CONFLICT (store_id) DO UPDATE
  SET
    current_number = GREATEST(store_queue_sequences.current_number, v_max_existing) + 1,
    last_reset_date = EXCLUDED.last_reset_date
  RETURNING current_number INTO v_next;

  RETURN v_next;
END;
$func$;

-- ============================================================
-- 4. platform_alimtalk_templates — 플랫폼 중앙 알림톡 템플릿
-- 채널 1개 · 심사 1회 → 전 매장 적용
-- 변수: #{store_name}, #{number}, #{table_name}
-- ============================================================
CREATE TYPE alimtalk_event AS ENUM (
  'order_created',
  'waiting_created',
  'waiting_called',
  'waiting_cancelled'
);

CREATE TABLE platform_alimtalk_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event         alimtalk_event NOT NULL UNIQUE,
  template_code text NOT NULL,
  template_body text NOT NULL,
  is_active     bool NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- 서버사이드 전용, RLS 미적용

-- ============================================================
-- 5. store_members
-- ============================================================
CREATE TYPE member_role AS ENUM ('owner', 'manager', 'staff');

CREATE TABLE store_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           member_role NOT NULL DEFAULT 'staff',
  is_first_login boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);

-- ============================================================
-- 6. tables
-- ============================================================
CREATE TYPE table_status AS ENUM ('available', 'occupied', 'cleaning');

CREATE TABLE tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_number int  NOT NULL,
  name         text,
  capacity     int,                          -- 수용 인원 (웨이팅 자동 배정용)
  status       table_status NOT NULL DEFAULT 'available',
  qr_token     uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, table_number),
  UNIQUE (store_id, qr_token)
);

-- ============================================================
-- 7. menu_categories
-- ============================================================
CREATE TABLE menu_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. menu_items
-- ============================================================
CREATE TYPE item_badge AS ENUM ('best', 'recommended');

CREATE TABLE menu_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  price        int  NOT NULL CHECK (price >= 0),
  image_url    text,
  badge        item_badge,
  is_available bool NOT NULL DEFAULT true,   -- 품절
  is_deleted   bool NOT NULL DEFAULT false,  -- soft delete
  deleted_at   timestamptz,
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 9. option_groups (store_id 포함 — RLS 직접 비교)
-- ============================================================
CREATE TABLE option_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name         text NOT NULL,
  is_required  bool NOT NULL DEFAULT false,
  sort_order   int  NOT NULL DEFAULT 0
);

-- ============================================================
-- 10. option_choices (store_id 포함 — RLS 직접 비교)
-- ============================================================
CREATE TABLE option_choices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  option_group_id uuid NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name            text NOT NULL,
  extra_price     int  NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
  sort_order      int  NOT NULL DEFAULT 0
);

-- ============================================================
-- 11. orders
-- ============================================================
CREATE TYPE order_status AS ENUM (
  'created',    -- 고객 주문 제출
  'confirmed',  -- 점주 접수
  'preparing',  -- 조리 중
  'ready',      -- 서빙 준비 완료
  'served',     -- 서빙 완료
  'cancelled'
);

CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'failed', 'refunded');
CREATE TYPE payment_method  AS ENUM ('card', 'cash', 'kakaopay', 'naverpay');

CREATE TABLE orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  table_id         uuid REFERENCES tables(id) ON DELETE SET NULL,
  status           order_status   NOT NULL DEFAULT 'created',
  payment_status   payment_status NOT NULL DEFAULT 'unpaid',
  payment_method   payment_method,
  subtotal_price   int  NOT NULL CHECK (subtotal_price >= 0),
  discount_price   int  NOT NULL DEFAULT 0,
  tax_price        int  NOT NULL DEFAULT 0,
  total_price      int  NOT NULL CHECK (total_price >= 0),
  guest_name       text,
  special_requests text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. order_items (store_id 포함 — RLS 직접 비교)
-- ============================================================
CREATE TABLE order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id     uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_name   text NOT NULL,    -- 주문 시점 스냅샷
  unit_price       int  NOT NULL,    -- 주문 시점 스냅샷
  quantity         int  NOT NULL CHECK (quantity > 0),
  total_price      int  NOT NULL,
  selected_options jsonb             -- [{"group":"온도","choice":"아이스","extra_price":0}]
);

-- ============================================================
-- 13. waitings
-- ============================================================
CREATE TYPE waiting_status AS ENUM (
  'waiting',
  'called',
  'seated',
  'completed',   -- 식사 종료 (회전율 분석: completed_at - seated_at)
  'cancelled',
  'no_show'
);

CREATE TABLE waitings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  queue_number int  NOT NULL,                -- 대기번호 (next_queue_number() 함수로 채번)
  phone        text NOT NULL,
  party_size   int  NOT NULL CHECK (party_size > 0),
  status       waiting_status NOT NULL DEFAULT 'waiting',
  table_id     uuid REFERENCES tables(id) ON DELETE SET NULL,
  called_at    timestamptz,
  seated_at    timestamptz,
  completed_at timestamptz,                  -- 회전율 분석용
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, queue_number)
);

-- ============================================================
-- 14. waiting_notifications — 알림 이벤트 로그
-- 재전송 · 장애 분석 · 통계 가능
-- ============================================================
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE notification_provider AS ENUM ('kakao_alimtalk');  -- 향후 SMS 등 확장

CREATE TABLE waiting_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  waiting_id uuid NOT NULL REFERENCES waitings(id) ON DELETE CASCADE,
  event      alimtalk_event NOT NULL,
  status     notification_status NOT NULL DEFAULT 'pending',
  provider   notification_provider NOT NULL DEFAULT 'kakao_alimtalk',
  sent_at    timestamptz,
  error_msg  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 인덱스
-- ============================================================

-- store_members (RLS 헬퍼 핵심)
CREATE INDEX idx_store_members_user     ON store_members(user_id);
CREATE INDEX idx_store_members_store    ON store_members(store_id);

-- tables
CREATE INDEX idx_tables_store           ON tables(store_id);

-- menu
CREATE INDEX idx_menu_categories_store  ON menu_categories(store_id);
CREATE INDEX idx_menu_items_store       ON menu_items(store_id);
CREATE INDEX idx_menu_items_category    ON menu_items(category_id);
CREATE INDEX idx_menu_items_active      ON menu_items(store_id) WHERE is_deleted = false;

-- option
CREATE INDEX idx_option_groups_store    ON option_groups(store_id);
CREATE INDEX idx_option_groups_item     ON option_groups(menu_item_id);
CREATE INDEX idx_option_choices_store   ON option_choices(store_id);
CREATE INDEX idx_option_choices_group   ON option_choices(option_group_id);

-- orders (실시간 조회 핵심)
CREATE INDEX idx_orders_store_created   ON orders(store_id, created_at DESC);
CREATE INDEX idx_orders_store_status    ON orders(store_id, status);

-- order_items
CREATE INDEX idx_order_items_store      ON order_items(store_id);
CREATE INDEX idx_order_items_order      ON order_items(order_id);

-- waitings
CREATE INDEX idx_waitings_store_queue   ON waitings(store_id, queue_number);
CREATE INDEX idx_waitings_store_status  ON waitings(store_id, status);
CREATE INDEX idx_waitings_active        ON waitings(store_id) WHERE status = 'waiting';

-- waiting_notifications
CREATE INDEX idx_waiting_notif_waiting  ON waiting_notifications(waiting_id);
CREATE INDEX idx_waiting_notif_store    ON waiting_notifications(store_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE stores                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_queue_sequences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE option_choices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_notifications  ENABLE ROW LEVEL SECURITY;

-- 테이블 원자적 추가 (SELECT MAX + INSERT 레이스 컨디션 방지, unique_violation 시 자동 재시도)
CREATE OR REPLACE FUNCTION add_table_atomic(p_store_id UUID)
RETURNS tables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_result tables;
BEGIN
  LOOP
    BEGIN
      INSERT INTO tables (store_id, table_number, name, qr_token)
      SELECT
        p_store_id,
        COALESCE(MAX(table_number), 0) + 1,
        (COALESCE(MAX(table_number), 0) + 1)::text || '번',
        gen_random_uuid()
      FROM tables WHERE store_id = p_store_id
      RETURNING * INTO v_result;
      RETURN v_result;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
END;
$func$;
REVOKE ALL ON FUNCTION add_table_atomic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_table_atomic(UUID) TO service_role;

-- 헬퍼 함수 (SECURITY DEFINER + 인덱스 탐색)
CREATE OR REPLACE FUNCTION my_store_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT store_id FROM store_members WHERE user_id = auth.uid();
$$;

-- stores
CREATE POLICY "stores_member" ON stores
  USING (id IN (SELECT my_store_ids()));

-- store_settings
CREATE POLICY "store_settings_member" ON store_settings
  USING (store_id IN (SELECT my_store_ids()));

-- store_queue_sequences: 직원 읽기, 채번은 함수로만
CREATE POLICY "queue_seq_member" ON store_queue_sequences
  FOR SELECT USING (store_id IN (SELECT my_store_ids()));

-- store_members
CREATE POLICY "store_members_read" ON store_members
  FOR SELECT USING (store_id IN (SELECT my_store_ids()));

-- tables
CREATE POLICY "tables_member"      ON tables FOR ALL    USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "tables_anon_select" ON tables FOR SELECT USING (auth.role() = 'anon');

-- menu (anon 읽기 허용)
CREATE POLICY "menu_categories_member" ON menu_categories FOR ALL    USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "menu_categories_anon"   ON menu_categories FOR SELECT USING (true);
CREATE POLICY "menu_items_member"      ON menu_items      FOR ALL    USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "menu_items_anon"        ON menu_items      FOR SELECT USING (true);
CREATE POLICY "option_groups_member"   ON option_groups   FOR ALL    USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "option_groups_anon"     ON option_groups   FOR SELECT USING (true);
CREATE POLICY "option_choices_member"  ON option_choices  FOR ALL    USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "option_choices_anon"    ON option_choices  FOR SELECT USING (true);

-- orders: anon INSERT 시 store_id + table_id 교차 검증
CREATE POLICY "orders_member"      ON orders FOR ALL USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "orders_anon_insert" ON orders FOR INSERT
  WITH CHECK (
    auth.role() = 'anon'
    AND store_id IN (SELECT id FROM stores)
    AND (
      table_id IS NULL
      OR EXISTS (
        SELECT 1 FROM tables
        WHERE tables.id = table_id
        AND tables.store_id = orders.store_id
      )
    )
  );

-- order_items
CREATE POLICY "order_items_member"      ON order_items FOR ALL USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "order_items_anon_insert" ON order_items FOR INSERT
  WITH CHECK (
    auth.role() = 'anon'
    AND store_id IN (SELECT id FROM stores)
  );

-- waitings: anon INSERT 시 store_id 검증
CREATE POLICY "waitings_member"      ON waitings FOR ALL USING (store_id IN (SELECT my_store_ids()));
CREATE POLICY "waitings_anon_insert" ON waitings FOR INSERT
  WITH CHECK (
    auth.role() = 'anon'
    AND store_id IN (SELECT id FROM stores)
  );

-- waiting_notifications: 직원 읽기, INSERT는 서버사이드 전용
CREATE POLICY "waiting_notif_member" ON waiting_notifications
  USING (store_id IN (SELECT my_store_ids()));
