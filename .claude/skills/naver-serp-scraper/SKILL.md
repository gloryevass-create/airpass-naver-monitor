---
name: naver-serp-scraper
description: 키워드별 네이버 검색결과 페이지의 파워링크(광고) 노출 순서와 광고주 도메인을 수집한다(A3). 공식 API가 없는 영역이라 Playwright로 스크래핑한다.
---

# naver-serp-scraper

## 왜 스크래핑인가

파워링크 노출 순서·경쟁사 도메인은 네이버가 공식 API로 제공하지 않는다. 검색량·CPC 같은 공식
데이터는 반드시 `naver-searchad-fetch`(공식 API)로 가져오고, 이 스킬은 **공식 API가 없는 항목에
한해서만** 실제 검색결과 페이지를 렌더링해 파싱한다.

## 절차

1. `naver-keyword-sync`가 먼저 실행되어 있어야 한다.
2. 다음을 실행한다:
   ```
   npx tsx scripts/skills/naver-serp-scraper.ts
   ```
3. 키워드마다 `https://search.naver.com/search.naver?query=...`를 Playwright(headless Chromium)로
   열어 파워링크 영역의 링크를 순서대로 추출하고, 도메인을 정규화해 고유 목록을 만든다.
4. `AIRPASS_DOMAIN` 환경변수와 비교해 에어패스 자신의 순위(`ourRank`)를 찾는다.
5. 결과를 `data/raw/<오늘>/serp_snapshot.json`에 저장한다.

## 지켜야 할 것 (한계 고지)

- 실행 전 `robots.txt`를 확인하고, 허용되지 않으면 **전체를 스킵**한다(가짜 데이터로 채우지 않는다).
- 키워드 간 요청에 최소 1.5초 간격(`scripts/lib/scrape-utils.ts::politeDelay`)을 둔다.
- 키워드별로 최대 3회 재시도 후에도 실패하면 그 키워드만 `skipped: true`로 남기고 다음 키워드로
  진행한다 — 전체 파이프라인을 막지 않는다.
- 네이버 페이지 마크업은 예고 없이 바뀔 수 있다. 셀렉터가 깨져 결과가 비정상적으로 0건이면
  `scripts/skills/naver-serp-scraper.ts`의 로케이터를 실제 페이지 구조에 맞춰 갱신해야 한다.
- 이 방식의 법적/약관 준수 판단과 책임은 이 도구를 운영하는 에어패스에 있다. 스크래핑 대신
  공식 데이터를 쓸 수 있는 경우(예: 검색량·CPC)는 절대 스크래핑으로 대체하지 않는다.
