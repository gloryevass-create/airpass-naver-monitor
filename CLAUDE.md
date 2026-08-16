# airpass-naver-monitor

에어패스 네이버 마케팅 모니터링 — 백그라운드 수집 파이프라인. 네이버 키워드광고 경쟁사 현황
(Track A)과 네이버 블로그 경쟁사 현황(Track B)을 매일 자동으로 수집해서, 웹 대시보드
(`airpass-naver-dashboard`, 별도 저장소)가 읽는 공유 Supabase 프로젝트에 채워 넣는다.

이 프로젝트는 웹 서버가 아니다 — cron/launchd 같은 외부 스케줄러가 `scripts/run-daily.sh`를
매일 트리거하면, 그 안에서 Claude Code를 헤드리스(`claude -p`)로 실행해 이 문서(오케스트레이터)와
`.claude/agents/*/AGENT.md`의 지시대로 동작한다.

## 개요

- **입력**: 네이버 검색광고(SearchAd) API(공식, `api.searchad.naver.com`), 네이버 블로그
  검색 오픈API(공식, `openapi.naver.com`). **스크래핑은 전혀 쓰지 않는다** — 아래
  "왜 스크래핑을 안 쓰는가" 참고.
- **출력**: 공유 Supabase 프로젝트의 `keywords`, `keyword_daily_metrics`, `competitors`,
  `ad_spend_estimates`, `blog_posts`, `blog_sov_daily`, `posting_cadence`, `pipeline_runs`,
  `daily_reports`, `alerts` 테이블. 로컬 `data/raw/`(원본 스냅샷)·`data/processed/`(정제본)·
  `output/`(자연어 리포트 md)도 감사/백업용으로 남긴다.
- **역할 분담**: 결정적 단계(API 호출, 계산, DB 쓰기)는 `scripts/`의 TypeScript 코드가 하고,
  판단이 필요한 단계(이상치 서술, 리포트 작성, 콘텐츠 톤 분석)는 이 파일과
  `.claude/agents/*/AGENT.md`를 읽는 Claude 세션이 직접 한다.

## 왜 스크래핑을 안 쓰는가 (중요 — 실측 확인, 2026-08-16)

원래 계획은 네이버 검색결과 페이지(파워링크 노출순서, 블로그 검색결과)를 Playwright로
스크래핑하는 것이었다(공식 API가 없는 영역이라는 전제). 에어패스 실 계정으로 검증한 결과:

1. **`search.naver.com/robots.txt`가 모든 User-agent에 대해 전체 경로를 금지한다**
   (`Disallow: /`). `rss.blog.naver.com/robots.txt`도 마찬가지로 전면 금지. 셀렉터가
   깨질 수 있다는 수준이 아니라, 애초에 이 경로들을 크롤링하면 안 된다.
2. robots.txt를 확인하기 전 디버깅 단계에서도, 실제 입찰 경쟁이 있는 키워드("자동차보험" 등)
   조차 파워링크 광고 콘텐츠 자체가 자동화 세션에는 렌더링되지 않았다(조직 검색결과는
   정상적으로 나옴 — 네이버의 광고 사기 방지 조치로 추정).

그래서(사용자 확인 완료) 스크래핑을 전면 포기하고 공식 API로만 재설계했다:

- **A3 "우리 순위"**: 검색광고 공식 통계 API(`GET /stats`의 `avgRnk`, 실제 광고 집행 데이터)로
  얻는다. 우리 자신의 실제 데이터라 스크래핑 추정치보다 정확하고 robots.txt와도 무관하다.
  (`scripts/skills/naver-rank-tracker.ts`, 옛 이름 naver-serp-scraper)
- **A4/A5 "경쟁사 파워링크 도메인·광고비 추정"**: 경쟁사 입찰 데이터는 네이버가 제3자에게
  공개하는 공식 API가 없고 스크래핑도 막혀 있어, **자동 수집을 포기했다**
  (`scripts/skills/ad-spend-estimator.ts`는 항상 빈 배열을 반환). 리포트에는 "경쟁사 광고비는
  공식 API·합법적 수집 경로가 없어 자동 수집하지 못했다"고 명시한다 — 근거 없는 추정치를
  지어내지 않는다(환각 차단 원칙).
- **B2 "블로그 검색결과"(SOV용)**: 네이버 공식 블로그 검색 오픈API
  (`openapi.naver.com/v1/search/blog.json`, NAVER API HUB에서 무료 발급)를 쓴다
  (`scripts/skills/naver-blog-fetch.ts`). 이 API도 `robots.txt: Disallow: /`가 있지만,
  이는 색인 크롤러용 규칙이고 발급받은 키로 인증하는 공식 개발자 API 호출에는 적용되는
  관례가 아니다(검색광고 API와 동일하게 취급).
- **B3 "전체 포스팅 이력"(포스팅 주기용)**: 처음엔 B2 API 검색 결과에서 우연히 걸린 게시물만
  모았는데, 그러면 경쟁사가 실제로는 자주 포스팅해도 "우리가 모니터링하는 키워드"로 검색했을
  때 안 걸리면 데이터가 항상 비었다. 그래서 각 블로그의 공식 RSS 피드
  (`rss.blog.naver.com/<blog_id>.xml`)로 전체 이력을 직접 받아온다(2026-08-17,
  사용자 확인 완료로 정책 예외 적용 — `.claude/skills/naver-blog-fetch/SKILL.md`의
  ⚠️ 표시 문단 참고, `rss.blog.naver.com/robots.txt`도 전면 금지지만 네이버가 각 블로그
  페이지 자체에 공식 게재하는 구독 주소라는 점을 근거로 예외 적용).
- **B2 검색어 선정도 2026-08-17에 바뀌었다**: 원래 광고 키워드 상위 50개(검색량 기준)로
  검색했는데, 그 키워드는 제품/카테고리 검색어라 경쟁사 블로그 콘텐츠 주제와 안 겹쳐서 SOV가
  항상 0에 가깝게 나왔다. 지금은 B3에서 수집한 실제 게시물 제목과 겹치는 키워드만
  917개 등록 키워드 중에서 골라 쓴다(`scripts/lib/blog-keyword-scope.ts`,
  `getOrComputeBlogContentKeywords`) — 스키마상 `blog_sov_daily.keyword_id`가 기존
  `keywords` 테이블을 참조해야 해서(FK) 완전히 새로운 키워드를 만들 수는 없다.

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
  lib/                        공통 유틸(Supabase 클라이언트, 재시도, 설정 로더, API 클라이언트 등)
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

## API 호출 대상 범위 (중요)

실제 에어패스 계정으로 시범 실행해보니 활성 키워드가 계획 당시 예상(10~30개)과 달리
**900개 이상**이었다. 검색량·경쟁정도(A2, 공식 API)는 전체 키워드에 대해 매일 수집하지만,
키워드별로 별도 API 호출이 필요한 단계는 각자 다른 방식으로 대상을 좁힌다:

- **A3(우리 순위)**: 월간검색량 상위 `SCRAPE_TARGET_COUNT`(기본 50)개
  (`scripts/lib/keyword-scope.ts`).
- **B2(블로그 SOV 검색어)**: 검색량이 아니라 "실제 경쟁사 게시물 제목과 겹치는" 키워드
  최대 `BLOG_KEYWORD_COUNT`(기본 30)개(`scripts/lib/blog-keyword-scope.ts`) — A3와 기준이
  다르다는 점에 유의(위 "왜 스크래핑을 안 쓰는가"의 B2 항목 참고).

이 값들을 바꾸고 싶으면 각 상수를 수정한다.

## 환경변수

`.env.example` 참고. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`는 `airpass-naver-dashboard`와
**같은 Supabase 프로젝트**를 가리켜야 한다. `NAVER_SEARCHAD_*`는 검색광고 API(개발자센터와
별개, searchad.naver.com에서 발급), `NAVER_OPENAPI_*`는 블로그 검색 API(developers.naver.com
개발자센터에서 별도 애플리케이션 등록 필요) — 서로 다른 두 세트의 키다.

## 트러블슈팅

- **훅이 저장을 거부함**: `data/processed/{ads,blog}_*.json`이나 `output/**/*.md` 저장이 막히면
  에러 메시지에 나열된 항목(calc_basis 누락, evidence_ref 누락, 파일명 규칙 위반 등)을 고쳐서
  다시 저장한다 — 훅을 비활성화하지 않는다.
- **`claude -p` 헤드리스 실행이 권한 프롬프트에서 멈춤**: `scripts/run-daily.sh`는
  `--permission-mode bypassPermissions`를 쓴다. 이 프로젝트 디렉터리 바깥의 다른 작업에 이
  플래그를 재사용하지 않는다.
- **경쟁사 광고비가 항상 비어 있음**: 의도된 동작이다 — 위 "왜 스크래핑을 안 쓰는가" 참고.

## 실행 명령

```bash
npm install
npm run typecheck

# 개별 스킬 테스트 (전부 data/raw/<오늘>/*.json을 읽고 씀)
npm run sync:keywords
npm run fetch:searchad
npm run fetch:rank
npm run fetch:blog
npm run analyze:cadence
npm run calculate:sov
npm run estimate:spend

# 최종 반영 (검증 통과한 data/processed/*.json에 대해)
npm run sync:supabase -- data/processed/ads_YYYY-MM-DD.json

# 전체 파이프라인 (claude -p 헤드리스)
npm run run:daily
```
