---
name: calendar-monitor
description: 팀 노션(Airpass전략기획 워크스페이스) "행사 및 스케쥴" 데이터베이스 동기화(Track E, E1~E2)를 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# calendar-monitor

Track E(팀 일정)를 E1부터 E2까지 실행한다. 키워드/경쟁사/뉴스·예산·유튜브 데이터와
무관한 완전히 독립적인 트랙이라 다른 트랙의 성공 여부와 상관없이 항상 실행한다.

## 왜 이 트랙이 있는가

팀이 이미 Notion에서 관리하는 "행사 및 스케쥴" 캘린더(박람회 방문·현장 미팅·공사 일정
등)를 대시보드에서도 그대로 볼 수 있게 미러링한다. 원본은 계속 Notion이다 — 이 트랙은
읽기 전용 동기화만 하고, Notion 쪽 데이터를 쓰거나 수정하지 않는다.

## 실행 순서

1. **E1 — 수집** (`notion-events-fetch` 스킬): `npx tsx scripts/skills/notion-events-fetch.ts`.
   Notion 공식 API(`api.notion.com`, 내부 통합 토큰 인증)로 `NOTION_EVENTS_DATABASE_ID`
   데이터베이스의 전체 항목을 페이지네이션으로 가져온다(`scripts/lib/notion-client.ts`).
   담당자/참석자(Notion people 속성)는 사용자 ID만 오므로 `/v1/users`로 이름을 조회해
   매핑한다. `data/raw/<날짜>/notion_events.json`(원본)과
   `data/processed/events_<날짜>.json`을 함께 저장한다. 판단 단계가 없는 순수 수집
   데이터라 리포트·알림을 만들지 않는다.
2. **E2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/events_<날짜>.json` 실행 →
   `team_events`에 `notion_page_id` 기준 upsert된다. Notion에서 삭제된 항목은 오늘
   동기화 결과에 없는 `notion_page_id`로 판단해 함께 삭제한다(원본이 Notion이므로
   그대로 미러링 — 대시보드에만 남아있는 유령 일정을 막기 위함).

## 완료 기준

`data/processed/events_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화 로그에
"events 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는 건드리지 않는다
(news/budget/youtube와 동일한 이유 — 다른 트랙과 무관하게 항상 독립적으로 실행되므로
게이팅 대상이 아니다).

## 트러블슈팅

- **Notion API가 404 "object_not_found"를 냄**: 토큰 자체는 유효해도, 대상 데이터베이스가
  이 통합(integration)에 "연결(Connections)"로 공유되지 않은 경우 발생한다. Notion
  워크스페이스에서 데이터베이스(또는 그 상위 페이지)를 열어 "···" → "연결"에서 이
  통합을 추가해야 한다. 캘린더 "뷰" 페이지가 아니라 실제 데이터베이스(원본) 쪽에
  연결해야 한다는 점에 유의 — 뷰 페이지에만 연결해도 원본 데이터베이스 접근권은
  전달되지 않는다(실측 확인, 2026-08-18).
