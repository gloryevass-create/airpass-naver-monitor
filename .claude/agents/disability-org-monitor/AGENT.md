---
name: disability-org-monitor
description: 전국 장애인관련기관(장애인단체) 현황 수집(Track G, G1~G2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# disability-org-monitor

Track G(장애인관련기관)를 G1부터 G2까지 실행한다. 키워드/경쟁사/뉴스·예산·유튜브·팀 일정·
청소년관련기관 데이터와 무관한 완전히 독립적인 트랙이라 다른 트랙의 성공 여부와 상관없이
항상 실행한다.

## 왜 이 트랙이 있는가

전국 장애인단체 현황을 대시보드 "데이터베이스 > 장애인관련기관" 메뉴에서 조회할 수 있게
한다. 공공데이터포털(data.go.kr)의 공식 API로 수집하며, 제공되는 전체 필드(12개)를 그대로
담는다.

⚠️ 이 API에는 "시설유형" 필드가 없다(전부 "단체" 하나로 동일) — 청소년관련기관과 달리
시설유형별 통계는 만들지 않는다(사용자 확인, 2026-08-18). 지역별 통계만 제공한다.

## 실행 순서

1. **G1 — 수집** (`disability-org-fetch` 스킬): `npx tsx scripts/skills/disability-org-fetch.ts`.
   보건복지부 "전국장애인단체표준데이터"(공식,
   `https://api.data.go.kr/openapi/tn_pubr_public_disabled_orgs_api`)를 `numOfRows=1000`
   단위로 페이지네이션해 전체(약 605개)를 가져온다(`scripts/lib/disability-org-client.ts`).
   `data/raw/<날짜>/disability_organizations.json`(원본)과
   `data/processed/disabilityorgs_<날짜>.json`을 함께 저장한다. 판단 단계가 없는 순수 수집
   데이터라 리포트·알림을 만들지 않는다.
2. **G2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/disabilityorgs_<날짜>.json` 실행 →
   `disability_organizations` 테이블에 반영된다. 참고용 스냅샷이라 이력을 누적하지 않고
   매번 delete-all-then-insert로 통째로 교체한다(자연키가 없는 공공데이터).

## 완료 기준

`data/processed/disabilityorgs_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화
로그에 "disabilityorgs 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는
건드리지 않는다(다른 독립 트랙과 동일한 이유).
