---
name: senior-welfare-monitor
description: 전국 시니어복지시설(경로당) 정보 수집(Track M, M1~M2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# senior-welfare-monitor

Track M(시니어복지시설)을 M1부터 M2까지 실행한다. 다른 모든 트랙과 무관한 완전히 독립적인
트랙이라 다른 트랙의 성공 여부와 상관없이 항상 실행한다.

## 실행 순서

1. **M1 — 수집** (`senior-welfare-fetch` 스킬): `npx tsx scripts/skills/senior-welfare-fetch.ts`.
   행정안전부 "전국마을회관및경로당표준데이터"(공식, `tn_pubr_public_vill_hall_sen_cent_api`)를
   호출한다. 원본은 마을회관과 경로당이 결합된 시설(예: "마을회관및경로당")까지 섞여 있어
   "시니어복지시설"이라는 목적에 맞게 요청 시점에 `flctTyp=경로당` 파라미터로 서버
   필터링해서 순수 경로당만 받는다(사용자 확인, 2026-08-20). 전국 약 3.5만 개소
   규모라 `numOfRows=1000`으로 약 36페이지를 순차 페이지네이션한다.
   `data/raw/<날짜>/senior_welfare_facilities.json`(원본)과
   `data/processed/seniorwelfare_<날짜>.json`을 함께 저장한다. 판단 단계가 없는 순수
   수집 데이터라 리포트·알림을 만들지 않는다.
2. **M2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/seniorwelfare_<날짜>.json`
   실행 → `senior_welfare_facilities` 테이블에 반영된다. 참고용 스냅샷이라 이력을
   누적하지 않고 매번 delete-all-then-insert로 통째로 교체한다(자연키가 없는
   공공데이터).

## 완료 기준

`data/processed/seniorwelfare_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화
로그에 "seniorwelfare 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는
건드리지 않는다(다른 독립 트랙과 동일한 이유).
