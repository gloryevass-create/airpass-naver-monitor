---
name: youtube-monitor
description: 에어패스 공식 유튜브 채널(@AIRPASS_XR) 운영 현황 수집(Track Y, Y1~Y2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# youtube-monitor

Track Y(유튜브 채널 분석)를 Y1부터 Y2까지 실행한다. 키워드/경쟁사/뉴스·예산 데이터와
무관한 완전히 독립적인 트랙이라 다른 트랙의 성공 여부와 상관없이 항상 실행한다.

## 왜 이 트랙이 있는가

에어패스 공식 유튜브 채널(@AIRPASS_XR)의 구독자·조회수 성장 추이와 영상별 성과(조회수·
좋아요·댓글수)를 대시보드에서 확인할 수 있게 한다. YouTube Data API v3(공식, API 키
인증)로 수집한다 — OAuth 불필요, 공개 채널·영상 통계만 조회한다(비공개 시청 지속시간·
트래픽 소스·인구통계 등은 YouTube Analytics API가 별도로 필요하며 OAuth 동의가 있어야
해서 이 트랙 범위 밖이다).

## 실행 순서

1. **Y1 — 채널·영상 수집** (`youtube-fetch` 스킬): `npx tsx scripts/skills/youtube-fetch.ts`.
   `YOUTUBE_CHANNEL_HANDLE` 환경변수(예: `AIRPASS_XR`, `@` 없이)로 채널을 찾아 통계(구독자
   수·전체 조회수·영상 수)와 업로드 재생목록의 전체 영상을 가져온다. 영상이 많으면
   `playlistItems`/`videos` 양쪽 다 최대 50개씩 페이지네이션한다(`scripts/lib/youtube-client.ts`).
   `data/raw/<날짜>/youtube.json`(원본 스냅샷)과 `data/processed/youtube_<날짜>.json`을
   함께 저장한다. 판단 단계가 없는 순수 수집 데이터라 리포트·알림을 만들지 않는다.
   ⚠️ `new URL(path, BASE_URL)`을 쓸 때 `path`가 `/`로 시작하면 BASE_URL의 경로 부분이
   사라진다(WHATWG URL 스펙) — 반드시 문자열 결합(`${BASE_URL}${path}`)으로 만든다
   (실측으로 확인한 함정, 2026-08-17).
2. **Y2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/youtube_<날짜>.json` 실행 →
   `youtube_channel_stats`(그날 스냅샷, `date` 기준 upsert)와 `youtube_videos`(전체
   영상을 매일 다시 조회해 최신 통계로 `video_id` 기준 upsert)에 반영된다.

## 완료 기준

`data/processed/youtube_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화 로그에
"youtube 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는 건드리지 않는다
(news/budget과 동일한 이유 — 다른 트랙과 무관하게 항상 독립적으로 실행되므로 게이팅
대상이 아니다).
