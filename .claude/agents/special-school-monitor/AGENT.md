---
name: special-school-monitor
description: 전국 특수학교현황 수집(Track J, J1~J2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# special-school-monitor

Track J(특수학교현황)를 J1부터 J2까지 실행한다. 다른 모든 트랙과 무관한 완전히 독립적인
트랙이라 다른 트랙의 성공 여부와 상관없이 항상 실행한다.

## 실행 순서

1. **J1 — 수집** (`special-school-fetch` 스킬): `npx tsx scripts/skills/special-school-fetch.ts`.
   교육부 국립특수교육원 "특수학교현황"(공식, odcloud.kr 표준 API,
   `https://api.odcloud.kr/api/15052682/v1/uddi:80cefa55-5b53-4bdb-9ef3-998945a82761`)을
   `page`/`perPage` 파라미터로 호출한다. 전국 196개교 규모라 `perPage=250` 한 번의 호출로
   전체가 수집된다(실측 확인, 2026-08-18) — `youth_facilities`처럼 페이지네이션 루프가
   필요한 규모가 아니다. `data/raw/<날짜>/special_schools.json`(원본)과
   `data/processed/specialschools_<날짜>.json`을 함께 저장한다. 판단 단계가 없는 순수
   수집 데이터라 리포트·알림을 만들지 않는다.
2. **J2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/specialschools_<날짜>.json` 실행 →
   `special_schools` 테이블에 반영된다. 참고용 스냅샷이라 이력을 누적하지 않고 매번
   delete-all-then-insert로 통째로 교체한다(자연키가 없는 공공데이터).

## 완료 기준

`data/processed/specialschools_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화
로그에 "specialschools 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는
건드리지 않는다(다른 독립 트랙과 동일한 이유).
