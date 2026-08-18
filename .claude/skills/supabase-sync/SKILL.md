---
name: supabase-sync
description: A8/B8 — 검증을 통과한 최종 processed JSON(ads_*.json / blog_*.json)을 공유 Supabase 스키마에 upsert하고 pipeline_runs를 갱신한다. 반드시 검증 훅을 통과한 파일에만 실행한다.
---

# supabase-sync

## Spec-First 순서 (반드시 지킬 것)

1. 결정적 단계(A0~A5 또는 B1~B5)의 스크립트를 먼저 실행해 `data/raw/<날짜>/*.json`을 만든다.
2. 이 세션(Claude)이 그 raw 데이터를 근거로 **구조화 JSON**을 작성한다 — 이상치 알림(`alerts`)과
   리포트(`report`)를 포함해서. 이때:
   - 모든 광고비 수치에는 `calc_basis`가, 모든 리포트에는 `source_refs`(인용한 raw 파일 경로 등)가
     반드시 채워져야 한다.
   - `evidence_ref` 없는 알림은 만들지 않는다.
   - "업계 평균적으로" 같은 출처 불명 표현은 쓰지 않는다.
3. 이 JSON을 `data/processed/ads_<날짜>.json`(Track A) 또는 `data/processed/blog_<날짜>.json`
   (Track B)로 저장한다 — **이 저장 자체가 `.claude/settings.json`의 PostToolUse 훅을 트리거해서
   `scripts/validate-schema.ts`가 자동으로 스키마를 검증한다.** 실패하면(exit 2) 파일 저장이
   거부되므로, 그 경우 메시지를 보고 내용을 고쳐 다시 저장한다.
4. 검증을 통과한 뒤에만 다음을 실행한다:
   ```
   npx tsx scripts/skills/supabase-sync.ts data/processed/ads_<날짜>.json
   npx tsx scripts/skills/supabase-sync.ts data/processed/blog_<날짜>.json
   ```
5. 이 스크립트가 하는 일(전부 "코드" — 판단 없음):
   - Supabase `competitors` 테이블(대시보드에서 관리, name unique)을 이름 기준으로 조회해
     `competitor_id` 매핑을 만든다(`scripts/lib/competitors.ts::fetchCompetitorIdMap`).
   - `naver_keyword_id` → `keywords.id`(UUID) 매핑을 조회해 FK를 채운다.
   - 스키마의 unique 제약과 정확히 일치하는 `onConflict`로 각 테이블에 upsert한다
     (`date,keyword_id` / `date,competitor_id,keyword_id` / `date,keyword_id,competitor_id` /
     `date,competitor_id`).
   - 성공/실패를 `pipeline_runs`(그리고 로컬 `output/_pipeline_state.json`)에 기록한다.

## 재사용

모든 upsert 함수는 `scripts/lib/supabase-sync.ts`에 있다 — 새 upsert 경로가 필요해도 이 파일의
함수를 재사용하거나 확장하고, 다른 곳에서 Supabase 클라이언트를 새로 만들지 않는다
(`scripts/lib/supabase-client.ts`가 유일한 진입점).
