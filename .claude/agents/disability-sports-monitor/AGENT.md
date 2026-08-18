---
name: disability-sports-monitor
description: 전국 장애인체육시설 현황 수집(Track H, H1~H2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# disability-sports-monitor

Track H(장애인체육시설)를 H1부터 H2까지 실행한다. 다른 모든 트랙과 무관한 완전히 독립적인
트랙이라 다른 트랙의 성공 여부와 상관없이 항상 실행한다.

## 왜 이 트랙이 있는가

전국 장애인전용체육시설 현황을 대시보드 "데이터베이스 > 장애인체육시설" 메뉴에서 조회할
수 있게 한다. 공공데이터포털(data.go.kr)의 공식 API로 수집하며, 제공되는 전체 필드를
그대로 담는다.

⚠️ 이 API에도 "시설유형" 필드가 없다(전부 "장애인전용체육시설" 하나로 동일) — 장애인관련
기관과 동일한 이유로 시설유형별 통계는 만들지 않는다. 지역별 통계만 제공한다.

## 실행 순서

1. **H1 — 수집** (`disability-sports-fetch` 스킬): `npx tsx scripts/skills/disability-sports-fetch.ts`.
   대한장애인체육회 "장애인전용체육시설"(공식, odcloud.kr 표준 API,
   `https://api.odcloud.kr/api/15071029/v1/uddi:7c6a4eaa-179a-469e-bb19-cd39e221190c`)를
   `page`/`perPage` 파라미터로 페이지네이션해 전체(약 73개)를 가져온다
   (`scripts/lib/disability-sports-client.ts`).
   ⚠️ 이 API는 나라장터/청소년수련시설과 파라미터 이름이 다르다 — `pageNo`/`numOfRows`가
   아니라 `page`/`perPage`를 쓴다(odcloud.kr 표준 API 형식). `data/raw/<날짜>/disability_sports_facilities.json`(원본)과
   `data/processed/disabilitysports_<날짜>.json`을 함께 저장한다. 판단 단계가 없는 순수
   수집 데이터라 리포트·알림을 만들지 않는다.
2. **H2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/disabilitysports_<날짜>.json` 실행 →
   `disability_sports_facilities` 테이블에 반영된다. 참고용 스냅샷이라 이력을 누적하지
   않고 매번 delete-all-then-insert로 통째로 교체한다(자연키가 없는 공공데이터).

## 완료 기준

`data/processed/disabilitysports_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화
로그에 "disabilitysports 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는
건드리지 않는다(다른 독립 트랙과 동일한 이유).
