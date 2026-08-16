---
name: naver-rank-tracker
description: 검색광고 공식 통계 API(/stats)에서 실제 평균 노출순위(avgRnk)를 가져와 "우리 순위"를 확정한다(A3). 원래는 파워링크 페이지 스크래핑으로 설계했으나 robots.txt 전면 금지로 공식 API 방식으로 전환.
---

# naver-rank-tracker

## 왜 스크래핑이 아니라 API인가

원래 이름(naver-serp-scraper)대로 파워링크 검색결과 페이지를 Playwright로 스크래핑할
계획이었다. 실 계정으로 검증해보니:

1. `search.naver.com/robots.txt`가 **모든 User-agent에 대해 전체 경로를 금지**한다
   (`Disallow: /`) — 셀렉터 문제가 아니라 이 경로 자체를 크롤링하면 안 된다.
2. robots.txt 확인 전 디버깅 단계에서도, 실제 입찰 경쟁이 있는 키워드조차 파워링크
   광고 콘텐츠가 자동화 세션에는 아예 렌더링되지 않았다(네이버의 광고 사기 방지
   조치로 추정 — 조직 검색결과는 정상적으로 나온다).

그래서 "우리 순위"는 검색광고 공식 통계 API(`GET /stats`, `avgRnk` 필드)로 가져온다 —
우리 자신의 실제 광고 집행 데이터라 스크래핑보다 오히려 더 정확하고, robots.txt와도
무관하다(사용자 확인 완료).

## 절차

1. `naver-keyword-sync`/`naver-searchad-fetch`가 먼저 실행되어 있거나,
   `getOrComputeScrapeTargets`가 없으면 알아서 실행한다.
2. 다음을 실행한다:
   ```
   npx tsx scripts/skills/naver-rank-tracker.ts
   ```
3. 월간검색량 상위 `SCRAPE_TARGET_COUNT`(기본 50)개 키워드마다 `/stats` API를
   최근 7일 범위로 호출해, 노출(`impCnt`)이 있었던 가장 최근 날짜의 `avgRnk`를
   `ourRank`로 쓴다. 최근 7일간 노출이 전혀 없었으면 `null`(아직 순위 데이터 없음).
4. 결과는 `data/raw/<오늘>/serp_snapshot.json`에 저장된다(경쟁사 도메인 관련 필드는
   더 이상 없다 — 아래 참고).

## 경쟁사 파워링크 노출은 수집하지 않는다

"경쟁사가 어떤 도메인으로 파워링크에 노출되는지"는 네이버가 제3자에게 공개하는
공식 API가 없고, 스크래핑도 robots.txt로 막혀 있어 자동 수집을 포기했다(사용자
확인 완료). `ad-spend-estimator` 스킬은 이제 항상 빈 결과를 반환하며, 리포트에는
이 사실을 그대로 명시한다 — 근거 없는 추정치를 지어내지 않는다.
