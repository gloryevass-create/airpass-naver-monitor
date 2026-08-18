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
3. **네이버 오픈API**: `Client ID`, `Client Secret`
   ([developers.naver.com/apps](https://developers.naver.com/apps) → 애플리케이션 등록, 검색광고 API와
   별개의 키. 블로그 검색 API 사용 권한을 켜야 함) — B2/B3(블로그 검색결과·경쟁사 게시물)에 사용
4. **에어패스 자체 도메인** (`AIRPASS_DOMAIN`): 참고용(현재 코드에서 직접 쓰이진 않음)
5. **경쟁사 블로그 목록**: 정적 파일이 아니라 대시보드(`/dashboard/blog`)에서 팀원이 직접
   등록·삭제한다(이름·도메인·네이버 블로그 ID) — 이 저장소에서 따로 준비할 파일 없음
6. (선택) 제외할 키워드 → `config/keyword_exclude.yaml`

## 로컬 설정

```bash
cp .env.example .env
# .env를 열어 위 값들을 채운다

npm install
npm run typecheck
```

## 로컬 테스트 (개별 스킬)

각 스킬은 독립적으로 실행하고 결과를 `data/raw/<오늘날짜>/`에서 확인할 수 있습니다:

```bash
npm run sync:keywords     # A0/A1 — 키워드 동기화
npm run fetch:searchad    # A2 — 검색량·경쟁정도
npm run fetch:rank        # A3 — 우리 순위(공식 통계 API)
npm run estimate:spend    # A4/A5 — 경쟁사 광고비(항상 빈 결과 — 자동 수집 불가, CLAUDE.md 참고)
npm run fetch:blog        # B2/B3 — 블로그 검색결과·경쟁사 게시물(공식 블로그 검색 API)
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

## API 호출 대상 범위

실 계정 기준 활성 키워드가 900개를 넘어, 키워드별로 별도 호출이 필요한 단계는 전체가
아니라 일부만 대상으로 합니다(검색량·경쟁정도는 공식 API라 전체 키워드를 매일 수집합니다):

- **A3(우리 순위)**: 월간검색량 상위 50개(`scripts/lib/keyword-scope.ts`의 `SCRAPE_TARGET_COUNT`)
- **B2(블로그 SOV 검색어)**: 실제 경쟁사 게시물 제목과 겹치는 키워드 최대 30개
  (`scripts/lib/blog-keyword-scope.ts`의 `BLOG_KEYWORD_COUNT`) — 검색량이 아니라 콘텐츠
  주제 기준이라 A3와 대상이 다릅니다.

## 운영상 주의

- `scripts/run-daily.sh`는 `claude -p --permission-mode bypassPermissions`로 실행됩니다(무인
  실행이라 승인 프롬프트를 받을 사람이 없기 때문) — 이 프로젝트 디렉터리는 이 에이전트의 작업
  범위로만 써야 하며, 다른 민감한 프로젝트와 같은 디렉터리를 공유하지 마세요.
- `--max-budget-usd`(기본 5달러, `CLAUDE_MAX_BUDGET_USD` 환경변수로 조정 가능)로 세션당 API
  비용 상한을 둡니다.
- `data/raw/`, `data/processed/`, `output/*/`는 git에 커밋하지 않습니다(매일 재생성되는 산출물).
  감사가 필요하면 별도로 백업하세요.
- 이 프로젝트는 스크래핑을 쓰지 않습니다(전부 공식 API) — 그 배경과 "경쟁사 광고비 자동 수집이
  안 되는 이유"는 [`CLAUDE.md`](./CLAUDE.md)의 "왜 스크래핑을 안 쓰는가" 절을 참고하세요.
