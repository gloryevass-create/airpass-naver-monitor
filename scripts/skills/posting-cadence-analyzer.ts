import { readJson, writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { loadCompetitors } from "../lib/config";
import type { BlogPost } from "./naver-blog-fetch";

export type CadenceResult = {
  competitor_name: string;
  avg_interval_days: number | null;
  last_post_at: string | null;
  post_count_30d: number;
};

/** B4: 포스팅 주기 계산 — 평균 발행 간격, 최근 게시일, 최근 30일 게시물 수. */
export function analyzeCadence(date: string = todayKst()): CadenceResult[] {
  const posts = readJson<BlogPost[]>(rawPath(date, "blog_posts.json"));
  if (!posts) {
    throw new Error(`${rawPath(date, "blog_posts.json")} 없음 — naver-blog-fetch를 먼저 실행하세요.`);
  }

  const competitors = loadCompetitors();
  const cutoff30d = new Date(`${date}T00:00:00Z`);
  cutoff30d.setUTCDate(cutoff30d.getUTCDate() - 30);
  const cutoffStr = cutoff30d.toISOString().slice(0, 10);

  const results: CadenceResult[] = [];

  for (const competitor of competitors) {
    const own = posts
      .filter((p) => p.competitor_name === competitor.name && p.published_at)
      .sort((a, b) => (a.published_at! < b.published_at! ? 1 : -1)); // 최신순

    if (own.length === 0) {
      results.push({
        competitor_name: competitor.name,
        avg_interval_days: null,
        last_post_at: null,
        post_count_30d: 0,
      });
      continue;
    }

    // 발행 간격은 최근 30일 내 게시물만으로 계산한다 — 전체 이력으로 계산하면 초기의
    // 뜸한 시기까지 섞여 최근 실제 포스팅 빈도를 왜곡한다(예: 최근엔 자주 올리는데
    // 전체 평균은 예전의 뜸한 시기 탓에 크게 나옴).
    const recent = own.filter((p) => p.published_at! >= cutoffStr);
    const dates = recent.map((p) => new Date(`${p.published_at}T00:00:00Z`).getTime());
    let totalGapDays = 0;
    for (let i = 0; i < dates.length - 1; i++) {
      totalGapDays += (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
    }
    const avgIntervalDays = dates.length > 1 ? totalGapDays / (dates.length - 1) : null;

    results.push({
      competitor_name: competitor.name,
      avg_interval_days: avgIntervalDays != null ? Math.round(avgIntervalDays * 10) / 10 : null,
      last_post_at: own[0].published_at,
      post_count_30d: recent.length,
    });
  }

  writeJson(rawPath(date, "posting_cadence.json"), results);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const r = analyzeCadence();
    console.log(`[posting-cadence-analyzer] ${r.length}개 경쟁사 분석 완료`);
  } catch (e) {
    console.error(`[posting-cadence-analyzer] 실패: ${(e as Error).message}`);
    process.exit(1);
  }
}
