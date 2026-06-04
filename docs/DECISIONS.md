# 결정 로그 (Decision Log)

> 결정 완료 시 `[ ]` → `[x]` 로 변경

---

## ✅ 확정 결정

### 1. 백엔드 전략
- [x] **Supabase 올인원** — Auth + DB + Realtime + Storage + RLS 멀티테넌트 격리

### 2. 운영 모델
- [x] **개발사 관리형** (Self-service SaaS 아님)
  - 개발사가 슈퍼어드민 패널에서 매장·계정·이용기간 직접 관리
  - 점주 자가 가입 없음
  - 결제/구독 코드 없음 — 계약은 오프라인, 시스템은 기간 만료 여부로만 접근 제어

### 3. 인증 방식
- [x] **이메일+비번만** — 카카오 소셜 로그인 제거
- [x] 계정 생성 주체:
  - 점주 계정 → 개발사(슈퍼어드민)가 생성
  - 직원 계정 → 점주가 어드민 대시보드에서 생성
- [x] 첫 로그인 시 임시비번 강제 변경 (`is_first_login` 플래그)

### 4. 이용 기간 관리
- [x] `stores` 테이블에 `subscription_start`, `subscription_end`, `is_active` 컬럼 추가
- [x] 만료 또는 `is_active=false` 시 `/admin`, `/m/:storeSlug/:tableId` 접근 차단
- [x] 슈퍼어드민은 `/superadmin`에서 기간/상태 무관 매장 점검 가능
- [x] 만료 또는 `is_active=false` 매장은 슈퍼어드민도 `/admin` 운영 화면으로 런칭하지 않음

### 5. 슈퍼어드민
- [x] `/superadmin` 라우트 — 개발사 전용 패널
- [x] 기능: 매장 CRUD, 점주 계정 생성, 이용기간 설정, 강제 정지
- [x] 슈퍼어드민 식별: `app_metadata.role = 'super_admin'` (RBAC)

### 5-1. 파일럿 멀티테넌트 운영 계약
- [x] 일반 관리자/직원 계정은 **활성 매장 1개** 소속만 허용하는 단일 매장 principal로 취급
- [x] `/admin`, `/admin/kds`의 매장 context는 서버에서 확정하며 일반 사용자의 `?storeId=` override는 신뢰하지 않음
- [x] 주문/대기처럼 id만 받는 운영 mutation은 대상 row의 `store_id`를 먼저 확인하고 활성 매장 guard를 통과한 뒤 실행
- [x] 여러 활성 매장을 한 계정이 운영하는 프랜차이즈 모델은 별도 매장 선택 UX가 생기기 전까지 보류

### 6. 배포 인프라
- [x] 프론트: **Vercel** (React SPA)
- [x] DB/Auth/Realtime/Edge Function: **Supabase**
- [x] 커스텀 백엔드 API: **AWS Lambda** (필요 시)
- [x] 도메인: `tableflow.com`

### 7. URL 구조
- [x] `/m/:storeSlug/:tableId` — 고객 QR 주문
- [x] `/admin` — 점주 어드민
- [x] `/waiting` — 대기 키오스크
- [x] `/login` — 이메일+비번 로그인
- [x] `/superadmin` — 개발사 관리 패널 (신규)

### 8. 실시간
- [x] **Supabase Realtime** (postgres_changes) — 주문·테이블·대기 구독

### 9. 이미지
- [x] **Supabase Storage** (`menu-images` 버킷, public read)

### 10. 다국어
- [x] **한국어만** — 영어 추후

### 11. QR 코드
- [x] 테이블별 QR 일괄 생성
- [x] 출력 없음 — 화면에서 이미지 저장

---

## ⬜ 미결 사항 (Phase 2 이후)

### 카카오 알림톡
- [ ] 대기·주문 알림톡 — 카카오 비즈채널 등록 필요 (1~2주 심사)
- [ ] `send-alimtalk` Supabase Edge Function 구현

### 모바일 앱
- [ ] PWA vs React Native 네이티브 앱

### 프린터 연동
- [ ] 영수증 프린터 (스타, 엡손) Phase 2 포함 여부

### 다점포
- [ ] 프랜차이즈 통합 대시보드 스펙
- [ ] 일반 사용자 다매장 선택 UX 및 권한 모델

### 법적 페이지
- [ ] 개인정보처리방침 / 이용약관

### 운영
- [ ] 계정 삭제 정책 (매장 해지 시 데이터 처리)
- [ ] 주문 데이터 CSV 내보내기
