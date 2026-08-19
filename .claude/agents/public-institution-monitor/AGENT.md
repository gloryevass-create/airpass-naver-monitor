---
name: public-institution-monitor
description: 전국 공공기관 웹사이트 정보 수집(Track L, L1~L2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# public-institution-monitor

Track L(공공기관정보)을 L1부터 L2까지 실행한다. 다른 모든 트랙과 무관한 완전히 독립적인
트랙이라 다른 트랙의 성공 여부와 상관없이 항상 실행한다.

## 실행 순서

1. **L1 — 수집** (`public-institution-fetch` 스킬): `npx tsx scripts/skills/public-institution-fetch.ts`.
   행정안전부 "공공기관 웹,모바일웹 사이트 정보"(공식, odcloud.kr 표준 API,
   `https://api.odcloud.kr/api/15050540/v1/uddi:7ef4e778-78c3-4a6c-9faf-dd5c5d1f443e`)를
   `page`/`perPage` 파라미터로 호출한다. 전국 591개 기관 규모라 `perPage=1000` 한 번의
   호출로 전체가 수집된다(실측 확인, 2026-08-19). `data/raw/<날짜>/public_institutions.json`
   (원본)과 `data/processed/publicinstitutions_<날짜>.json`을 함께 저장한다. 판단 단계가
   없는 순수 수집 데이터라 리포트·알림을 만들지 않는다.
   ⚠️ 이 API는 실제 물리 주소가 아니라 웹사이트 URL을 "주소" 필드에 담아 준다(데이터셋
   이름 그대로 웹/모바일웹 사이트 디렉터리다) — 실측 확인 시 `사이트구분` 필드는 전부
   "웹"으로 고정돼 있었다(모바일웹 항목은 실제로 없음, 2026-08-19).
2. **L2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/publicinstitutions_<날짜>.json`
   실행 → `public_institutions` 테이블에 반영된다. 참고용 스냅샷이라 이력을 누적하지
   않고 매번 delete-all-then-insert로 통째로 교체한다(자연키가 없는 공공데이터).

## 완료 기준

`data/processed/publicinstitutions_<날짜>.json`이 스키마 검증을 통과하고 Supabase
동기화 로그에 "publicinstitutions 트랙 동기화 완료"가 찍히면 끝난 것이다.
`pipeline_runs`는 건드리지 않는다(다른 독립 트랙과 동일한 이유).
