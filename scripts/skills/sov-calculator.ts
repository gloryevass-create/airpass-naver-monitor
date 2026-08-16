import { readJson, writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { loadCompetitors } from "../lib/config";
import type { BlogSerpResult } from "./naver-blog-fetch";

export type SovResult = {
  naver_keyword_id: string;
  competitor_name: string;
  share_pct: number;
};

/** B5: 키워드별 블로그 노출 점유율(SOV) — 상위 N개 중 경쟁사별 등장 비율. */
export function calculateSov(date: string = todayKst()): SovResult[] {
  const serp = readJson<BlogSerpResult[]>(rawPath(date, "blog_serp_snapshot.json"));
  if (!serp) {
    throw new Error(`${rawPath(date, "blog_serp_snapshot.json")} 없음 — naver-blog-fetch를 먼저 실행하세요.`);
  }

  const competitors = loadCompetitors();
  const byBlogId = new Map(competitors.filter((c) => c.blog_id).map((c) => [c.blog_id, c.name]));

  const results: SovResult[] = [];

  for (const kw of serp) {
    if (kw.skipped || kw.topBlogIds.length === 0) continue;

    const counts = new Map<string, number>();
    for (const blogId of kw.topBlogIds) {
      const name = byBlogId.get(blogId);
      if (!name) continue; // 등록된 경쟁사가 아니면 SOV 집계에서 제외
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    for (const [competitorName, count] of counts) {
      results.push({
        naver_keyword_id: kw.naver_keyword_id,
        competitor_name: competitorName,
        share_pct: Math.round((count / kw.topBlogIds.length) * 1000) / 10,
      });
    }
  }

  writeJson(rawPath(date, "blog_sov.json"), results);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const r = calculateSov();
    console.log(`[sov-calculator] ${r.length}건 SOV 산출 완료`);
  } catch (e) {
    console.error(`[sov-calculator] 실패: ${(e as Error).message}`);
    process.exit(1);
  }
}
