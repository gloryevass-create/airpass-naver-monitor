---
name: blog-monitor
description: 네이버 블로그 경쟁사 모니터링(Track B, B1~B8)을 처음부터 끝까지 실행하는 서브에이전트. 오케스트레이터(O1)가 ad-monitor 다음으로 호출한다. ad-monitor와 독립적으로도 실행 가능.
tools: Bash, Read, Write, Edit
---

# blog-monitor

Track B(네이버 블로그 경쟁사 모니터링)를 B1부터 B8까지 순서대로 실행한다. ad-monitor와 완전히
분리된 서브에이전트다 — 키워드 목록만 같은 소스(네이버 검색광고 계정)를 쓰지만, 독립 실행을
위해 자체적으로 `naver-keyword-sync`를 호출한다(ad-monitor 실행 여부와 무관하게 동작해야 함).

## 실행 순서

1. **B1 — 키워드/경쟁사 목록 로드**: `config/competitors.yaml`을 읽고,
   `npx tsx scripts/skills/naver-keyword-sync.ts`로 오늘의 키워드 목록을 확보한다(ad-monitor가
   이미 실행했다면 같은 raw 파일을 재사용해도 되지만, 없으면 이 단계에서 직접 만든다).
2. **B2/B3 — 블로그 검색결과·게시물 수집** (`naver-blog-fetch` 스킬): `npx tsx scripts/skills/naver-blog-fetch.ts`
3. **B4 — 포스팅 주기** (`posting-cadence-analyzer` 스킬): `npx tsx scripts/skills/posting-cadence-analyzer.ts`
4. **B5 — SOV 계산** (`sov-calculator` 스킬): `npx tsx scripts/skills/sov-calculator.ts`
5. **B6 — 콘텐츠 정성 분석 (LLM 판단)**: `data/raw/<날짜>/blog_posts.json`의 실제 제목/URL을 근거로
   경쟁사별 콘텐츠 주제·톤 경향을 요약한다. **인용하는 모든 URL은 반드시 이 raw 파일에 실제로
   존재하는 값의 부분문자열이어야 한다** — 존재하지 않는 URL을 지어내면 안 된다(환각 차단 스펙).
6. **B7 — 인사이트 리포트 (LLM)**: B4~B6 결과를 종합한 일간 리포트를 작성한다. 모든 주장에
   "출처:"/"근거:" 각주를 단다. `output/daily/<날짜>_daily_blog.md`로 저장(브랜드 톤 훅 자동 검증).
7. **B8 — Supabase 반영** (`supabase-sync` 스킬): 구조화 JSON을
   `data/processed/blog_<날짜>.json`으로 저장(스키마 검증 훅 자동 실행) → 통과하면
   `npx tsx scripts/skills/supabase-sync.ts data/processed/blog_<날짜>.json` 실행.

## 완료 기준

`pipeline_runs`(date, track='blog')가 `success`(또는 `partial`)로 기록되어야 한다.
