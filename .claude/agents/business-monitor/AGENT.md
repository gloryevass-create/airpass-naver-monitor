---
name: business-monitor
description: 팀 노션(Airpass전략기획 워크스페이스) "사업진행 현황" 데이터베이스 동기화(Track K, K1~K2)를 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# business-monitor

Track K(비즈니스)를 K1부터 K2까지 실행한다. 키워드/경쟁사/뉴스·예산·유튜브·팀일정
데이터와 무관한 완전히 독립적인 트랙이라 다른 트랙의 성공 여부와 상관없이 항상
실행한다.

## 왜 이 트랙이 있는가

팀이 이미 Notion에서 관리하는 "사업진행 현황" 칸반 보드(영업진행→사업제안→
제안서작성→사업수행→사업완료)를 대시보드에서도 그대로 볼 수 있게 미러링한다.
원본은 계속 Notion이다 — 이 트랙은 읽기 전용 동기화만 하고, Notion 쪽 데이터를
쓰거나 수정하지 않는다.

## 실행 순서

1. **K1 — 수집** (`business-projects-fetch` 스킬): `npx tsx scripts/skills/business-projects-fetch.ts`.
   Notion 공식 API(`api.notion.com`, 내부 통합 토큰 인증, calendar-monitor와 같은
   `NOTION_TOKEN` 재사용)로 `NOTION_BUSINESS_DATABASE_ID` 데이터베이스의 전체 항목을
   페이지네이션으로 가져온다(`scripts/lib/notion-client.ts`의 `fetchBusinessProjects`).
   담당자(Notion people 속성)는 사용자 ID만 오므로 `/v1/users`로 이름을 조회해 매핑한다.
   `data/raw/<날짜>/business_projects.json`(원본)과
   `data/processed/businessprojects_<날짜>.json`을 함께 저장한다. 판단 단계가 없는
   순수 수집 데이터라 리포트·알림을 만들지 않는다.
2. **K2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/businessprojects_<날짜>.json`
   실행 → `business_projects`에 `notion_page_id` 기준 upsert된다. Notion에서 삭제된
   항목은 오늘 동기화 결과에 없는 `notion_page_id`로 판단해 함께 삭제한다(원본이
   Notion이므로 그대로 미러링 — 대시보드에만 남아있는 유령 사업을 막기 위함).

## 완료 기준

`data/processed/businessprojects_<날짜>.json`이 스키마 검증을 통과하고 Supabase
동기화 로그에 "businessprojects 트랙 동기화 완료"가 찍히면 끝난 것이다.
`pipeline_runs`는 건드리지 않는다(다른 독립 트랙과 동일한 이유).

## 트러블슈팅

- **Notion API가 404 "object_not_found"를 냄**: 토큰 자체는 유효해도, 대상
  데이터베이스가 이 통합(integration)에 "연결(Connections)"로 공유되지 않은 경우
  발생한다. "행사 및 스케쥴"에 연결했다고 "사업진행 현황"도 자동으로 연결되는 것은
  아니다 — 데이터베이스마다 별도로 연결해야 한다(실측 확인, 2026-08-19).
