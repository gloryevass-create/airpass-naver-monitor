#!/usr/bin/env bash
# cron/launchd가 매일 이 스크립트를 호출한다. Claude Code를 헤드리스(-p)로 실행해서
# CLAUDE.md(오케스트레이터 O1~O4)와 .claude/agents/{ad-monitor,blog-monitor}/AGENT.md를
# 읽고 그 지시대로 동작하게 한다 — 결정적 단계(API 호출·스크래핑·DB 쓰기)는 각 스킬
# 스크립트가 하고, LLM 판단이 필요한 단계(이상치 서술·리포트 작성 등)만 이 세션이 한다.
#
# 로컬 테스트: bash scripts/run-daily.sh
# crontab 예시(매일 KST 07:00 = UTC 22:00):
#   0 22 * * * cd /path/to/airpass-naver-monitor && ./scripts/run-daily.sh >> logs/cron.log 2>&1

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

mkdir -p logs
LOG_FILE="logs/run-$(date +%F).log"

PROMPT='오늘의 네이버 마케팅 모니터링 파이프라인을 실행하세요.

절차:
1. CLAUDE.md의 오케스트레이터 섹션(O1~O4)을 따르세요.
2. .claude/agents/ad-monitor/AGENT.md 지시에 따라 ad-monitor를 먼저 실행하세요(A0~A8).
3. .claude/agents/blog-monitor/AGENT.md 지시에 따라 blog-monitor를 실행하세요(B1~B8).
4. 두 트랙 모두 pipeline_runs에 성공으로 기록된 경우에만 통합 리포트(daily_reports, track=combined)를 생성하세요.
5. 발행 전 체크리스트(O3)를 통과한 것만 output/에 저장하세요.
6. 실패한 단계가 있으면 무엇이 실패했는지, 재시도했는지, 사람 확인이 필요한지 명확히 요약하세요.

오늘 날짜는 시스템 date 명령으로 직접 확인하세요(하드코딩 금지).'

claude -p "$PROMPT" \
  --permission-mode bypassPermissions \
  --output-format json \
  --max-budget-usd "${CLAUDE_MAX_BUDGET_USD:-5}" \
  > "$LOG_FILE" 2>&1

echo "완료. 로그: $LOG_FILE"
