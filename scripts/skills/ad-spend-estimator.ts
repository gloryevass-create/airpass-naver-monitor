import { readJson, writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { mapDomainsToCompetitors } from "../lib/domain-mapper";
import type { SyncResult } from "./naver-keyword-sync";
import type { KeywordStat } from "./naver-searchad-fetch";
import type { SerpResult } from "./naver-serp-scraper";

// 가정값 — 모두 calc_basis에 그대로 기록해 각주로 표기한다(환각 차단 스펙).
const ASSUMED_OPERATING_DAYS = 30;
const CTR_BY_RANK: Record<number, number> = {
  1: 0.08,
  2: 0.05,
  3: 0.035,
  4: 0.025,
  5: 0.02,
};
const DEFAULT_CTR_BEYOND_RANK5 = 0.01;

function ctrForRank(rank: number): number {
  return CTR_BY_RANK[rank] ?? DEFAULT_CTR_BEYOND_RANK5;
}

export type SpendEstimate = {
  competitor_name: string;
  naver_keyword_id: string;
  estimated_monthly_spend: number;
  calc_basis: {
    rank: number;
    monthly_search_total: number;
    assumed_ctr: number;
    assumed_operating_days: number;
    avg_cpc: number;
    formula: string;
    source_files: string[];
  };
};

/**
 * A5: 경쟁사별 월 예상 광고비 산출. 노출순위×CPC×가정 클릭률×운영일수.
 * 산출식과 가정값을 결과에 함께 기록한다 — 근거 없는 수치는 만들지 않는다.
 *
 * ⚠️ 미완성 지점: 경쟁사 실제 입찰가는 알 수 없으므로, 같은 순위 슬롯의 예상
 * 낙찰가(estimate/average-position-bid API)를 프록시로 써야 하는데 이 API는
 * 계정의 biz channel key가 있어야 정확히 호출할 수 있다. 실제 네이버 검색광고
 * 계정 정보를 받아 scripts/lib/naver-searchad-client.ts::fetchEstimateBid 연동을
 * 완성하기 전까지는 avg_cpc가 0으로 남아 산출값도 0이 된다 — 이 경우 가짜 숫자를
 * DB에 넣지 않도록 해당 항목을 건너뛰고 경고만 남긴다.
 */
export async function estimateAdSpend(date: string = todayKst()): Promise<SpendEstimate[]> {
  const synced = readJson<SyncResult>(rawPath(date, "keywords_synced.json"));
  const stats = readJson<KeywordStat[]>(rawPath(date, "searchad_stats.json"));
  const serp = readJson<SerpResult[]>(rawPath(date, "serp_snapshot.json"));

  if (!synced || !stats || !serp) {
    throw new Error(
      "필요한 raw 파일이 없습니다 — naver-keyword-sync / naver-searchad-fetch / naver-serp-scraper를 먼저 실행하세요."
    );
  }

  const statByKeywordId = new Map(stats.map((s) => [s.naver_keyword_id, s]));
  const estimates: SpendEstimate[] = [];

  const allDomains = [...new Set(serp.flatMap((s) => s.powerlinkDomains))];
  const mapping = mapDomainsToCompetitors(allDomains, date);
  const mappingByDomain = new Map(mapping.map((m) => [m.domain, m]));

  for (const serpResult of serp) {
    if (serpResult.skipped) continue;
    const stat = statByKeywordId.get(serpResult.naver_keyword_id);
    if (!stat) continue;

    const monthlySearchTotal =
      (stat.monthly_search_pc ?? 0) + (stat.monthly_search_mobile ?? 0);

    serpResult.powerlinkDomains.forEach((domain, idx) => {
      const rank = idx + 1;
      const mapped = mappingByDomain.get(domain);
      if (!mapped?.competitorName) return; // 매핑 안 된 도메인은 경쟁사로 집계하지 않음(에스컬레이션 로그로 대체)

      // 해당 순위 슬롯의 예상 낙찰가를 프록시로 쓴다 — 경쟁사 실제 입찰가는 비공개이므로
      // "같은 순위는 비슷한 CPC로 낙찰됐을 것"이라는 가정. 이 가정 자체가 calc_basis에 남는다.
      // TODO(실 계정 연동 필요): fetchEstimateBid가 아직 미연동 상태라 avgCpc=0 → 이 항목은 스킵.
      const avgCpc = 0;
      if (avgCpc <= 0) {
        console.warn(
          `[ad-spend-estimator] "${mapped.competitorName}" / ${serpResult.keyword}(순위 ${rank}): avg_cpc를 아직 구할 수 없어 건너뜁니다 (fetchEstimateBid 연동 필요)`
        );
        return;
      }
      const ctr = ctrForRank(rank);
      const dailyClicks = (monthlySearchTotal / 30) * ctr;
      const estimatedMonthlySpend = dailyClicks * avgCpc * ASSUMED_OPERATING_DAYS;

      estimates.push({
        competitor_name: mapped.competitorName,
        naver_keyword_id: serpResult.naver_keyword_id,
        estimated_monthly_spend: Math.round(estimatedMonthlySpend),
        calc_basis: {
          rank,
          monthly_search_total: monthlySearchTotal,
          assumed_ctr: ctr,
          assumed_operating_days: ASSUMED_OPERATING_DAYS,
          avg_cpc: avgCpc,
          formula: "estimated_monthly_spend = (monthly_search_total/30) * assumed_ctr * avg_cpc * assumed_operating_days",
          source_files: [
            rawPath(date, "keywords_synced.json"),
            rawPath(date, "searchad_stats.json"),
            rawPath(date, "serp_snapshot.json"),
          ],
        },
      });
    });
  }

  writeJson(rawPath(date, "ad_spend_estimates.json"), estimates);
  return estimates;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  estimateAdSpend()
    .then((e) => console.log(`[ad-spend-estimator] ${e.length}건 산출 완료`))
    .catch((err) => {
      console.error(`[ad-spend-estimator] 실패: ${err.message}`);
      process.exit(1);
    });
}
