# DB 스키마 설계 v3

> **Supabase PostgreSQL** 기반
> 멀티테넌트: 전 테이블 `store_id` 보유 → RLS 직접 컬럼 비교

---

## 테이블 관계도

```
auth.users
    │
    └── stores
          ├── store_settings (1:1)
          ├── store_queue_sequences (1:1, 대기번호 시퀀스)
          ├── store_members (직원/역할)
          ├── tables
          ├── menu_categories
          │     └── menu_items
          │           └── option_groups
          │                 └── option_choices
          ├── orders
          │     └── order_items
          └── waitings
                └── waiting_notifications

platform_alimtalk_templates  ← 플랫폼 전역 (store 무관)
```

---

## 테이블 정의

### stores — 매장

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| owner_id | uuid FK → auth.users | |
| name | text NOT NULL | 매장명 |
| slug | text UNIQUE NOT NULL | URL 식별자 |
| address | text | |
| phone | text | |
| logo_url | text | |
| created_at | timestamptz | |

---

### store_queue_sequences — 대기번호 시퀀스 (1:1)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| store_id | uuid PK FK → stores | |
| current_number | int DEFAULT 0 | 현재까지 발급된 마지막 번호 |

> `next_queue_number(store_id)` 함수로 채번 — row lock으로 동시 요청 중복 방지
> ```sql
> queue_number = next_queue_number(store_id)  -- 1, 2, 3, ...
> ```

---

### store_settings — 매장 설정 (1:1)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| store_id | uuid UNIQUE FK → stores | |
| kakao_receiver_phone | text | |
| alimtalk_enabled | bool DEFAULT false | |
| waiting_minutes_per_team | int DEFAULT 5 | 웨이팅 예상시간 계산용 기본 1팀 처리시간(분) |

> 카카오 채널/키는 플랫폼 환경변수 중앙 관리

---

### platform_alimtalk_templates — 플랫폼 알림톡 템플릿

> 채널 1개 · 템플릿 심사 1회 → 전 매장 적용 (SaaS 중앙 채널 모델)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| event | alimtalk_event UNIQUE | order_created \| waiting_created \| waiting_called \| waiting_cancelled |
| template_code | text NOT NULL | 카카오 템플릿 코드 |
| template_body | text NOT NULL | 내용 참고용 |
| is_active | bool DEFAULT true | |
| updated_at | timestamptz | |

템플릿 예시:
```
[TableFlow]
#{store_name} 대기번호 #{number}번입니다.
입장해주세요.
```

> 서버사이드 전용, RLS 미적용

---

### store_members — 직원/역할

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| store_id | uuid FK → stores | |
| user_id | uuid FK → auth.users | |
| role | member_role | owner \| manager \| staff |
| created_at | timestamptz | |

> UNIQUE(store_id, user_id)

---

### tables — 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| store_id | uuid FK → stores | |
| table_number | int NOT NULL | |
| name | text | 표시명 |
| capacity | int | 최대 수용 인원 (웨이팅 자동 배정용) |
| status | table_status | available \| occupied \| cleaning |
| qr_token | uuid DEFAULT gen_random_uuid() | |
| created_at | timestamptz | |

> UNIQUE(store_id, table_number), UNIQUE(store_id, qr_token)
> QR URL: `tableflow.com/m/{slug}/{qr_token}`

---

### menu_categories / menu_items / option_groups / option_choices

| 테이블 | 주요 컬럼 |
|-------|---------|
| menu_categories | store_id, name, sort_order |
| menu_items | store_id, category_id, name, price, image_url, badge, is_available, **is_deleted**, deleted_at, sort_order |
| option_groups | **store_id**, menu_item_id, name, is_required, sort_order |
| option_choices | **store_id**, option_group_id, name, extra_price, sort_order |

> option_groups, option_choices에 store_id 추가 → RLS JOIN 없이 직접 비교

---

### orders — 주문

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| store_id | uuid FK → stores | |
| table_id | uuid FK → tables (SET NULL) | |
| status | order_status DEFAULT 'created' | 아래 흐름 참고 |
| payment_status | payment_status DEFAULT 'unpaid' | unpaid \| paid \| failed \| refunded |
| payment_method | payment_method | card \| cash \| kakaopay \| naverpay |
| subtotal_price | int NOT NULL | 옵션 포함 소계 |
| discount_price | int DEFAULT 0 | 할인액 |
| tax_price | int DEFAULT 0 | 세금 (정산/POS 연동용) |
| total_price | int NOT NULL | 최종 결제액 |
| guest_name | text | |
| special_requests | text | |
| created_at | timestamptz | |

**주문 상태 흐름:**
```
created → confirmed → preparing → ready → served
                                        ↘ cancelled
```

---

### order_items — 주문 아이템

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| **store_id** | uuid FK → stores | RLS 직접 비교용 |
| order_id | uuid FK → orders | |
| menu_item_id | uuid FK → menu_items (SET NULL) | 삭제 시 이력 보존 |
| menu_item_name | text NOT NULL | 주문 시점 스냅샷 |
| unit_price | int NOT NULL | 주문 시점 스냅샷 |
| quantity | int NOT NULL | |
| total_price | int NOT NULL | |
| selected_options | jsonb | 옵션 스냅샷 |

---

### waitings — 대기 고객

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| store_id | uuid FK → stores | |
| **queue_number** | int NOT NULL | **대기번호 (핵심)** |
| phone | text NOT NULL | |
| party_size | int NOT NULL | |
| status | waiting_status DEFAULT 'waiting' | 아래 흐름 참고 |
| table_id | uuid FK → tables (SET NULL) | 배정 테이블 |
| called_at | timestamptz | 호출 시각 |
| seated_at | timestamptz | 착석 시각 |
| created_at | timestamptz | |

> UNIQUE(store_id, queue_number)

**대기 상태 흐름:**
```
waiting → called → seated → completed (식사 종료)
        ↘ cancelled
        ↘ no_show
```

> `seated`(착석) ≠ `completed`(식사 종료) — 매장 운영상 구분 필요

---

### waiting_notifications — 알림 이벤트 로그

> `notification_sent bool` → 이벤트별 전체 로그 테이블 (재전송·장애분석·통계)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| store_id | uuid FK → stores | RLS용 |
| waiting_id | uuid FK → waitings | |
| event | alimtalk_event | waiting_created \| waiting_called \| waiting_cancelled |
| status | notification_status | pending \| sent \| failed |
| provider | notification_provider | kakao_alimtalk (향후 SMS 등 확장) |
| sent_at | timestamptz | 실제 발송 시각 |
| error_msg | text | 실패 메시지 |
| created_at | timestamptz | |

---

## 인덱스 요약

| 인덱스 | 용도 |
|-------|------|
| `store_members(user_id)` | RLS 헬퍼 함수 핵심 |
| `orders(store_id, created_at DESC)` | 실시간 주문 목록 |
| `orders(store_id, status)` | 상태별 필터 |
| `waitings(store_id, queue_number)` | 대기번호 조회 |
| `waitings(store_id, status)` | 상태별 필터 |
| `waitings(store_id) WHERE status='waiting'` | 대기 화면 성능 |
| `menu_items(store_id) WHERE is_deleted=false` | 활성 메뉴 조회 |

---

## 주요 함수

```sql
-- 테이블 원자적 추가 (레이스 컨디션 없이 다음 번호 자동 채번)
SELECT * FROM add_table_atomic('store-uuid');

-- 대기번호 채번 (row lock으로 동시성 보장)
SELECT next_queue_number('store-uuid');  -- 1, 2, 3, ...

-- 웨이팅 자동 배정 쿼리
SELECT * FROM tables
WHERE store_id = ? AND status = 'available' AND capacity >= ?
ORDER BY capacity LIMIT 1;

-- 현재 대기 수 조회
SELECT COUNT(*) FROM waitings
WHERE store_id = ? AND status = 'waiting';
```

---

## RLS 요약

```sql
-- 직원: store_id 직접 비교
USING (store_id IN (SELECT my_store_ids()))

-- 고객 anon INSERT: store 유효성 검증
WITH CHECK (
  auth.role() = 'anon'
  AND store_id IN (SELECT id FROM stores)  -- 악성 데이터 방지
)

-- 메뉴 조회: anon 읽기 허용
FOR SELECT USING (true)
```

---

## 버전 이력

| 버전 | 주요 변경 |
|------|---------|
| v1 | 초기 설계 |
| v2 | store_id 전파, order_status 확장, soft delete, alimtalk 중앙화 |
| v3 | queue_number 추가, waiting_notifications 테이블, completed 상태, tables.capacity, orders 가격 분리 (subtotal/discount/tax/total), anon RLS 보안 강화 |
| v4 | store_queue_sequences + next_queue_number() 함수, waiting_notifications에 status/provider 추가, waitings.completed_at 추가, orders anon RLS table_id 교차 검증 |
