# Waiting Notification Failure Runbook

## 목적
웨이팅 알림톡 발송 실패(`waiting_created`, `waiting_called`)를 운영자가 어드민에서 확인하고 수동 재시도하는 절차를 정의한다.

## 범위
- 대상 이벤트:
  - `waiting_created` (대기 등록 알림)
  - `waiting_called` (입장 호출 알림)
- 현재 정책:
  - 자동 백그라운드 재시도 없음
  - 어드민 수동 재시도만 지원

## 어디서 확인하나
- 경로: `/admin` → `웨이팅`
- 위치: 화면 상단 `알림 재시도 필요` 카드

## 카드에 표시되는 정보
- 실패 유형: `대기 등록 알림 실패` / `입장 호출 알림 실패`
- 실패 경과 시간
- 대기번호
- 전화번호
- 최근 오류 메시지

## 재시도 가능 조건
- 전화번호가 있어야 한다.
- `waiting_created` 실패 건은 해당 대기 상태가 아직 `waiting` 이어야 한다.
- `waiting_called` 실패 건은 해당 대기 상태가 아직 `called` 이어야 한다.

## 재시도 불가 조건
- 전화번호 없음
- 대기 상태가 이미 `completed`, `cancelled`, `no_show` 등으로 바뀜
- 이벤트와 현재 상태가 맞지 않음

## 운영 절차
1. `/admin` → `웨이팅` 탭 진입
2. `알림 재시도 필요` 카드에서 실패 건 확인
3. 오류 메시지와 현재 대기 상태를 확인
4. 버튼이 `알림 재시도` 이면 1회 클릭
5. 결과 확인
   - 성공: `알림 재시도 요청을 보냈습니다.` toast
   - 실패: 오류 toast, 실패 건 유지
6. 버튼이 `재시도 불가` 이면 수동 연락 또는 현장 안내로 전환
7. 동일 건이 반복 실패하거나 여러 매장에서 동시 발생하면 Solapi/Kakao 장애로 간주하고 에스컬레이션

## 운영 체크 타이밍
- 영업 시작 직후
- 교대 전 인수인계 시
- Solapi/Kakao 템플릿 변경 직후
- 고객이 “문자를 못 받았다”고 신고한 직후

## DB 확인이 필요할 때
```sql
SELECT id, waiting_id, event, status, error_msg, sent_at, created_at
FROM waiting_notifications
WHERE store_id = :store_id
  AND event IN ('waiting_created', 'waiting_called')
ORDER BY created_at DESC;
```

## 성공 상태 판단
- 성공 재시도 후 기대값:
  - `status = 'sent'`
  - `sent_at IS NOT NULL`
  - 해당 항목이 실패 목록에서 제거됨
