---
name: naver-blog-fetch
description: 키워드별 블로그 검색결과 상위 노출(B2, 공식 API)과 경쟁사 전체 포스팅 이력(B3, RSS)을 함께 수집한다. blog-monitor의 핵심 데이터 수집 단계.
---

# naver-blog-fetch

B2와 B3는 데이터 출처가 다르다 — `fetchBlogData()`가 둘 다 호출해 하나의 결과로 합친다.

## B2: 키워드별 블로그 검색결과 (공식 API, SOV용)

원래는 `search.naver.com?where=blog`를 Playwright로 스크래핑할 계획이었다. 실 계정 검증 결과
`search.naver.com/robots.txt`가 모든 봇에 대해 전체 경로를 금지하고 있어(`Disallow: /`)
이 방식을 포기했다(사용자 확인 완료, CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절 참고). 대신
네이버 공식 블로그 검색 오픈API(`openapi.naver.com/v1/search/blog.json`, 개발자센터에서 무료
발급)를 쓴다 — 이 API의 결과 정렬(`sort=sim`, 정확도순)이 실제 검색결과 화면과 완전히 같지는
않을 수 있지만, SOV 계산에는 이걸로 충분하다.

- 월간검색량 상위 `SCRAPE_TARGET_COUNT`(기본 50)개 키워드만 대상으로 한다.
- 키워드마다 블로그 검색 API를 호출해 상위 10개 결과의 블로거 ID를 노출 순서대로 모은다
  (`blog_serp_snapshot.json`).

## B3: 경쟁사 전체 포스팅 이력 (RSS, 포스팅 주기용)

`config/competitors.yaml`의 `blog_id`마다 `https://rss.blog.naver.com/<blog_id>.xml`을 호출해
전체(최근) 게시물 목록을 얻는다.

⚠️ **정책 예외 사항(사용자 확인 완료, 2026-08-17)**: `rss.blog.naver.com/robots.txt`는 모든
User-agent에 대해 `Disallow: /`로 되어 있어 엄밀히는 이 요청이 금지된 경로다. B2(검색 API)만으로는
"우리가 모니터링하는 키워드로 검색했을 때 우연히 걸린 게시물"만 보여서 실제 포스팅 주기(최근
게시일·평균 발행 간격·최근 30일 게시물 수)를 정확히 계산할 수 없다는 문제가 있어, 이 RSS 피드를
예외적으로 쓰기로 했다 — 이 링크는 네이버가 각 블로그 페이지 자체에 "구독용 주소"로 직접
게재해두는 공식 배포 채널이라는 점을 근거로 삼았다(검색결과 스크래핑과는 성격이 다름).
대신:
- 요청 간 1.5초 지연을 둔다(`RSS_REQUEST_DELAY_MS`).
- 경쟁사 5~10곳 정도의 적은 트래픽만 발생시킨다(전체 900+ 키워드가 아니라 등록된 경쟁사 수만큼).
- 특정 경쟁사의 RSS 호출이 실패하면 그 경쟁사만 건너뛰고 경고만 남긴다(전체 파이프라인은 중단하지 않음).
- **운영 중 네이버로부터 접근 제한/차단 요청을 받으면 즉시 이 방식을 중단해야 한다.**

## 실행

```
npx tsx scripts/skills/naver-blog-fetch.ts
```

결과: `data/raw/<오늘>/blog_serp_snapshot.json`(B2), `data/raw/<오늘>/blog_posts.json`(B2+B3
병합, URL 기준 중복 제거 — RSS가 더 완전한 소스라 겹치면 RSS 값으로 덮어씀).

이후 `posting-cadence-analyzer`(B4)와 `sov-calculator`(B5)가 이 두 파일을 입력으로 쓴다.
