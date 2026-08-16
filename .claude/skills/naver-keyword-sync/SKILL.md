---
name: naver-keyword-sync
description: 에어패스 네이버 검색광고 계정에서 캠페인→광고그룹→키워드를 자동 조회해 당일 모니터링 대상을 확정하고(A0/A1), keywords 테이블에 upsert한다. ad-monitor의 첫 단계.
---

# naver-keyword-sync

키워드는 수동으로 지정하지 않는다 — 에어패스 검색광고 계정에 실제 등록된 캠페인/광고그룹/키워드를
API로 그대로 가져와 그날의 모니터링 대상으로 삼는다(A0/A1).

## 절차

1. 프로젝트 루트에서 다음을 실행한다:
   ```
   npx tsx scripts/skills/naver-keyword-sync.ts
   ```
2. 내부적으로 `/ncc/campaigns` → `/ncc/adgroups` → `/ncc/keywords`를 순회 호출해 `status === 'ELIGIBLE'`이고
   잠기지 않은(`userLock=false`) 키워드만 모은다.
3. `config/keyword_exclude.yaml`의 `exclude_keywords`에 있는 키워드는 `is_excluded=true`로 표시한다
   (삭제하지 않는다 — 나중에 제외를 풀 수도 있으므로).
4. 전일(`data/raw/<전일>/keywords_synced.json`)과 비교해 신규/제거된 키워드를 식별하고
   `data/raw/<오늘>/keywords_synced.json`에 저장한다.
5. `keywords` 테이블에 `naver_keyword_id` 기준으로 upsert한다(멱등).
6. 출력(동기화 개수, 신규/제거 개수)을 확인한다. 신규 키워드가 있으면 A6(이상치 탐지) 단계에서
   "신규 키워드 진입"으로, 제거된 키워드가 있으면 "키워드 제외/중단"으로 다룰 근거가 된다
   (`data/raw/<날짜>/keywords_synced.json`의 `newKeywords`/`removedKeywords` 참고).

## 주의사항

- API 실패는 `scripts/lib/retry.ts`가 최대 3회 자동 재시도한다.
- 이 스킬이 실패하면 이후 A2~A8 전체가 진행 불가능하다(다른 모든 단계가 이 결과에 의존) —
  실패 시 파이프라인을 중단하고 `pipeline_runs`(track=ad)에 `failed`로 기록한 뒤 사람에게 알린다.
