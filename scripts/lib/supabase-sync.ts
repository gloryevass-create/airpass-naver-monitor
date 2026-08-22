import { getSupabaseClient } from "./supabase-client";
import type { Database, Json } from "./database.types";

type Tables = Database["public"]["Tables"];

/** 모든 upsert는 스키마의 unique 제약과 정확히 일치하는 onConflict를 쓴다 — 멱등성 스펙 참고. */

export async function upsertKeywords(rows: Tables["keywords"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("keywords")
    .upsert(rows, { onConflict: "naver_keyword_id" });
  if (error) throw new Error(`keywords upsert 실패: ${error.message}`);
}

/** 현재 Supabase에 status='ELIGIBLE'로 남아있는 키워드들의 naver_keyword_id 목록.
 * naver-keyword-sync가 오늘 동기화 결과와 비교해 REMOVED 처리 대상을 정확히 찾는 데 쓴다. */
export async function fetchEligibleKeywordIds(): Promise<string[]> {
  const { data, error } = await getSupabaseClient()
    .from("keywords")
    .select("naver_keyword_id")
    .eq("status", "ELIGIBLE");
  if (error) throw new Error(`keywords 조회 실패: ${error.message}`);
  return (data ?? []).map((k) => k.naver_keyword_id);
}

/** 계정에서 더 이상 ELIGIBLE로 동기화되지 않는 키워드(캠페인/광고그룹 일시중지·삭제 등)를
 * status='REMOVED'로 표시한다 — 대시보드 KPI가 status='ELIGIBLE'만 활성으로 집계하므로
 * 이 정리를 해야 더 이상 운영되지 않는 키워드가 계속 "활성"으로 카운트되지 않는다. */
export async function markKeywordsRemoved(naverKeywordIds: string[]) {
  if (naverKeywordIds.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("keywords")
    .update({ status: "REMOVED", updated_at: new Date().toISOString() })
    .in("naver_keyword_id", naverKeywordIds);
  if (error) throw new Error(`keywords REMOVED 표시 실패: ${error.message}`);
}

export async function upsertKeywordDailyMetrics(rows: Tables["keyword_daily_metrics"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("keyword_daily_metrics")
    .upsert(rows, { onConflict: "date,keyword_id" });
  if (error) throw new Error(`keyword_daily_metrics upsert 실패: ${error.message}`);
}

/** bizmoney는 별도 upsert(아래 upsertAdAccountBizmoney)로 채운다 — 이 함수의 payload에
 * bizmoney 키를 아예 넣지 않아야, 매일 밀려나는 7일 추이 윈도우가 예전 날짜를 다시 담을 때
 * 이미 저장된 그 날짜의 비즈머니 스냅샷이 null로 덮어써지지 않는다(PostgREST upsert는
 * payload에 없는 컬럼은 ON CONFLICT UPDATE SET 절에도 포함하지 않는다). */
export async function upsertAdAccountDailyStats(
  rows: Omit<Tables["ad_account_daily_stats"]["Insert"], "bizmoney">[]
) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("ad_account_daily_stats")
    .upsert(rows, { onConflict: "date" });
  if (error) throw new Error(`ad_account_daily_stats upsert 실패: ${error.message}`);
}

/** 그날(오늘) 수집한 비즈머니 잔액 스냅샷만 별도로 채운다 — 위 함수와 분리된 이유는
 * upsertAdAccountDailyStats의 주석 참고. */
export async function upsertAdAccountBizmoney(date: string, bizmoney: number) {
  const { error } = await getSupabaseClient()
    .from("ad_account_daily_stats")
    .upsert({ date, bizmoney }, { onConflict: "date" });
  if (error) throw new Error(`ad_account_daily_stats(bizmoney) upsert 실패: ${error.message}`);
}

export async function upsertAdSpendEstimates(rows: Tables["ad_spend_estimates"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("ad_spend_estimates")
    .upsert(rows, { onConflict: "date,competitor_id,keyword_id" });
  if (error) throw new Error(`ad_spend_estimates upsert 실패: ${error.message}`);
}

export async function upsertBlogPosts(rows: Tables["blog_posts"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient().from("blog_posts").upsert(rows, { onConflict: "url" });
  if (error) throw new Error(`blog_posts upsert 실패: ${error.message}`);
}

/** 대시보드의 "콘텐츠 매칭 키워드"와 동일하게, 그날 새로 수집한 RSS 스냅샷이 아니라
 * 지금까지 누적된 전체 블로그 게시물 제목을 기준으로 키워드-제목 겹침을 계산할 때 쓴다
 * (blog-keyword-scope.ts::getOrComputeBlogContentKeywords 참고). */
export async function fetchAllBlogPostTitles(): Promise<string[]> {
  const { data, error } = await getSupabaseClient().from("blog_posts").select("title");
  if (error) throw new Error(`blog_posts 제목 조회 실패: ${error.message}`);
  return (data ?? []).map((r) => r.title).filter((t): t is string => Boolean(t));
}

export async function upsertBlogSovDaily(rows: Tables["blog_sov_daily"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("blog_sov_daily")
    .upsert(rows, { onConflict: "date,keyword_id,competitor_id" });
  if (error) throw new Error(`blog_sov_daily upsert 실패: ${error.message}`);
}

export async function upsertPostingCadence(rows: Tables["posting_cadence"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("posting_cadence")
    .upsert(rows, { onConflict: "date,competitor_id" });
  if (error) throw new Error(`posting_cadence upsert 실패: ${error.message}`);
}

export async function insertAlerts(rows: Tables["alerts"]["Insert"][]) {
  if (rows.length === 0) return;
  // alerts는 unique 제약이 없다(같은 날 여러 건 가능) — 매 실행마다 insert.
  const { error } = await getSupabaseClient().from("alerts").insert(rows);
  if (error) throw new Error(`alerts insert 실패: ${error.message}`);
}

export async function upsertNewsArticles(rows: Tables["news_articles"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient().from("news_articles").upsert(rows, { onConflict: "link" });
  if (error) throw new Error(`news_articles upsert 실패: ${error.message}`);
}

export async function upsertBudgetBids(rows: Tables["budget_bids"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("budget_bids")
    .upsert(rows, { onConflict: "bid_no,bid_ord" });
  if (error) throw new Error(`budget_bids upsert 실패: ${error.message}`);
}

export async function upsertPrespecNotices(rows: Tables["prespec_notices"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("prespec_notices")
    .upsert(rows, { onConflict: "pre_spec_reg_no" });
  if (error) throw new Error(`prespec_notices upsert 실패: ${error.message}`);
}

export async function upsertYoutubeChannelStats(row: Tables["youtube_channel_stats"]["Insert"]) {
  const { error } = await getSupabaseClient()
    .from("youtube_channel_stats")
    .upsert(row, { onConflict: "date" });
  if (error) throw new Error(`youtube_channel_stats upsert 실패: ${error.message}`);
}

export async function upsertYoutubeVideos(rows: Tables["youtube_videos"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("youtube_videos")
    .upsert(rows, { onConflict: "video_id" });
  if (error) throw new Error(`youtube_videos upsert 실패: ${error.message}`);
}

/** 팀 노션 "행사 및 스케쥴"을 매번 전체 다시 읽어와 그대로 덮어쓴다 — notion_page_id가
 * 고유키. Notion 쪽에서 삭제된 항목은 이 upsert만으로는 안 지워지므로, 오늘 동기화에서
 * 온 notion_page_id 목록에 없는 기존 행은 별도로 삭제한다(deleteStaleTeamEvents). */
export async function upsertTeamEvents(rows: Tables["team_events"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("team_events")
    .upsert(rows, { onConflict: "notion_page_id" });
  if (error) throw new Error(`team_events upsert 실패: ${error.message}`);
}

export async function deleteStaleTeamEvents(currentPageIds: string[]) {
  const { error } = await getSupabaseClient()
    .from("team_events")
    .delete()
    .not("notion_page_id", "in", `(${currentPageIds.map((id) => `"${id}"`).join(",")})`);
  if (error) throw new Error(`team_events 삭제 실패: ${error.message}`);
}

export async function upsertDailyReport(row: Tables["daily_reports"]["Insert"]) {
  const { error } = await getSupabaseClient()
    .from("daily_reports")
    .upsert(row, { onConflict: "date,report_type,track" });
  if (error) throw new Error(`daily_reports upsert 실패: ${error.message}`);
}

/** naver_keyword_id → keywords.id(UUID) 맵. processed JSON은 naver_keyword_id로 키워드를
 * 참조하므로, ad_spend_estimates/keyword_daily_metrics 등 FK 컬럼을 채우기 전에 필요하다. */
export async function fetchKeywordIdMap(): Promise<Map<string, string>> {
  const { data, error } = await getSupabaseClient()
    .from("keywords")
    .select("id, naver_keyword_id");
  if (error) throw new Error(`keywords 조회 실패: ${error.message}`);
  return new Map((data ?? []).map((k) => [k.naver_keyword_id, k.id]));
}

export async function fetchActiveKeywords() {
  const { data, error } = await getSupabaseClient()
    .from("keywords")
    .select("*")
    .eq("is_excluded", false);
  if (error) throw new Error(`keywords 조회 실패: ${error.message}`);
  return data ?? [];
}

export async function fetchCompetitorsFromDb() {
  const { data, error } = await getSupabaseClient().from("competitors").select("*");
  if (error) throw new Error(`competitors 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 참고용 스냅샷 테이블이라 이력을 누적하지 않고 매번 통째로 교체한다(delete-all →
 * bulk insert). 자연키가 없는 공공데이터(같은 시설명이 여러 지역에 존재 가능)라
 * upsert onConflict를 쓸 수 없다. */
export async function replaceYouthFacilities(rows: Tables["youth_facilities"]["Insert"][]) {
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("youth_facilities")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(`youth_facilities 초기화 실패: ${deleteError.message}`);

  if (rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("youth_facilities").insert(batch);
    if (error) throw new Error(`youth_facilities insert 실패: ${error.message}`);
  }
}

/** 참고용 스냅샷 테이블이라 이력을 누적하지 않고 매번 통째로 교체한다(delete-all →
 * bulk insert) — youth_facilities와 동일한 이유(자연키 없는 공공데이터). */
export async function replaceDisabilityOrganizations(
  rows: Tables["disability_organizations"]["Insert"][]
) {
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("disability_organizations")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(`disability_organizations 초기화 실패: ${deleteError.message}`);

  if (rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("disability_organizations").insert(batch);
    if (error) throw new Error(`disability_organizations insert 실패: ${error.message}`);
  }
}

/** 참고용 스냅샷 테이블이라 이력을 누적하지 않고 매번 통째로 교체한다(delete-all →
 * bulk insert) — youth_facilities/disability_organizations와 동일한 이유. */
export async function replaceDisabilitySportsFacilities(
  rows: Tables["disability_sports_facilities"]["Insert"][]
) {
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("disability_sports_facilities")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(`disability_sports_facilities 초기화 실패: ${deleteError.message}`);

  if (rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("disability_sports_facilities").insert(batch);
    if (error) throw new Error(`disability_sports_facilities insert 실패: ${error.message}`);
  }
}

/** 참고용 스냅샷 테이블이라 이력을 누적하지 않고 매번 통째로 교체한다(delete-all →
 * bulk insert) — 다른 참고용 DB 테이블들과 동일한 이유. */
export async function replaceDisabilityWelfareCenters(
  rows: Tables["disability_welfare_centers"]["Insert"][]
) {
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("disability_welfare_centers")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(`disability_welfare_centers 초기화 실패: ${deleteError.message}`);

  if (rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("disability_welfare_centers").insert(batch);
    if (error) throw new Error(`disability_welfare_centers insert 실패: ${error.message}`);
  }
}

/** 참고용 스냅샷 테이블이라 이력을 누적하지 않고 매번 통째로 교체한다(delete-all →
 * bulk insert) — 다른 참고용 DB 테이블들과 동일한 이유. */
export async function replaceSpecialSchools(rows: Tables["special_schools"]["Insert"][]) {
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("special_schools")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(`special_schools 초기화 실패: ${deleteError.message}`);

  if (rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("special_schools").insert(batch);
    if (error) throw new Error(`special_schools insert 실패: ${error.message}`);
  }
}

/** 참고용 스냅샷 테이블이라 이력을 누적하지 않고 매번 통째로 교체한다(delete-all →
 * bulk insert) — 다른 참고용 DB 테이블들과 동일한 이유. */
export async function replacePublicInstitutions(rows: Tables["public_institutions"]["Insert"][]) {
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("public_institutions")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(`public_institutions 초기화 실패: ${deleteError.message}`);

  if (rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("public_institutions").insert(batch);
    if (error) throw new Error(`public_institutions insert 실패: ${error.message}`);
  }
}

/** 참고용 스냅샷 테이블이라 이력을 누적하지 않고 매번 통째로 교체한다(delete-all →
 * bulk insert) — 다른 참고용 DB 테이블들과 동일한 이유. 전국 약 3.5만 건 규모라
 * insert 배치 크기를 다른 테이블과 동일하게 500건씩 유지한다. */
export async function replaceSeniorWelfareFacilities(rows: Tables["senior_welfare_facilities"]["Insert"][]) {
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("senior_welfare_facilities")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw new Error(`senior_welfare_facilities 초기화 실패: ${deleteError.message}`);

  if (rows.length === 0) return;
  const BATCH_SIZE = 500;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("senior_welfare_facilities").insert(batch);
    if (error) throw new Error(`senior_welfare_facilities insert 실패: ${error.message}`);
  }
}

// ============================================================================
// 알림(팀 공유 피드) — 대시보드의 notifications 테이블에 service_role로 직접 삽입한다.
// diff 계열 함수는 반드시 해당 트랙의 upsert 호출 "이전"에 먼저 실행해야 한다 —
// upsert 전 Supabase에 남아있는 값이 "어제까지의 상태"이기 때문이다. 팀일정/비즈니스
// /유튜브는 신규 항목만 감지한다(필드 단위 변경 diff는 범위 밖 — 사용자 확인,
// 2026-08-21). 비즈니스는 stage/status 변경도 추가로 감지한다(참고 화면 예시가
// 진행 단계 변화를 알려주는 형태였음).
export async function insertNotifications(rows: Tables["notifications"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient().from("notifications").insert(rows);
  if (error) throw new Error(`notifications insert 실패: ${error.message}`);
}

/** 팀일정(E) — 신규 일정만 감지해 알림 row를 만든다. */
export async function diffNewTeamEvents(
  rows: Tables["team_events"]["Insert"][]
): Promise<Tables["notifications"]["Insert"][]> {
  if (rows.length === 0) return [];
  const { data: existing, error } = await getSupabaseClient().from("team_events").select("notion_page_id");
  if (error) throw new Error(`team_events 기존 상태 조회 실패: ${error.message}`);
  const existingIds = new Set((existing ?? []).map((r) => r.notion_page_id));

  return rows
    .filter((r) => !existingIds.has(r.notion_page_id))
    .map((r) => ({
      type: "event" as const,
      title: r.title,
      message: `새 일정이 등록되었습니다 (${r.date_start.slice(0, 10)})`,
      link: "/dashboard/events",
    }));
}

/** 유튜브(Y) — 신규 업로드 영상만 감지해 알림 row를 만든다. */
export async function diffNewYoutubeVideos(
  rows: Tables["youtube_videos"]["Insert"][]
): Promise<Tables["notifications"]["Insert"][]> {
  if (rows.length === 0) return [];
  const { data: existing, error } = await getSupabaseClient().from("youtube_videos").select("video_id");
  if (error) throw new Error(`youtube_videos 기존 상태 조회 실패: ${error.message}`);
  const existingIds = new Set((existing ?? []).map((r) => r.video_id));

  return rows
    .filter((r) => !existingIds.has(r.video_id))
    .map((r) => ({
      type: "youtube" as const,
      title: r.title,
      message: "새 영상이 업로드되었습니다.",
      link: "/dashboard/youtube",
    }));
}

const BIZMONEY_LOW_THRESHOLD = 300_000;

/** 네이버키워드(A) — 검색광고 비즈머니 잔액이 30만원 미만으로 "새로 떨어졌을 때"만
 * 알림을 만든다(이미 낮은 상태가 계속돼도 매일 알림이 반복되지 않도록 임계값을
 * 아래로 통과하는 순간만 감지). */
export async function checkBizmoneyDrop(newBizmoney: number): Promise<Tables["notifications"]["Insert"][]> {
  const { data: prevRow, error } = await getSupabaseClient()
    .from("ad_account_daily_stats")
    .select("bizmoney")
    .not("bizmoney", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ad_account_daily_stats(bizmoney) 기존 상태 조회 실패: ${error.message}`);

  const prevBizmoney = prevRow?.bizmoney != null ? Number(prevRow.bizmoney) : null;
  const crossedBelow =
    prevBizmoney != null && prevBizmoney >= BIZMONEY_LOW_THRESHOLD && newBizmoney < BIZMONEY_LOW_THRESHOLD;

  if (!crossedBelow) return [];
  return [
    {
      type: "budget_low",
      title: "네이버 검색광고 비즈머니 잔액 부족",
      message: `잔액이 ${newBizmoney.toLocaleString("ko-KR")}원으로 30만원 미만입니다.`,
      link: "/dashboard/keywords",
    },
  ];
}

export type { Json };
