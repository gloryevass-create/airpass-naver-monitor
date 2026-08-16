import { getSupabaseClient } from "./supabase-client";
import type { Database, Json } from "./database.types";

type Tables = Database["public"]["Tables"];

/** 모든 upsert는 스키마의 unique 제약과 정확히 일치하는 onConflict를 쓴다 — 멱등성 스펙 참고. */

/**
 * competitors 테이블에는 name/domain에 unique 제약이 없다(스키마 고정 — 바꾸지 않음).
 * 그래서 upsert가 아니라 "이름으로 조회 → 없으면 insert" 방식으로 중복 생성을 막는다.
 * 반환값은 이후 다른 테이블(ad_spend_estimates 등)의 competitor_id 조회에 쓰는 name→id 맵.
 */
export async function ensureCompetitors(
  configCompetitors: { name: string; domain?: string; blog_id?: string }[]
): Promise<Map<string, string>> {
  const supabase = getSupabaseClient();
  const { data: existing, error: selectError } = await supabase.from("competitors").select("*");
  if (selectError) throw new Error(`competitors 조회 실패: ${selectError.message}`);

  const nameToId = new Map((existing ?? []).map((c) => [c.name, c.id]));
  const missing = configCompetitors.filter((c) => !nameToId.has(c.name));

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("competitors")
      .insert(
        missing.map((c) => ({
          name: c.name,
          domain: c.domain ?? null,
          blog_id: c.blog_id ?? null,
        }))
      )
      .select("*");
    if (insertError) throw new Error(`competitors insert 실패: ${insertError.message}`);
    for (const c of inserted ?? []) nameToId.set(c.name, c.id);
  }

  return nameToId;
}

export async function upsertKeywords(rows: Tables["keywords"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("keywords")
    .upsert(rows, { onConflict: "naver_keyword_id" });
  if (error) throw new Error(`keywords upsert 실패: ${error.message}`);
}

export async function upsertKeywordDailyMetrics(rows: Tables["keyword_daily_metrics"]["Insert"][]) {
  if (rows.length === 0) return;
  const { error } = await getSupabaseClient()
    .from("keyword_daily_metrics")
    .upsert(rows, { onConflict: "date,keyword_id" });
  if (error) throw new Error(`keyword_daily_metrics upsert 실패: ${error.message}`);
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

export type { Json };
