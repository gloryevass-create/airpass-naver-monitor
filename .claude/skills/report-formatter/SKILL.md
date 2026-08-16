---
name: report-formatter
description: 일간/주간/월간 자연어 리포트를 파일명 규칙에 맞춰 output/에 저장한다(A7/B7/O2 산출물). 저장 전 brand-tone-checker 훅을 통과해야 한다.
---

# report-formatter

## 파일명 규칙

`[작성일]_[문서유형]_[영역명].md` — 예: `2026-08-16_daily_ad.md`, `2026-08-16_weekly_combined.md`.

`scripts/lib/report-formatter.ts::reportFilePath(date, reportType, track)`가 이 규칙대로 경로를
만들어준다. 직접 경로 문자열을 조립하지 말고 이 함수를 쓴다(오탈자로 인한 훅 매칭 실패 방지).

- `reportType`: `daily` | `weekly` | `monthly` → `output/daily/`, `output/weekly/`, `output/monthly/`
- `track`: `ad` | `blog` | `combined`

## 절차

1. 리포트 본문(`content_md`)을 작성한다. 반드시:
   - 각 수치 주장에 대해 "출처:" 또는 "근거:"로 원본 raw 파일 경로나 계산식을 각주로 남긴다.
   - 과장 표현("업계 최고", "무조건", "100% 확실" 등)을 쓰지 않는다.
   - 날짜는 항상 `YYYY-MM-DD` 형식으로 쓴다.
2. `Write` 도구로 `output/<reportType>/<날짜>_<reportType>_<track>.md`에 저장한다 — 이 저장이
   `.claude/settings.json`의 훅을 트리거해 `scripts/brand-tone-check.ts`가 자동 검증한다.
   실패하면 저장이 거부되니 지적된 부분을 고쳐 다시 저장한다.
3. 같은 내용을 Supabase `daily_reports` 테이블에도 upsert해야 한다(원본은 Supabase, 로컬 md는
   백업/감사용) — `supabase-sync` 스킬(A8/B8/O2)이 `data/processed/*.json`의 `report` 필드를
   통해 이 작업을 함께 수행하므로, 로컬 md 저장과 Supabase 저장이 서로 다른 내용이 되지 않도록
   같은 `content_md`를 양쪽에 쓴다.

## O2 — 통합 리포트

일간/블로그 두 리포트가 모두 성공(`pipeline_runs`에 `ad`, `blog` 둘 다 `success`)했을 때만
`track=combined` 리포트를 생성한다. 하나라도 실패했다면 통합 리포트를 만들지 않고, 어떤 트랙이
실패했는지와 그 이유를 요약해 사람에게 알린다.
