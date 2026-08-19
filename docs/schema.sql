-- ============================================================================
-- 에어패스 네이버 마케팅 모니터링 — 초기 스키마
--
-- 이 파일이 스키마의 단일 출처(source of truth)다.
-- 프로젝트 2(모니터링 에이전트)는 이 구조를 그대로 참조해 upsert하며,
-- 스키마를 변경할 때는 이 파일(과 필요하면 후속 0002_*.sql)만 수정한다.
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. profiles — 로그인 사용자 프로필 (auth.users 1:1)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "select own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "admins can select all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. keywords — 에어패스 검색광고 계정에서 자동 동기화되는 키워드
create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  naver_keyword_id text not null unique,
  keyword text not null,
  campaign_id text,
  adgroup_id text,
  status text not null default 'ELIGIBLE',
  is_excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_keywords_status on public.keywords (status, is_excluded);

-- 3. keyword_daily_metrics — 키워드별 일별 노출순위·CPC·검색량
create table if not exists public.keyword_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  monthly_search_pc integer,
  monthly_search_mobile integer,
  avg_cpc numeric(12, 2),
  competition_level text,
  our_rank integer,
  created_at timestamptz not null default now(),
  unique (date, keyword_id)
);

create index if not exists idx_kdm_date on public.keyword_daily_metrics (date);

-- 4. competitors — 모니터링 대상 경쟁사 (수동 등록, 5~10곳)
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text,
  blog_id text,
  created_at timestamptz not null default now()
);

-- 5. ad_spend_estimates — 경쟁사 월 예상 광고비 추정
create table if not exists public.ad_spend_estimates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  estimated_monthly_spend numeric(14, 2) not null,
  calc_basis jsonb, -- 산출 근거(순위·CPC·가정 클릭률·운영일수 등) — 환각 차단·각주 표기용
  created_at timestamptz not null default now(),
  unique (date, competitor_id, keyword_id)
);

create index if not exists idx_ase_date on public.ad_spend_estimates (date);

-- 6. blog_posts — 경쟁사 블로그 게시물 원본
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  url text not null unique,
  title text,
  published_at date,
  collected_at date not null default current_date
);

-- 7. blog_sov_daily — 키워드별 경쟁사 블로그 노출 점유율
create table if not exists public.blog_sov_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  share_pct numeric(5, 2) not null,
  unique (date, keyword_id, competitor_id)
);

create index if not exists idx_sov_date on public.blog_sov_daily (date);

-- 8. posting_cadence — 경쟁사 블로그 포스팅 주기
create table if not exists public.posting_cadence (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  avg_interval_days numeric(6, 2),
  last_post_at date,
  post_count_30d integer,
  unique (date, competitor_id)
);

create index if not exists idx_cadence_date on public.posting_cadence (date);

-- 9. pipeline_runs — 파이프라인 상태 파일의 DB 버전
create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  track text not null check (track in ('ad', 'blog')),
  status text not null check (status in ('success', 'partial', 'failed')),
  message text,
  created_at timestamptz not null default now(),
  unique (date, track)
);

-- 10. daily_reports — 일간/주간/월간 자연어 리포트
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly')),
  track text not null check (track in ('ad', 'blog', 'combined')),
  title text not null,
  content_md text not null,
  source_refs jsonb, -- 리포트 안에서 인용한 데이터 출처 — 환각 차단용
  created_at timestamptz not null default now(),
  unique (date, report_type, track)
);

create index if not exists idx_reports_date on public.daily_reports (date desc);

-- 11. alerts — 이상치 탐지 결과
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  category text not null,
  message text not null,
  evidence_ref text,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_date on public.alerts (date desc, severity desc);

-- 12. RLS — 모니터링 데이터 테이블: 로그인 사용자는 SELECT만, 쓰기는 service_role만
do $$
declare
  t text;
begin
  foreach t in array array[
    'keywords', 'keyword_daily_metrics', 'competitors', 'ad_spend_estimates',
    'blog_posts', 'blog_sov_daily', 'posting_cadence', 'pipeline_runs',
    'daily_reports', 'alerts'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy "authenticated can select" on public.%I for select using (auth.role() = ''authenticated'');',
      t
    );
  end loop;
end $$;
-- ============================================================================
-- 키워드 평균 월간 클릭수(PC/모바일) 컬럼 추가
--
-- 네이버 검색광고 키워드도구 API(showDetail=1)가 이미 반환하는 값인데
-- (monthlyAvePcClkCnt, monthlyAveMobileClkCnt) 지금까지 저장하지 않고 있었다.
-- ============================================================================

alter table public.keyword_daily_metrics
  add column if not exists monthly_click_pc numeric(10, 2),
  add column if not exists monthly_click_mobile numeric(10, 2);
-- ============================================================================
-- 키워드별 최근 7일 실제 지출액(spend_7d) 컬럼 추가
--
-- avg_cpc를 계산할 때 이미 확보하는 /stats 응답의 salesAmt(실제 집행 지출액)를
-- 지금까지 버리고 있었다 — "핫 비용 TOP10"(지출액 기준 인기 키워드) 트리맵에 쓰기
-- 위해 저장한다. 클릭이 없어도 지출액은 0으로 실제 집계되므로 null이 아니라 0을
-- 저장할 수 있다(avg_cpc는 클릭 0이면 나눗셈이 무의미해 null로 둔다).
-- ============================================================================

alter table public.keyword_daily_metrics
  add column if not exists spend_7d numeric(14, 2);
-- ============================================================================
-- 계정 전체 일별 광고 성과지표(노출수/클릭수/전환수/지출액) + 비즈머니 잔액
--
-- 네이버 검색광고 공식 통계 API(/stats)에 캠페인 ID들을 콤마로 묶어 요청하면
-- 계정 전체를 합산한 일별 데이터가 그대로 나온다. 비즈머니 잔액은 별도
-- 공식 API(/billing/bizmoney)로 매일 스냅샷 형태로 함께 저장한다(하루 1회 수집이므로
-- 그 날짜의 남은 잔액 스냅샷일 뿐, 일중 변동을 추적하지는 않음).
-- ============================================================================

create table if not exists public.ad_account_daily_stats (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  imp_cnt integer not null default 0,
  clk_cnt integer not null default 0,
  ccnt integer not null default 0,
  sales_amt numeric(14, 2) not null default 0,
  ctr numeric(6, 2),
  cpc numeric(10, 2),
  bizmoney numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists idx_aads_date on public.ad_account_daily_stats (date desc);

alter table public.ad_account_daily_stats enable row level security;

create policy "authenticated can select"
  on public.ad_account_daily_stats for select
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 뉴스 모니터링 — 교육청 사업·정책 관련 뉴스
--
-- 에듀테크/AI/교육감/교육청/교육부 등 영업 전략에 직접 영향을 줄 수 있는 뉴스를
-- 네이버 뉴스 검색 공식 API(NAVER API HUB) 기반으로 수집한다. 다른 모니터링
-- 데이터와 동일하게 읽기 전용(authenticated는 SELECT만, 쓰기는 service_role만).
-- ============================================================================

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  title text not null,
  link text not null unique,
  description text,
  published_at timestamptz,
  collected_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_published on public.news_articles (published_at desc);
create index if not exists idx_news_keyword on public.news_articles (keyword);

alter table public.news_articles enable row level security;

create policy "authenticated can select news"
  on public.news_articles for select
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 교육청 예산·사업 모니터링 — 나라장터 입찰공고
--
-- 조달청 나라장터 입찰공고정보서비스(공식, data.go.kr)에서 사업명·예산금액·발주기관을
-- 수집한다. 다른 모니터링 데이터와 동일하게 읽기 전용(authenticated는 SELECT만,
-- 쓰기는 service_role만). (bid_no, bid_ord) 조합이 공고 단위 고유키다(재공고 시
-- bid_ord가 올라간다).
-- ============================================================================

create table if not exists public.budget_bids (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  business_type text not null check (business_type in ('cnstwk', 'servc', 'thng')),
  bid_no text not null,
  bid_ord text not null default '000',
  title text not null,
  notice_inst text,
  demand_inst text,
  budget_amount numeric(16, 0),
  presmpt_price numeric(16, 0),
  notice_date timestamptz,
  opening_date timestamptz,
  detail_url text,
  collected_at date not null default current_date,
  created_at timestamptz not null default now(),
  unique (bid_no, bid_ord)
);

create index if not exists idx_budget_bids_notice_date on public.budget_bids (notice_date desc);
create index if not exists idx_budget_bids_keyword on public.budget_bids (keyword);

alter table public.budget_bids enable row level security;

create policy "authenticated can select budget bids"
  on public.budget_bids for select
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 뉴스·예산 모니터링 검색 키워드 관리
--
-- 지금까지는 config/news_keywords.yaml, config/budget_keywords.yaml 정적 파일로
-- 관리했는데, 팀원이 대시보드에서 직접 추가/삭제할 수 있도록 Supabase로 옮긴다.
-- 파이프라인(naver-news-fetch, g2b-budget-fetch)은 이 테이블을 읽기만 한다.
--
-- 광고전략메모 게시판과 같은 이유로 authenticated 쓰기를 허용한다(내부 신뢰된
-- 팀 도구, 관리자 전용으로 좁힐 필요 없음).
-- ============================================================================

create table if not exists public.monitor_keywords (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('news', 'budget')),
  keyword text not null,
  created_at timestamptz not null default now(),
  unique (track, keyword)
);

alter table public.monitor_keywords enable row level security;

create policy "authenticated can select monitor keywords"
  on public.monitor_keywords for select
  using (auth.role() = 'authenticated');

create policy "authenticated can insert monitor keywords"
  on public.monitor_keywords for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated can delete monitor keywords"
  on public.monitor_keywords for delete
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 유튜브 채널 분석 — 에어패스 공식 채널(@AIRPASS_XR) 운영 현황
--
-- YouTube Data API v3(공식, API 키 인증)로 채널 통계와 영상별 성과를 수집한다.
-- 다른 모니터링 데이터와 동일하게 읽기 전용(authenticated는 SELECT만, 쓰기는
-- service_role만).
-- ============================================================================

create table if not exists public.youtube_channel_stats (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  subscriber_count integer not null default 0,
  view_count bigint not null default 0,
  video_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_yt_channel_stats_date on public.youtube_channel_stats (date desc);

alter table public.youtube_channel_stats enable row level security;

create policy "authenticated can select youtube channel stats"
  on public.youtube_channel_stats for select
  using (auth.role() = 'authenticated');

create table if not exists public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  video_id text not null unique,
  title text not null,
  published_at timestamptz,
  view_count bigint not null default 0,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  duration_seconds integer,
  thumbnail_url text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_yt_videos_view_count on public.youtube_videos (view_count desc);
create index if not exists idx_yt_videos_published_at on public.youtube_videos (published_at desc);

alter table public.youtube_videos enable row level security;

create policy "authenticated can select youtube videos"
  on public.youtube_videos for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- 팀 일정 캘린더 — Notion "행사 및 스케쥴" 데이터베이스 미러링
--
-- 팀 노션(Airpass전략기획 워크스페이스)의 행사 및 스케쥴 데이터베이스를 Notion API로
-- 읽어와 동기화한다. 원본은 계속 Notion — 이 테이블은 읽기 전용 사본이다(다른
-- 모니터링 데이터와 동일하게 authenticated는 SELECT만, 쓰기는 service_role만).
-- ============================================================================

create table if not exists public.team_events (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  title text not null,
  date_start timestamptz not null,
  date_end timestamptz,
  is_datetime boolean not null default false,
  category text,
  tags text[] not null default '{}',
  target text,
  location text,
  content text,
  assignees text[] not null default '{}',
  attendees text[] not null default '{}',
  notion_url text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_events_date_start on public.team_events (date_start);

alter table public.team_events enable row level security;

create policy "authenticated can select team events"
  on public.team_events for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- 청소년관련기관DB — 전국청소년수련시설 현황(공공데이터포털, 여성가족부/한국청소년활동진흥원
-- "청소년수련시설정보서비스" getTeenTrftListV2)
--
-- 참고 데이터라 이력 누적이 필요 없다 — 매 동기화마다 전체를 다시 받아 통째로
-- 교체한다(다른 모니터링 테이블과 달리 upsert가 아니라 delete-all-then-insert).
-- 다른 모니터링 데이터와 동일하게 읽기 전용(authenticated는 SELECT만, 쓰기는
-- service_role만).
-- ============================================================================

create table if not exists public.youth_facilities (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  representative_name text,
  operating_body text,
  operation_mode text,
  foundation_subject text,
  foundation_org_detail text,
  installation_type text,
  facility_type text,
  province_name text,
  district_name text,
  road_address text,
  lot_address text,
  latitude numeric,
  longitude numeric,
  homepage_url text,
  phone_number text,
  fax_number text,
  email text,
  operating_hours text,
  holiday_info text,
  has_parking boolean,
  capacity_count integer,
  overnight_capacity_count integer,
  stay_capacity_count integer,
  companion_capacity_count integer,
  first_registered_date date,
  reference_date date,
  is_exposed boolean,
  remarks text,
  synced_at timestamptz not null default now()
);

create index if not exists idx_youth_facilities_province on public.youth_facilities (province_name);
create index if not exists idx_youth_facilities_name on public.youth_facilities (facility_name);

alter table public.youth_facilities enable row level security;

create policy "authenticated can select youth facilities"
  on public.youth_facilities for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- 장애인관련기관 — 전국장애인단체표준데이터(공공데이터포털, 보건복지부 공식 API
-- tn_pubr_public_disabled_orgs_api)
--
-- 청소년관련기관(youth_facilities)과 동일한 성격의 참고 데이터 — 이력 누적이
-- 필요 없어 매 동기화마다 통째로 교체한다(upsert가 아니라 delete-all-then-insert).
-- 이 API에는 시설유형 필드가 없어(전부 "단체") 시설유형별 통계는 만들지 않는다
-- (사용자 확인, 2026-08-18).
-- 다른 모니터링 데이터와 동일하게 읽기 전용(authenticated는 SELECT만, 쓰기는
-- service_role만).
-- ============================================================================

create table if not exists public.disability_organizations (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  province_name text,
  district_name text,
  road_address text,
  lot_address text,
  foundation_date date,
  member_count integer,
  phone_number text,
  representative_name text,
  reference_date date,
  provider_org_code text,
  provider_org_name text,
  synced_at timestamptz not null default now()
);

create index if not exists idx_disability_orgs_province on public.disability_organizations (province_name);
create index if not exists idx_disability_orgs_name on public.disability_organizations (group_name);

alter table public.disability_organizations enable row level security;

create policy "authenticated can select disability organizations"
  on public.disability_organizations for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- 장애인체육시설 — 대한장애인체육회_장애인전용체육시설(공공데이터포털, 공식 API)
--
-- 청소년관련기관/장애인관련기관과 동일한 성격의 참고 데이터 — 이력 누적이
-- 필요 없어 매 동기화마다 통째로 교체한다(upsert가 아니라 delete-all-then-insert).
-- 이 API에도 시설유형 필드가 없어(전부 "장애인전용체육시설") 시설유형별 통계는
-- 만들지 않는다(장애인단체와 동일한 판단, 2026-08-18).
-- 다른 모니터링 데이터와 동일하게 읽기 전용(authenticated는 SELECT만, 쓰기는
-- service_role만).
-- ============================================================================

create table if not exists public.disability_sports_facilities (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  province_name text,
  district_name text,
  operating_body text,
  phone_number text,
  homepage_url text,
  has_voucher_program boolean,
  has_bandabi_facility boolean,
  synced_at timestamptz not null default now()
);

create index if not exists idx_disability_sports_province on public.disability_sports_facilities (province_name);
create index if not exists idx_disability_sports_name on public.disability_sports_facilities (facility_name);

alter table public.disability_sports_facilities enable row level security;

create policy "authenticated can select disability sports facilities"
  on public.disability_sports_facilities for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- 장애인편의시설(장애인복지관류 공공시설) — 전국장애인편의시설표준데이터
-- (공공데이터포털, 한국사회보장정보원 공식 API getDisConvFaclList)
--
-- 원본 API는 전국 18만 건(편의시설이 설치된 건물 전체 — 다세대주택·상가 등 포함)이라
-- 매일 전체 재수집이 비현실적이고 "장애인이 이용하는 시설"과 성격도 다르다. 그래서
-- 시설명에 "장애인"이 포함된 결과만 조회한 뒤(faclNm 검색 파라미터), 그중 다시
-- "복지관"이 포함된 이름만 걸러 장애인복지관류 공공시설로 범위를 좁힌다
-- (사용자 확인, 2026-08-18).
--
-- 참고 데이터라 이력 누적이 필요 없어 매 동기화마다 통째로 교체한다
-- (upsert가 아니라 delete-all-then-insert). 다른 모니터링 데이터와 동일하게
-- 읽기 전용(authenticated는 SELECT만, 쓰기는 service_role만).
-- ============================================================================

create table if not exists public.disability_welfare_centers (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  facility_type text,
  province_name text,
  road_address text,
  latitude numeric,
  longitude numeric,
  operating_status text,
  establishment_date date,
  welfare_facility_id text,
  synced_at timestamptz not null default now()
);

create index if not exists idx_disability_welfare_province on public.disability_welfare_centers (province_name);
create index if not exists idx_disability_welfare_name on public.disability_welfare_centers (facility_name);

alter table public.disability_welfare_centers enable row level security;

create policy "authenticated can select disability welfare centers"
  on public.disability_welfare_centers for select
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 특수학교현황 — 교육부 국립특수교육원_특수학교현황(공공데이터포털, odcloud.kr 공식 API)
--
-- 참고 데이터라 이력 누적이 필요 없어 매 동기화마다 통째로 교체한다(upsert가 아니라
-- delete-all-then-insert). 전국 196개교 규모라 매일 전체 재수집에 문제없다(1회 호출).
-- 다른 모니터링 데이터와 동일하게 읽기 전용(authenticated는 SELECT만, 쓰기는
-- service_role만).
-- ============================================================================

create table if not exists public.special_schools (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  province_name text,
  foundation_type text,
  disability_domain text,
  principal_name text,
  approval_date date,
  opening_date date,
  principal_office_phone text,
  admin_office_phone text,
  teacher_office_phone text,
  fax_number text,
  zip_code text,
  address text,
  homepage_url text,
  reference_date date,
  synced_at timestamptz not null default now()
);

create index if not exists idx_special_schools_province on public.special_schools (province_name);
create index if not exists idx_special_schools_name on public.special_schools (school_name);

alter table public.special_schools enable row level security;

create policy "authenticated can select special schools"
  on public.special_schools for select
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 비즈니스 — Notion "사업진행 현황" 데이터베이스 미러링
--
-- 팀 노션(Airpass전략기획 워크스페이스)의 사업진행 현황 데이터베이스를 Notion API로
-- 읽어와 동기화한다. 원본은 계속 Notion — 이 테이블은 읽기 전용 사본이다(team_events와
-- 동일한 패턴: notion_page_id가 자연키, 매번 upsert 후 오늘 동기화에 없는 페이지는
-- 삭제해 Notion 쪽 삭제를 그대로 반영한다). 다른 모니터링 데이터와 동일하게
-- authenticated는 SELECT만, 쓰기는 service_role만.
-- ============================================================================

create table if not exists public.business_projects (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  title text not null,
  stage text,
  status text,
  org_name text,
  participation_type text,
  work_type text,
  result text,
  amount numeric,
  progress_rate numeric,
  submission_date timestamptz,
  submission_date_is_datetime boolean not null default false,
  submission_method text,
  presentation_date timestamptz,
  presentation_date_is_datetime boolean not null default false,
  construction_start date,
  construction_end date,
  construction_content text,
  assignees text[] not null default '{}',
  created_by text,
  notion_created_at timestamptz,
  notion_url text not null,
  synced_at timestamptz not null default now()
);

create index if not exists idx_business_projects_stage on public.business_projects (stage);
create index if not exists idx_business_projects_status on public.business_projects (status);

alter table public.business_projects enable row level security;

create policy "authenticated can select business projects"
  on public.business_projects for select
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 사전규격 — 조달청 나라장터 사전규격정보서비스(공식, HrcspSsstndrdInfoService)
--
-- 입찰공고(budget_bids)보다 앞선 단계에서 발주기관이 규격을 미리 공개하는 단계를
-- 모니터링한다. budget_bids와 동일한 monitor_keywords(track='budget') 키워드를
-- 재사용한다 — 같은 영업 대응 목적이라 키워드 목록을 따로 관리할 필요가 없다.
-- pre_spec_reg_no(사전규격등록번호)가 자연키라 upsert(대체 delete-all 아님).
-- 다른 모니터링 데이터와 동일하게 authenticated는 SELECT만, 쓰기는 service_role만.
-- ============================================================================

create table if not exists public.prespec_notices (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  business_type text not null check (business_type in ('cnstwk', 'servc', 'thng')),
  pre_spec_reg_no text not null unique,
  title text not null,
  ref_no text,
  notice_inst text,
  demand_inst text,
  budget_amount numeric,
  registered_at timestamptz,
  opinion_close_at timestamptz,
  official_name text,
  official_tel text,
  spec_doc_urls text[] not null default '{}',
  bid_notice_nos text[] not null default '{}',
  collected_at timestamptz not null default now()
);

create index if not exists idx_prespec_notices_registered_at on public.prespec_notices (registered_at);

alter table public.prespec_notices enable row level security;

create policy "authenticated can select prespec notices"
  on public.prespec_notices for select
  using (auth.role() = 'authenticated');
-- ============================================================================
-- 공공기관정보 — 행정안전부_공공기관 웹,모바일웹 사이트 정보(공공데이터포털, odcloud.kr
-- 공식 API, namespace 15050540/v1)
--
-- 참고 데이터라 이력 누적이 필요 없어 매 동기화마다 통째로 교체한다(upsert가 아니라
-- delete-all-then-insert). 전국 591개 기관 규모라 매일 전체 재수집에 문제없다(1회 호출).
-- 다른 모니터링 데이터와 동일하게 읽기 전용(authenticated는 SELECT만, 쓰기는
-- service_role만).
-- ============================================================================

create table if not exists public.public_institutions (
  id uuid primary key default gen_random_uuid(),
  site_name text not null,
  institution_type text,
  institution_category text,
  detail_category text,
  site_type text,
  url text,
  synced_at timestamptz not null default now()
);

create index if not exists idx_public_institutions_type on public.public_institutions (institution_type);
create index if not exists idx_public_institutions_category on public.public_institutions (institution_category);

alter table public.public_institutions enable row level security;

create policy "authenticated can select public institutions"
  on public.public_institutions for select
  using (auth.role() = 'authenticated');
