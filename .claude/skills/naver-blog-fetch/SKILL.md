---
name: naver-blog-fetch
description: 키워드별 블로그 검색결과 상위 노출(B2)과 경쟁사 블로그 게시물 목록·발행일(B3)을 수집한다. blog-monitor의 핵심 데이터 수집 단계.
---

# naver-blog-fetch

두 가지를 한 스크립트가 처리한다 — 데이터 출처가 다르기 때문에 방식도 다르다.

## B2: 키워드별 블로그 검색결과 (스크래핑)

- `https://search.naver.com/search.naver?where=blog&query=...`를 Playwright로 렌더링해 상위 10개
  게시물의 블로거 ID를 노출 순서대로 추출한다.
- 네이버 공식 블로그 검색 오픈API(openapi.naver.com)가 있지만, 그 정렬은 실제 검색결과 화면과
  다를 수 있어(A3와 같은 이유) SOV 계산에는 실제 검색결과 페이지를 쓴다.
- `naver-serp-scraper`와 동일한 원칙을 지킨다: robots.txt 확인, 요청 간 최소 지연,
  실패 시 해당 키워드만 스킵.

## B3: 경쟁사 블로그 게시물·발행일 (RSS)

- `config/competitors.yaml`의 `blog_id`마다 `https://rss.blog.naver.com/<blog_id>.xml` 공식 RSS
  피드를 호출한다 — 이 부분은 스크래핑이 아니라 네이버가 공식 제공하는 피드이므로 더 안정적이다.
- RSS 항목에서 `title`, `link`, `pubDate`를 추출해 게시물 목록을 만든다.
- 특정 경쟁사의 RSS 호출이 실패하면 그 경쟁사만 건너뛰고 경고를 남긴다.

## 실행

```
npx tsx scripts/skills/naver-blog-fetch.ts
```

결과: `data/raw/<오늘>/blog_serp_snapshot.json`(B2), `data/raw/<오늘>/blog_posts.json`(B3).

이후 `posting-cadence-analyzer`(B4)와 `sov-calculator`(B5)가 이 두 파일을 입력으로 쓴다.
