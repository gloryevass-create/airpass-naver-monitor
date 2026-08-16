---
name: naver-blog-fetch
description: 실제 경쟁사 게시물 제목과 겹치는 키워드로 블로그 검색결과 상위 노출(B2, 공식 API)과 전체 포스팅 이력(B3, RSS)을 함께 수집한다. blog-monitor의 핵심 데이터 수집 단계.
---

# naver-blog-fetch

B2와 B3는 데이터 출처가 다르다 — `fetchBlogData()`가 둘 다 호출해 하나의 결과로 합친다.
순서상 B3(RSS)를 먼저 실행하는데, 그 결과가 B2의 검색어를 정하는 데도 쓰이기 때문이다.

## B3: 전체 포스팅 이력 (RSS, 포스팅 주기용) — 먼저 실행됨

`config/competitors.yaml`의 `blog_id`마다(경쟁사 + 에어패스 자체 블로그 모두)
`https://rss.blog.naver.com/<blog_id>.xml`을 호출해 전체(최근) 게시물 목록을 얻는다
(`scripts/lib/blog-rss.ts::getOrFetchRssPosts`, `data/raw/<날짜>/blog_posts_rss.json`에 캐시).

⚠️ **정책 예외 사항(사용자 확인 완료, 2026-08-17)**: `rss.blog.naver.com/robots.txt`는 모든
User-agent에 대해 `Disallow: /`로 되어 있어 엄밀히는 이 요청이 금지된 경로다. 이 RSS 링크는
네이버가 각 블로그 페이지 자체에 "구독용 주소"로 직접 게재해두는 공식 배포 채널이라는 점을
근거로 예외적으로 쓰기로 했다(검색결과 스크래핑과는 성격이 다름). 대신 요청 간 1.5초 지연,
등록된 블로그 수만큼의 적은 트래픽, 실패 시 해당 블로그만 스킵으로 최소화한다. **운영 중
네이버로부터 접근 제한/차단 요청을 받으면 즉시 이 방식을 중단해야 한다.**

## B2: 블로그 검색결과 (공식 API, SOV용)

`search.naver.com?where=blog` 스크래핑은 robots.txt 전면 금지로 포기했다(CLAUDE.md의
"왜 스크래핑을 안 쓰는가" 절 참고). 대신 네이버 공식 블로그 검색 오픈API
(`openapi.naver.com/v1/search/blog.json`, NAVER API HUB에서 발급)를 쓴다.

**검색어 선정(중요, 2026-08-17 변경)**: 원래는 광고 키워드 상위 50개(검색량 기준)로
검색했는데, 그 키워드는 네이버 검색광고 계정에 등록된 제품/카테고리 검색어라 경쟁사가
실제로 블로그에 쓰는 주제(예: "OO학교 AI 융합형 교육실 구축 사례")와 거의 안 겹쳐서 SOV가
항상 0에 가깝게 나오는 문제가 있었다(사용자 확인). 그래서 이제는
`scripts/lib/blog-keyword-scope.ts::getOrComputeBlogContentKeywords`를 쓴다 — B3에서 이미
수집한 실제 게시물 제목에 등장하는 단어와 겹치는 것만 917개 등록 키워드 중에서 골라
(최대 `BLOG_KEYWORD_COUNT`개, 기본 30) B2 검색어로 쓴다. `blog_sov_daily.keyword_id`가
기존 `keywords` 테이블을 참조하는 스키마 제약이 있어(FK), 등록되지 않은 임의의 키워드를
새로 만들 수는 없다 — 그래서 "완전히 새로운 목록"이 아니라 "917개 중 실제 콘텐츠와 맞는
것만 선별"이라는 접근이다. 겹치는 키워드가 하나도 없으면(예: RSS 수집 실패) 기존 방식
(검색량 상위 50개)으로 대체한다.

## 실행

```
npx tsx scripts/skills/naver-blog-fetch.ts
```

결과: `data/raw/<오늘>/blog_content_keywords.json`(B2 검색어 선정 결과),
`data/raw/<오늘>/blog_serp_snapshot.json`(B2), `data/raw/<오늘>/blog_posts.json`(B2+B3
병합, URL 기준 중복 제거).

이후 `posting-cadence-analyzer`(B4)와 `sov-calculator`(B5)가 `blog_posts.json`/
`blog_serp_snapshot.json`을 입력으로 쓴다.
