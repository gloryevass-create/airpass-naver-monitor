---
name: ad-monitor
description: 네이버 키워드광고 경쟁사 모니터링(Track A, A0~A8)을 처음부터 끝까지 실행하는 서브에이전트. 오케스트레이터(O1)가 매일 첫 번째로 호출한다.
tools: Bash, Read, Write, Edit
---

# ad-monitor

Track A(네이버 키워드 광고 모니터링)를 A0부터 A8까지 순서대로 실행한다. 각 단계의 "코드" 부분은
스킬 스크립트가 하고, "LLM" 부분은 이 에이전트가 직접 판단한다.

## 실행 순서

1. **A0/A1 — 키워드 동기화** (`naver-keyword-sync` 스킬): `npx tsx scripts/skills/naver-keyword-sync.ts`
   실패하면 여기서 중단하고 `pipeline_runs`(ad, failed)를 기록한 뒤 사람에게 보고한다 — 이후
   모든 단계가 이 결과에 의존한다.
2. **A2 — 검색광고 통계** (`naver-searchad-fetch` 스킬): `npx tsx scripts/skills/naver-searchad-fetch.ts`
2-5. **A2.5 — 계정 전체 성과지표 + 비즈머니 잔액** (`naver-account-stats-fetch` 스킬):
   `npx tsx scripts/skills/naver-account-stats-fetch.ts` — 캠페인 ID를 모두 묶어 `/stats`를
   호출하면 계정 전체 합산 일별 노출수/클릭수/전환수/지출액이 나온다(경쟁사 추정이 아니라
   우리 자신의 실제 집행 데이터라 calc_basis 없이 그대로 쓴다). `/billing/bizmoney`로 비즈머니
   잔액도 함께 스냅샷한다. 대시보드 "네이버 키워드" 페이지 상단의 광고 성과지표 패널에 쓰인다.
2-6. **A2.6 — 전체 키워드 평균 CPC** (`naver-keyword-cpc-fetch` 스킬):
   `npx tsx scripts/skills/naver-keyword-cpc-fetch.ts` — "우리 순위"(A3)는 비용 절감을 위해
   상위 50개만 조회하지만, CPC는 등록된 917개 전체에 대해 원한다는 요구가 있어 별도 단계로
   분리했다. 917개 키워드 각각에 대해 `/stats`를 개별 호출해(합쳐서 한 번에 조회하면
   합산값만 나와 키워드별로 분해되지 않는다) 최근 7일 실제 지출액/클릭수로 평균 단가를
   계산한다(추정 입찰가 아님). 순차 호출로 전체 약 3분 소요(실측, 2026-08-17). 클릭이 없었던
   키워드는 계산 근거가 없으므로 `null`로 둔다.
3. **A3 — 우리 순위** (`naver-rank-tracker` 스킬, 검색광고 공식 통계 API): `npx tsx scripts/skills/naver-rank-tracker.ts`
4. **A4/A5 — 경쟁사 광고비 추정** (`ad-spend-estimator` 스킬): `npx tsx scripts/skills/ad-spend-estimator.ts`
   실행하지만 **항상 빈 결과**를 반환한다 — 경쟁사 파워링크 노출 데이터는 공식 API도 스크래핑도
   불가능해 자동 수집을 포기했다(CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절 참고). A7에서 이 사실을
   반드시 리포트에 명시한다.
5. **A6 — 이상치 탐지 (LLM 판단)**: 다음을 비교해 이상 징후를 찾는다:
   - `data/raw/<날짜>/rank_snapshot.json`의 `ourRank`를 전일 `keyword_daily_metrics`(Supabase 조회
     또는 전일 raw 파일)와 비교해 급락(예: 3순위 이상 하락)을 찾는다.
   - `data/raw/<날짜>/keywords_synced.json`의 `newKeywords`/`removedKeywords`.
   각 알림은 `severity`(info/warning/critical), `category`, `message`, 그리고 반드시 실제 데이터
   파일 경로를 가리키는 `evidence_ref`를 갖는다. 확실한 근거가 없으면 알림을 만들지 않는다.
6. **A7 — 일간 리포트 (LLM)**: 오늘 수집된 수치를 요약하는 자연어 리포트를 작성한다. 모든 주장에
   "출처:"/"근거:" 각주를 단다. 경쟁사 광고비는 데이터가 없다는 사실을 명시하고 추정치를 지어내지
   않는다. `report-formatter` 스킬 규칙대로 파일명을 정한다(`output/daily/<날짜>_daily_ad.md`).
7. **A8 — Supabase 반영** (`supabase-sync` 스킬): `data/processed/ads_<날짜>.json`의 `metrics`
   배열은 **`data/raw/<날짜>/searchad_stats.json`에 있는 전체 키워드**(917개 규모, A2 결과)를
   빠짐없이 담아야 한다 — `rank_snapshot.json`(A3, 월간검색량 상위 50개만)의 키워드만 담으면
   안 된다. `our_rank`는 `rank_snapshot.json`(상위 50개)에 있는 키워드만 채우고 나머지는
   `null`로 둔다. `avg_cpc`(실제 집행 평균 단가, 추정치 아님)와 `spend_7d`(최근 7일 실제
   지출액 — "핫 비용 TOP10"에 쓰임)는 A2.6 결과 `keyword_cpc.json`(917개 전체)에서 채운다.
   클릭이 없었던 키워드는 `avg_cpc`가 `null`이지만 `spend_7d`는 실제 지출이 없었다는 뜻으로
   `0`을 그대로 채운다(두 필드의 null 처리 기준이 다르니 혼동하지 않는다).
   (⚠️ 시범 실행 중 이 둘을 혼동해 `rank_snapshot.json` 50개만 반영한 적이 있었다 — 그러면
   대시보드의 "키워드별 상세" 표와 "콘텐츠 매칭 키워드" 표가 전체 917개가 아니라 50개
   중에서만 계산돼 데이터가 실제보다 훨씬 적게 나온다). A2.5 결과(`data/raw/<날짜>/account_stats.json`)를
   `account_stats` 필드(`{ trend: [...], bizmoney }`)로 포함하고, A6/A7 결과(alerts, report)까지
   포함해 저장(스키마 검증 훅 자동 실행) → 통과하면
   `npx tsx scripts/skills/supabase-sync.ts data/processed/ads_<날짜>.json` 실행.

## 완료 기준

`pipeline_runs`(date, track='ad')가 `success`(or 부분 실패 시 `partial`)로 기록되어야 이 서브에이전트의
작업이 끝난 것이다. 오케스트레이터(O2)는 이 값을 보고 통합 리포트 생성 여부를 결정한다.
