# 출시 전 체크리스트

> 완료 시 `[ ]` → `[x]` 로 변경

---

## 인프라

- [x] Supabase 프로젝트 생성 (tableflow 프로덕션)
- [x] Supabase schema 적용 (마이그레이션 실행 완료)
- [x] RLS 테스트 — 직원 격리, anon INSERT 검증, 역할별 권한 분리
- [ ] Supabase Storage 버킷 생성 (`menu-images`, public read)
- [x] Vercel 배포 설정 (Next.js framework preset)
- [ ] production env 설정 (Vercel Environment Variables)
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

---

## 인증

- [x] Supabase Auth 이메일+비밀번호 인증 구현
- [x] Auth 로그인 테스트
  - [x] 점주 이메일+비번 로그인 → 대시보드 이동
  - [x] 직원 이메일+비번 로그인 → 첫 로그인 비밀번호 변경 강제
  - [x] role별 페이지 접근 제어 (owner/manager/staff)
  - [x] 직원 계정 생성 → 임시 비번 화면 복사
- [x] 비밀번호 요구사항: 8자 이상 + 특수문자

---

## 기능 테스트

- [x] 주문 API 테스트
  - [x] QR URL → 매장/테이블 자동 인식
  - [x] 메뉴 조회 (카테고리, 아이템, 옵션)
  - [x] 주문 제출 → DB 저장 확인
  - [x] 주문 상태 실시간 업데이트 (고객 화면)

- [x] 메뉴 CRUD 테스트
  - [x] 카테고리 생성/수정/삭제
  - [x] 메뉴 아이템 생성/수정/soft delete
  - [x] 옵션 그룹 및 선택지 CRUD
  - [ ] 이미지 업로드 (모바일 카메라/갤러리)

- [x] Waiting queue 테스트
  - [x] 대기 등록 → queue_number 자동 채번
  - [x] 동시 등록 시 번호 중복 없음 (row lock 검증)
  - [x] 대기 호출 → called 상태 변경
  - [x] 테이블 자동 배정 (capacity >= party_size)
  - [x] 착석/완료/no_show 처리

- [x] Realtime 구독 테스트
  - [x] 신규 주문 → 대시보드 실시간 알림
  - [x] 주문 상태 변경 → 고객 화면 실시간 반영
  - [x] 대기 신규 등록 → 어드민 실시간 반영

---

## 보안

- [x] 크로스테넌트 RLS 격리 (SEC-E01~06)
- [x] 옵션 가격 조작 방지 trigger (SEC-E15)
- [x] 역할 상승 차단 — store_members UPDATE 제한 (SEC-E27)
- [x] Staff API 차단 — 메뉴/직원/설정 수정 불가 (SEC-E07~10)
- [x] store_settings 역할 기반 RLS (owner/manager만 수정)
- [x] 매장 구독 상태 검증 (checkStoreActive)
- [x] 대기번호 rollover 보안 (sequential + no historical reuse)

---

## 알림톡

- [ ] 카카오 비즈솔루션 채널 등록
- [ ] 알림톡 템플릿 심사 등록 (4개 이벤트)
  - [ ] `order_created`
  - [ ] `waiting_created`
  - [ ] `waiting_called`
  - [ ] `waiting_cancelled`
- [ ] 알림톡 테스트 (실제 수신 확인)
- [ ] Supabase Edge Function 배포 (`send-alimtalk`)
- [ ] 발송 실패 시 `waiting_notifications.status = 'failed'` 기록 확인

---

## CI/CD

- [x] GitHub Actions 워크플로우 작성
  - [x] `main` 푸시 시 자동 빌드
  - [x] Vercel 자동 배포
  - [x] Supabase 마이그레이션 적용
  - [x] Edge Functions 배포
- [ ] 배포 성공/실패 알림

---

## 모니터링

- [x] Sentry 연동 준비 (`@sentry/nextjs`, `global-error.tsx`)
- [ ] Sentry DSN 설정 및 실제 에러 수집 확인
- [ ] 성능 모니터링 대시보드 구성

---

## 출시 직전

- [x] 개인정보처리방침 페이지 (`/privacy`)
- [x] 이용약관 페이지 (`/terms`)
- [ ] `tableflow.com` 도메인 연결 및 HTTPS 확인
- [ ] 모바일 브라우저 QR 주문 플로우 최종 확인
- [ ] 대시보드 데스크톱 레이아웃 최종 확인
