# airpass-naver-monitor

에어패스 네이버 마케팅 모니터링 — 백그라운드 수집 에이전트. 매일 자동으로 네이버 키워드광고·
블로그 경쟁사 현황을 수집해 웹 대시보드(`airpass-naver-dashboard`)가 읽는 Supabase 프로젝트에
채워 넣는다. 아키텍처·오케스트레이션 상세는 [`CLAUDE.md`](./CLAUDE.md)를 참고하세요.

## 필요한 값

시작하기 전에 아래 값이 필요합니다(임의로 지어내지 않고 실제 값을 받아야 동작합니다):

1. **Supabase**: `airpass-naver-dashboard`에서 만든 것과 **같은 프로젝트**의 URL과
   `service_role` 키 (⚠️ 이 키는 RLS를 우회하므로 절대 공개 저장소에 커밋하지 마세요)
2. **네이버 검색광고 API**: `CUSTOMER_ID`, `API_KEY`, `SECRET_KEY`
   ([searchad.naver.com](https://searchad.naver.com) → 광고시스템 → 도구 → API 관리에서 발급)
3. **에어패스 자체 도메인** (`AIRPASS_DOMAIN`): 파워링크 검색결과에서 "우리 순위"를 식별하는 데 씀
4. **경쟁사 목록** 5~10곳: 이름, 도메인, 네이버 블로그 ID → `config/competitors.yaml`에 등록
5. (선택) 제외할 키워드 → `config/keyword_exclude.yaml`

## 로컬 설정

```bash
cp .env.example .env
# .env를 열어 위 값들을 채운다

npm install
npx playwright install chromium   # 최초 1회 — 스크래핑에 쓰는 Chromium 바이너리 설치
npm run typecheck
```

`config/competitors.yaml`의 예시 값을 실제 경쟁사 정보로 교체하세요.

## 로컬 테스트 (개별 스킬)

각 스킬은 독립적으로 실행하고 결과를 `data/raw/<오늘날짜>/`에서 확인할 수 있습니다:

```bash
npm run sync:keywords     # A0/A1 — 키워드 동기화
npm run fetch:searchad    # A2 — 검색량·경쟁정도
npm run scrape:serp       # A3 — 파워링크 노출순서·도메인
npm run estimate:spend    # A4/A5 — 도메인 매핑·광고비 추정
npm run fetch:blog        # B2/B3 — 블로그 검색결과·게시물
npm run analyze:cadence   # B4 — 포스팅 주기
npm run calculate:sov     # B5 — SOV
```

이상치 탐지(A6/B6)·리포트 작성(A7/B7)은 Claude 세션의 판단이 필요한 단계라 스크립트만으로는
실행되지 않습니다 — 아래 "전체 파이프라인" 방식으로 실행하세요.

## 전체 파이프라인 실행 (Claude 세션 필요)

```bash
npm run run:daily   # = bash scripts/run-daily.sh
```

내부적으로 `claude -p`를 헤드리스로 실행해 [`CLAUDE.md`](./CLAUDE.md)의 오케스트레이터 지시와
`.claude/agents/*/AGENT.md`를 따라 A0~A8, B1~B8, O1~O4를 전부 수행합니다. 로그는
`logs/run-<날짜>.log`에 남습니다.

대화형으로 직접 확인하고 싶다면 이 디렉터리에서 그냥 `claude`를 실행한 뒤
"오늘의 모니터링 파이프라인을 실행해줘"라고 요청해도 동일하게 동작합니다.

## cron / launchd 연결

**cron** (매일 KST 07:00 = UTC 22:00 예시):

```
0 22 * * * cd /path/to/airpass-naver-monitor && ./scripts/run-daily.sh >> logs/cron.log 2>&1
```

**launchd** (macOS, `~/Library/LaunchAgents/com.airpass.naver-monitor.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.airpass.naver-monitor</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/airpass-naver-monitor/scripts/run-daily.sh</string>
  </array>
  <key>WorkingDirectory</key><string>/path/to/airpass-naver-monitor</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/path/to/airpass-naver-monitor/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>/path/to/airpass-naver-monitor/logs/launchd.err.log</string>
</dict>
</plist>
```

등록: `launchctl load ~/Library/LaunchAgents/com.airpass.naver-monitor.plist`

## 스크래핑 대상 범위

실 계정 기준 활성 키워드가 900개를 넘어, 파워링크·블로그 검색결과 스크래핑(A3/B2)은 전체가
아니라 **월간검색량 상위 50개**만 대상으로 합니다(검색량·경쟁정도는 공식 API라 전체 키워드를
매일 수집합니다). 이 개수를 바꾸려면 `scripts/lib/keyword-scope.ts`의 `SCRAPE_TARGET_COUNT`를
수정하세요.

## 운영상 주의

- `scripts/run-daily.sh`는 `claude -p --permission-mode bypassPermissions`로 실행됩니다(무인
  실행이라 승인 프롬프트를 받을 사람이 없기 때문) — 이 프로젝트 디렉터리는 이 에이전트의 작업
  범위로만 써야 하며, 다른 민감한 프로젝트와 같은 디렉터리를 공유하지 마세요.
- `--max-budget-usd`(기본 5달러, `CLAUDE_MAX_BUDGET_USD` 환경변수로 조정 가능)로 세션당 API
  비용 상한을 둡니다.
- `data/raw/`, `data/processed/`, `output/*/`는 git에 커밋하지 않습니다(매일 재생성되는 산출물).
  감사가 필요하면 별도로 백업하세요.
- 파워링크/블로그 검색결과 스크래핑의 한계와 책임 범위는
  [`scripts/lib/scrape-utils.ts`](./scripts/lib/scrape-utils.ts) 상단 주석을 참고하세요.
