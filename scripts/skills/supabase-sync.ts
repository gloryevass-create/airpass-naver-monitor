import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadCompetitors } from "../lib/config";
import type { Json } from "../lib/database.types";
import { recordRun } from "../lib/pipeline-state";
import {
  ensureCompetitors,
  fetchKeywordIdMap,
  upsertKeywordDailyMetrics,
  upsertAdSpendEstimates,
  upsertBlogPosts,
  upsertBlogSovDaily,
  upsertPostingCadence,
  insertAlerts,
  upsertDailyReport,
} from "../lib/supabase-sync";

type ProcessedAds = {
  date: string;
  metrics: {
    naver_keyword_id: string;
    monthly_search_pc?: number | null;
    monthly_search_mobile?: number | null;
    avg_cpc?: number | null;
    competition_level?: string | null;
    our_rank?: number | null;
  }[];
  spend_estimates: {
    competitor_name: string;
    naver_keyword_id: string;
    estimated_monthly_spend: number;
    calc_basis: Record<string, unknown>;
  }[];
  alerts?: { severity: "info" | "warning" | "critical"; category: string; message: string; evidence_ref: string }[];
  report?: { report_type: "daily" | "weekly" | "monthly"; title: string; content_md: string; source_refs: string[] };
};

type ProcessedBlog = {
  date: string;
  blog_posts: { competitor_name: string; url: string; title?: string | null; published_at?: string | null }[];
  sov: { naver_keyword_id: string; competitor_name: string; share_pct: number }[];
  cadence: { competitor_name: string; avg_interval_days?: number | null; last_post_at?: string | null; post_count_30d: number }[];
  alerts?: { severity: "info" | "warning" | "critical"; category: string; message: string; evidence_ref: string }[];
  report?: { report_type: "daily" | "weekly" | "monthly"; title: string; content_md: string; source_refs: string[] };
};

/** A8: Track A(ads_*.json) 결과를 Supabase에 반영. 이미 .claude/settings.json 훅에서
 * 스키마 검증을 통과한 파일만 여기까지 온다는 전제(Spec-First). */
async function syncAds(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedAds;
  const competitorMap = await ensureCompetitors(loadCompetitors());
  const keywordMap = await fetchKeywordIdMap();

  const metricRows = data.metrics
    .filter((m) => keywordMap.has(m.naver_keyword_id))
    .map((m) => ({
      date: data.date,
      keyword_id: keywordMap.get(m.naver_keyword_id)!,
      monthly_search_pc: m.monthly_search_pc ?? null,
      monthly_search_mobile: m.monthly_search_mobile ?? null,
      avg_cpc: m.avg_cpc ?? null,
      competition_level: m.competition_level ?? null,
      // keyword_daily_metrics.our_rank는 integer 컬럼인데, 검색광고 공식 통계의 avgRnk는
      // 여러 날짜/노출의 평균이라 소수(예: 22.3)로 온다 — 반올림해서 저장한다.
      our_rank: m.our_rank != null ? Math.round(m.our_rank) : null,
    }));
  await upsertKeywordDailyMetrics(metricRows);

  const spendRows = data.spend_estimates
    .filter((s) => keywordMap.has(s.naver_keyword_id) && competitorMap.has(s.competitor_name))
    .map((s) => ({
      date: data.date,
      keyword_id: keywordMap.get(s.naver_keyword_id)!,
      competitor_id: competitorMap.get(s.competitor_name)!,
      estimated_monthly_spend: s.estimated_monthly_spend,
      calc_basis: s.calc_basis as Json,
    }));
  await upsertAdSpendEstimates(spendRows);

  if (data.alerts?.length) {
    await insertAlerts(data.alerts.map((a) => ({ date: data.date, ...a })));
  }
  if (data.report) {
    await upsertDailyReport({
      date: data.date,
      report_type: data.report.report_type,
      track: "ad",
      title: data.report.title,
      content_md: data.report.content_md,
      source_refs: data.report.source_refs,
    });
  }

  await recordRun(data.date, "ad", "success", `${metricRows.length}개 키워드, ${spendRows.length}건 광고비 추정`);
  console.log(`[supabase-sync] ad 트랙 동기화 완료 (${data.date})`);
}

/** B8: Track B(blog_*.json) 결과를 Supabase에 반영. */
async function syncBlog(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedBlog;
  const competitorMap = await ensureCompetitors(loadCompetitors());
  const keywordMap = await fetchKeywordIdMap();

  const postRows = data.blog_posts
    .filter((p) => competitorMap.has(p.competitor_name))
    .map((p) => ({
      competitor_id: competitorMap.get(p.competitor_name)!,
      url: p.url,
      title: p.title ?? null,
      published_at: p.published_at ?? null,
      collected_at: data.date,
    }));
  await upsertBlogPosts(postRows);

  const sovRows = data.sov
    .filter((s) => keywordMap.has(s.naver_keyword_id) && competitorMap.has(s.competitor_name))
    .map((s) => ({
      date: data.date,
      keyword_id: keywordMap.get(s.naver_keyword_id)!,
      competitor_id: competitorMap.get(s.competitor_name)!,
      share_pct: s.share_pct,
    }));
  await upsertBlogSovDaily(sovRows);

  const cadenceRows = data.cadence
    .filter((c) => competitorMap.has(c.competitor_name))
    .map((c) => ({
      date: data.date,
      competitor_id: competitorMap.get(c.competitor_name)!,
      avg_interval_days: c.avg_interval_days ?? null,
      last_post_at: c.last_post_at ?? null,
      post_count_30d: c.post_count_30d,
    }));
  await upsertPostingCadence(cadenceRows);

  if (data.alerts?.length) {
    await insertAlerts(data.alerts.map((a) => ({ date: data.date, ...a })));
  }
  if (data.report) {
    await upsertDailyReport({
      date: data.date,
      report_type: data.report.report_type,
      track: "blog",
      title: data.report.title,
      content_md: data.report.content_md,
      source_refs: data.report.source_refs,
    });
  }

  await recordRun(data.date, "blog", "success", `${postRows.length}건 게시물, ${sovRows.length}건 SOV`);
  console.log(`[supabase-sync] blog 트랙 동기화 완료 (${data.date})`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("사용법: tsx scripts/skills/supabase-sync.ts <data/processed/{ads,blog}_YYYY-MM-DD.json>");
    process.exit(1);
  }

  const filename = basename(filePath);
  try {
    if (filename.startsWith("blog_")) {
      await syncBlog(filePath);
    } else {
      await syncAds(filePath);
    }
  } catch (e) {
    const date = filename.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const track = filename.startsWith("blog_") ? "blog" : "ad";
    if (date) await recordRun(date, track, "failed", (e as Error).message);
    console.error(`[supabase-sync] 실패: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();
