---
name: naver-blog-fetch
description: 키워드별 블로그 검색결과 상위 노출(B2)과 그중 경쟁사 게시물(B3)을 네이버 공식 블로그 검색 오픈API로 함께 수집한다. blog-monitor의 핵심 데이터 수집 단계.
---

# naver-blog-fetch

B2(SOV용 검색결과 순위)와 B3(경쟁사 게시물·발행일)를 **하나의 공식 API 호출**로 동시에
얻는다 — `fetchBlogData()`, `scripts/lib/naver-openapi-client.ts::searchBlog`.

## 왜 공식 API인가

원래는 `search.naver.com?where=blog`를 Playwright로 스크래핑할 계획이었다. 실 계정 검증 결과
`search.naver.com/robots.txt`가 모든 봇에 대해 전체 경로를 금지하고 있어(`Disallow: /`)
이 방식을 포기했다(사용자 확인 완료, CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절 참고). 대신
네이버 공식 블로그 검색 오픈API(`openapi.naver.com/v1/search/blog.json`, 개발자센터에서 무료
발급)를 쓴다 — 이 API의 결과 정렬(`sort=sim`, 정확도순)이 실제 검색결과 화면과 완전히 같지는
않을 수 있지만, 유일하게 합법적으로 쓸 수 있는 경로다.

## 절차

- 월간검색량 상위 `SCRAPE_TARGET_COUNT`(기본 50)개 키워드만 대상으로 한다
  (`scripts/lib/keyword-scope.ts`, `getOrComputeScrapeTargets`) — blog-monitor가 ad-monitor 없이
  단독 실행되어도 필요한 raw 데이터를 알아서 만들어 같은 상위 50개 기준을 쓴다.
- 키워드마다 블로그 검색 API를 호출해 상위 10개 결과의 블로거 ID를 노출 순서대로 모은다
  (B2, `blog_serp_snapshot.json`).
- 그 결과 중 `config/competitors.yaml`에 등록된 `blog_id`와 일치하는 게시물만
  `url`/`title`/`postdate`(→ `published_at`)를 추출해 모은다(B3, `blog_posts.json`).
- API 호출이 실패한 키워드는 해당 키워드만 스킵하고 나머지는 계속 진행한다.

## B3 범위 한계 (중요)

이 API에는 "특정 블로거의 전체 글 목록"을 조회하는 기능이 없다. 그래서 B3(포스팅 주기)는
"경쟁사의 전체 블로그 활동"이 아니라 **"우리가 모니터링하는 50개 키워드와 관련해 검색에 잡힌
게시물"**로 범위가 좁혀진다(사용자 확인 완료) — 리포트에 이 범위를 명시해야 한다.

## 실행

```
npx tsx scripts/skills/naver-blog-fetch.ts
```

결과: `data/raw/<오늘>/blog_serp_snapshot.json`(B2), `data/raw/<오늘>/blog_posts.json`(B3).

이후 `posting-cadence-analyzer`(B4)와 `sov-calculator`(B5)가 이 두 파일을 입력으로 쓴다.
