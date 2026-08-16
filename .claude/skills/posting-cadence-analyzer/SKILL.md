---
name: posting-cadence-analyzer
description: 경쟁사 블로그 게시물 목록(B3 결과)으로 평균 발행 간격·최근 게시일·최근 30일 게시물 수를 계산한다(B4).
---

# posting-cadence-analyzer

## 절차

1. `naver-blog-fetch`가 먼저 실행되어 `data/raw/<오늘>/blog_posts.json`이 있어야 한다.
2. 다음을 실행한다:
   ```
   npx tsx scripts/skills/posting-cadence-analyzer.ts
   ```
3. 경쟁사별로:
   - `avg_interval_days`: 발행일 사이 간격의 평균(게시물이 2개 미만이면 `null`)
   - `last_post_at`: 가장 최근 발행일
   - `post_count_30d`: 오늘 기준 최근 30일 이내 게시물 수
4. 결과는 `data/raw/<오늘>/posting_cadence.json`에 저장되고, `ad-monitor`/`blog-monitor`
   실행 시 최종적으로 `posting_cadence` 테이블에 upsert된다.

## 활용

`avg_interval_days`가 이전 대비 급격히 짧아졌다면(포스팅 급증) B6/B7 단계에서 "콘텐츠 마케팅
강화 시그널"로 다룰 근거가 된다 — 이 스킬 자체는 계산만 하고 해석은 하지 않는다.
