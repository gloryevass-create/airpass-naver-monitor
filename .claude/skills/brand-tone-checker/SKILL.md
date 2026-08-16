---
name: brand-tone-checker
description: output/**/*.md 저장 시 자동 실행되는 발행 전 체크리스트 훅(O3) — 톤·출처 명시·과장 표현 금지·날짜 형식을 검사한다. 직접 호출할 필요는 거의 없다(훅이 자동 실행).
---

# brand-tone-checker

이 스킬은 대부분 직접 실행할 일이 없다 — `.claude/settings.json`의 `PostToolUse` 훅이
`output/daily/**/*.md`, `output/weekly/**/*.md`, `output/monthly/**/*.md`에 대한 `Write`/`Edit`을
가로채 자동으로 `scripts/brand-tone-check.ts <파일경로>`를 실행하기 때문이다.

## 검사 항목

1. 파일명이 `YYYY-MM-DD_문서유형_영역명.md` 규칙을 따르는가.
2. 과장/출처 불명 표현("업계 최고", "업계 평균적으로", "무조건", "100% 확실", "보장합니다" 등)이
   없는가.
3. 본문에 "출처:" 또는 "근거:" 표기가 최소 1회 이상 있는가.
4. 날짜가 점(`.`)이나 슬래시(`/`)가 아니라 하이픈(`-`)으로 표기되어 있는가.

## 실패 시

훅이 `exit 2`를 반환하면 파일 저장 자체가 거부된다(아직 output/에 존재하지 않음). 에러 메시지에
나열된 항목을 고쳐서 다시 `Write`를 시도한다 — 검사를 우회하거나 훅을 비활성화하지 않는다.

## 수동 실행 (디버깅용)

```
npx tsx scripts/brand-tone-check.ts output/daily/2026-08-16_daily_ad.md
```
