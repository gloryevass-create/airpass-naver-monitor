# airpass-naver-monitor

에어패스 네이버 마케팅 모니터링 — 백그라운드 수집 파이프라인. 네이버 키워드광고 경쟁사 현황
(Track A)과 네이버 블로그 경쟁사 현황(Track B)을 매일 자동으로 수집해서, 웹 대시보드
(`airpass-naver-dashboard`, 별도 저장소)가 읽는 공유 Supabase 프로젝트에 채워 넣는다.

이 프로젝트는 웹 서버가 아니다 — cron/launchd 같은 외부 스케줄러가 `scripts/run-daily.sh`를
매일 트리거하면, 그 안에서 Claude Code를 헤드리스(`claude -p`)로 실행해 이 문서(오케스트레이터)와
`.claude/agents/*/AGENT.md`의 지시대로 동작한다.

## 개요

- **입력**: 네이버 검색광고(SearchAd) API(공식), 네이버 검색결과 페이지(파워링크/블로그 —
  공식 API가 없는 항목에 한해 Playwright 스크래핑), 네이버 블로그 RSS(공식).
- **출력**: 공유 Supabase 프로젝트의 `keywords`, `keyword_daily_metrics`, `competitors`,
  `ad_spend_estimates`, `blog_posts`, `blog_sov_daily`, `posting_cadence`, `pipeline_runs`,
  `daily_reports`, `alerts` 테이블. 로컬 `data/raw/`(원본 스냅샷)·`data/processed/`(정제본)·
  `output/`(자연어 리포트 md)도 감사/백업용으로 남긴다.
- **역할 분담**: 결정적 단계(API 호출, 스크래핑, 계산, DB 쓰기)는 `scripts/`의 TypeScript
  코드가 하고, 판단이 필요한 단계(이상치 서술, 도메인 매핑 애매한 경우 보정, 리포트 작성,
  콘텐츠 톤 분석)는 이 파일과 `.claude/agents/*/AGENT.md`를 읽는 Claude 세션이 직접 한다.

## 오케스트레이터 (O1~O4)

매일 `scripts/run-daily.sh`가 트리거되면 이 세션은 다음을 순서대로 한다:

- **O1**: `.claude/agents/ad-monitor/AGENT.md` 지시대로 ad-monitor(A0~A8)를 먼저 실행한다.
  끝나면 `.claude/agents/blog-monitor/AGENT.md` 지시대로 blog-monitor(B1~B8)를 실행한다.
  (두 트랙은 서로 독립이지만, 매일 실행에서는 순차로 진행해 리소스 경합을 피한다.)
- **O2**: 오늘 날짜의 `pipeline_runs`에서 `track='ad'`와 `track='blog'`가 **둘 다** `status='success'`인
  경우에만 통합 리포트를 생성한다. `report-formatter` 스킬로 두 트랙의 리포트 내용을 종합해
  `daily_reports`(`track='combined'`)에 upsert하고 `output/daily/<날짜>_daily_combined.md`로 저장한다.
  하나라도 실패했다면 통합 리포트를 만들지 않고 무엇이 실패했는지 요약해 보고한다.
- **O3**: `output/**/*.md`로 저장하는 모든 파일은 `.claude/settings.json`의 훅이 자동으로
  `scripts/brand-tone-check.ts`(톤·출처 명시·과장 표현 금지·`YYYY-MM-DD` 날짜 형식)를 통과시켜야
  한다 — 훅을 우회하지 않는다.
- **O4**: `report-formatter` 스킬의 파일명 규칙(`[작성일]_[문서유형]_[영역명].md`)을 따르고,
  각 트랙이 끝날 때마다 로컬 `output/_pipeline_state.json`과 Supabase `pipeline_runs`를 함께
  갱신한다(`scripts/lib/pipeline-state.ts::recordRun`).

## 폴더 구조

```
.claude/
  settings.json          훅: data/processed/{ads,blog}_*.json 스키마 검증, output/**/*.md 브랜드 톤 검증
  skills/                스킬별 SKILL.md (사용법·LLM/코드 경계 문서)
  agents/ad-monitor/       Track A 서브에이전트
  agents/blog-monitor/     Track B 서브에이전트
config/
  competitors.yaml         경쟁사 목록(수동 등록, 5~10곳)
  keyword_exclude.yaml     자동 동기화 키워드 중 제외 목록(선택)
data/
  raw/YYYY-MM-DD/           원본 스냅샷(감사·재현용, git 미포함)
  processed/                 최종 검증된 정제 JSON(Supabase 반영 직전본, git 미포함)
docs/
  schema.sql                 airpass-naver-dashboard의 마이그레이션 사본(읽기 전용 참조)
output/
  daily/ weekly/ monthly/    자연어 리포트 md(로컬 백업, 원본은 Supabase daily_reports)
  _pipeline_state.json        로컬 파이프라인 상태
scripts/
  lib/                        공통 유틸(Supabase 클라이언트, 재시도, 스크래핑 유틸, 설정 로더 등)
  skills/                     각 스킬의 실제 구현(SKILL.md가 이 스크립트들을 어떻게 쓰는지 설명)
  validate-schema.ts           A8/B8 직전 스키마 검증(훅에서 호출)
  brand-tone-check.ts           리포트 발행 전 체크(훅에서 호출)
  run-daily.sh                  cron/launchd 진입점 — claude -p 헤드리스 실행
```

## 스키마

이 프로젝트는 스키마를 소유하지 않는다. 단일 출처는 `airpass-naver-dashboard` 저장소의
`supabase/migrations/0001_init.sql`이며, `docs/schema.sql`은 그 내용을 그대로 복사한 읽기 전용
참조 사본이다. 스키마를 바꿀 일이 있으면 그 저장소에서 먼저 바꾸고 이 사본을 다시 복사한다.

## 멱등성

모든 upsert는 스키마의 unique 제약과 정확히 일치하는 키로 수행한다(`scripts/lib/supabase-sync.ts`):

| 테이블 | onConflict |
|---|---|
| `keywords` | `naver_keyword_id` |
| `keyword_daily_metrics` | `date,keyword_id` |
| `ad_spend_estimates` | `date,competitor_id,keyword_id` |
| `blog_posts` | `url` |
| `blog_sov_daily` | `date,keyword_id,competitor_id` |
| `posting_cadence` | `date,competitor_id` |
| `pipeline_runs` | `date,track` |
| `daily_reports` | `date,report_type,track` |

(`competitors`는 unique 제약이 없어 이름 기준 "조회 후 없으면 생성"으로 중복을 막는다 —
`scripts/lib/supabase-sync.ts::ensureCompetitors` 참고. `alerts`는 같은 날 여러 건이 허용되므로
매번 insert한다.)

## 스크래핑 대상 범위 (중요)

실제 에어패스 계정으로 시범 실행해보니 활성 키워드가 계획 당시 예상(10~30개)과 달리
**900개 이상**이었다. 검색량·경쟁정도(A2, 공식 API)는 전체 키워드에 대해 매일 수집하지만,
Playwright 스크래핑이 필요한 A3(파워링크 노출순서)·B2(블로그 검색결과)는 전체를 다 돌리면
실행시간이 30분~1시간을 넘고 네이버 차단 위험도 커서, **월간검색량 상위 50개**로만 범위를
좁히기로 사용자와 확정했다(`scripts/lib/keyword-scope.ts::SCRAPE_TARGET_COUNT`). 이 값을
바꾸고 싶으면 이 상수를 수정한다.

## 환경변수

`.env.example` 참고. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`는 `airpass-naver-dashboard`와
**같은 Supabase 프로젝트**를 가리켜야 한다. `AIRPASS_DOMAIN`은 파워링크 결과에서 "우리 순위"를
식별하는 데 쓰인다.

## 트러블슈팅

- **`fetchEstimateBid` 미연동**: 경쟁사 광고비 추정(A5)의 CPC 프록시 조회가 아직 실 계정에
  맞춰 완성되지 않았다 — `.claude/skills/ad-spend-estimator/SKILL.md`의 "알려진 미완성 지점" 참고.
- **파워링크/블로그 셀렉터 깨짐**: 네이버 마크업이 바뀌면 `naver-serp-scraper`/`naver-blog-fetch`의
  Playwright 로케이터가 빈 결과를 반환할 수 있다 — 실제 페이지 구조를 확인해 셀렉터를 갱신한다.
- **훅이 저장을 거부함**: `data/processed/{ads,blog}_*.json`이나 `output/**/*.md` 저장이 막히면
  에러 메시지에 나열된 항목(calc_basis 누락, evidence_ref 누락, 파일명 규칙 위반 등)을 고쳐서
  다시 저장한다 — 훅을 비활성화하지 않는다.
- **`claude -p` 헤드리스 실행이 권한 프롬프트에서 멈춤**: `scripts/run-daily.sh`는
  `--permission-mode bypassPermissions`를 쓴다. 이 프로젝트 디렉터리 바깥의 다른 작업에 이
  플래그를 재사용하지 않는다.

## 실행 명령

```bash
npm install
npx playwright install chromium   # 최초 1회, Playwright 브라우저 바이너리 설치
npm run typecheck

# 개별 스킬 테스트 (전부 data/raw/<오늘>/*.json을 읽고 씀)
npm run sync:keywords
npm run fetch:searchad
npm run scrape:serp
npm run fetch:blog
npm run analyze:cadence
npm run calculate:sov
npm run estimate:spend

# 최종 반영 (검증 통과한 data/processed/*.json에 대해)
npm run sync:supabase -- data/processed/ads_YYYY-MM-DD.json

# 전체 파이프라인 (claude -p 헤드리스)
npm run run:daily
```
