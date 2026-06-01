# Prod 직원호출 E2E 체크리스트

대상 spec: `e2e/staff-call-prod-safe.spec.ts`

목적:
- prod에서 **직원 호출 확인 → 처리 완료** 흐름만 검증한다.
- 슈퍼어드민으로 매장을 새로 만들지 않는다.
- 기존 테스트 매장 1개만 사용한다.
- 테스트 중 생성되는 데이터는 `staff_calls` 1건만 허용하고 종료 시 삭제한다.

---

## 1. 사전 조건

아래 조건이 모두 맞아야 한다.

- prod에 **전용 테스트 매장**이 이미 존재한다.
- 해당 매장에 **최소 1개 테이블**이 존재한다.
- 해당 매장에 로그인 가능한 **점주 계정 1개**가 있다.
- `supabase/migrations/20260505210000_staff_calls.sql` 이 prod에 반영되어 있다.
- prod 관리자 UI에서 `웨이팅` 탭 접근이 가능하다.
- 실행자는 prod `SUPABASE_SERVICE_ROLE_KEY`를 안전하게 보유하고 있다.

권장:
- 운영 중인 실제 매장 대신 **전용 테스트 매장** 사용
- 테스트 시간대는 한가한 시간으로 선택
- 테스트 직전 관리자 화면에 실제 pending 직원 호출이 없는지 확인

---

## 2. 필요한 환경변수

```bash
export PLAYWRIGHT_BASE_URL='https://YOUR_PROD_DOMAIN'
export NEXT_PUBLIC_SUPABASE_URL='https://YOUR_PROJECT.supabase.co'
export NEXT_PUBLIC_SUPABASE_ANON_KEY='YOUR_ANON_KEY'
export SUPABASE_SERVICE_ROLE_KEY='YOUR_SERVICE_ROLE_KEY'
export TEST_OWNER_EMAIL='owner-for-test-store@example.com'
export TEST_OWNER_PASSWORD='YOUR_OWNER_PASSWORD'
export TEST_STORE_SLUG='your-prod-test-store-slug'
```

설명:
- `PLAYWRIGHT_BASE_URL`: 브라우저가 붙을 prod 앱 URL
- `NEXT_PUBLIC_SUPABASE_URL`: prod Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: prod anon key
- `SUPABASE_SERVICE_ROLE_KEY`: seed/검증/cleanup용
- `TEST_OWNER_EMAIL`: 테스트 매장 점주 계정
- `TEST_OWNER_PASSWORD`: 점주 비밀번호
- `TEST_STORE_SLUG`: 기존 테스트 매장 slug

---

## 3. 실행 전 드라이런 체크

### 3-1. spec 인식 확인
실행 전에 테스트가 정확히 1개만 잡히는지 먼저 확인한다.

```bash
npx playwright test --list e2e/staff-call-prod-safe.spec.ts
```

기대 결과:
- `직원 호출 prod-safe E2E`
- `기존 테스트 매장에서 직원 호출 확인 및 처리 완료`
- `Total: 1 test in 1 file`

### 3-2. 로컬 서버 자동기동 차단 확인
`PLAYWRIGHT_BASE_URL`가 prod URL이면 로컬 `npm run dev`를 띄우지 않아야 한다.

확인 기준:
- 실행 로그에 local dev server 기동 대기가 없어야 한다.
- 브라우저 요청 대상이 prod 도메인이어야 한다.

### 3-3. 테스트 매장 기본 상태 확인
가능하면 실행 전에 아래를 수동 확인한다.

- 점주 계정으로 로그인 가능
- `웨이팅` 탭 노출
- 기존 직원 호출 pending이 거의 없거나 0건
- 첫 번째 테이블이 정상 존재

---

## 4. 실제 실행 명령

```bash
npm run test:e2e -- e2e/staff-call-prod-safe.spec.ts
```

이 spec이 하는 일:
1. `TEST_STORE_SLUG`로 매장 조회
2. 해당 매장의 첫 테이블 조회
3. `staff_calls` pending row 1건 삽입
4. 점주 로그인
5. 관리자 `웨이팅` 탭에서 해당 호출 노출 확인
6. `처리 완료` 클릭
7. DB에서 `status=resolved`, `resolved_at` 확인
8. 마지막에 생성한 row 삭제

---

## 5. 성공 기준

아래가 모두 만족되면 성공이다.

- 점주 로그인 성공
- `웨이팅 관리` 화면 진입 성공
- 삽입한 직원 호출 문구가 화면에 표시됨
- 올바른 테이블 번호가 표시됨
- `처리 완료` 후 UI에서 호출이 사라짐
- DB에서 해당 row의 `status='resolved'`
- DB에서 `resolved_at IS NOT NULL`
- 종료 후 생성한 `staff_calls` row가 cleanup됨

---

## 6. 실패 시 우선 확인 포인트

### A. 로그인 실패
- `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD` 오타
- 해당 계정이 실제로 prod 테스트 매장 점주인지 확인
- 첫 로그인 비밀번호 변경이 아직 안 끝난 계정인지 확인

### B. 웨이팅 탭 진입 실패
- 점주 권한이 아닌 계정 사용 여부
- prod 배포본이 최신인지 확인
- 관리자 네비게이션 구조 변경 여부 확인

### C. 직원 호출이 안 보임
- `staff_calls` migration 미적용
- realtime 구독 문제
- `store_id` / `table_id`가 테스트 매장과 불일치
- 기존 pending 호출이 너무 많아 구분이 안 되는 경우

### D. 처리 완료는 눌렀는데 DB 반영 안 됨
- RLS 또는 update 권한 문제
- `resolveStaffCall` 클라이언트 호출 실패
- 최신 배포본과 DB 스키마 불일치

### E. cleanup 실패
- `SUPABASE_SERVICE_ROLE_KEY` 오타
- service role 권한 불일치
- 네트워크/REST 호출 실패

---

## 7. 운영 안전 수칙

- 실제 영업 매장에서는 가급적 실행하지 않는다.
- 반드시 **전용 테스트 매장**만 사용한다.
- 실행 전후로 `직원 호출` 카드에 테스트 문구가 남지 않았는지 확인한다.
- 실패해도 row 1건만 남도록 설계되어 있지만, 실패 직후 관리자 화면/DB를 직접 확인한다.
- 테스트 문구는 `E2E 직원호출 <timestamp>` 형식이므로 쉽게 식별 가능하다.

---

## 8. 권장 실행 순서

1. env export
2. `--list`로 spec 1건 인식 확인
3. 점주 계정으로 prod 수동 로그인 1회 확인
4. `npm run test:e2e -- e2e/staff-call-prod-safe.spec.ts` 실행
5. 실패 시 Playwright trace/screenshot 확인
6. 관리자 화면 + DB에 테스트 호출 잔여물이 없는지 확인

---

## 9. 가장 보수적인 실행 방법

처음 prod에서 돌릴 때는 아래 순서를 권장한다.

1. staging에서 동일 env 패턴으로 먼저 1회 성공
2. prod 테스트 매장에 사람이 없는 시간대 선택
3. prod spec 1회 실행
4. 성공 후 바로 관리자 화면에서 잔여 호출 0건 확인

이 체크리스트는 **웨이팅 전체 회귀 테스트**가 아니라 **직원 호출 운영 플로우 최소 검증** 용도다.
