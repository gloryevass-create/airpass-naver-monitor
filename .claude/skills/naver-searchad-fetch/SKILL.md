---
name: naver-searchad-fetch
description: naver-keyword-sync가 확정한 키워드들의 월간검색수·경쟁정도·예상입찰가를 네이버 검색광고 API로 조회한다(A2). ad-monitor 두 번째 단계.
---

# naver-searchad-fetch

## 절차

1. `naver-keyword-sync`가 먼저 실행되어 `data/raw/<오늘>/keywords_synced.json`이 있어야 한다.
2. 다음을 실행한다:
   ```
   npx tsx scripts/skills/naver-searchad-fetch.ts
   ```
3. `/keywordstool` API를 5개씩 배치 호출해 `monthlyPcQcCnt`(PC 월간검색수),
   `monthlyMobileQcCnt`(모바일 월간검색수), `compIdx`(경쟁정도)를 가져온다.
4. 결과를 `data/raw/<오늘>/searchad_stats.json`에 저장한다.
5. "우리 순위"(`our_rank`)는 이 API가 아니라 `naver-serp-scraper`(A3)에서 채워진다 — 이 스킬은
   검색량/경쟁정도/입찰가만 담당한다.

## 주의사항

- 계정에 등록된 키워드 수가 많으면(10~30개 기준) 배치 호출 사이에 짧은 지연을 두는 것을 고려한다.
- 특정 배치가 실패해도 나머지 배치는 계속 진행한다(부분 실패 허용, `pipeline_runs` status는
  이후 A8에서 `partial`로 기록될 수 있음).
