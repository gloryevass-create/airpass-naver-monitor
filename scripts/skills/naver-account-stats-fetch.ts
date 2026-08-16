import { fetchCampaigns, fetchAccountStats, fetchBizmoney } from "../lib/naver-searchad-client";
import { writeJson, rawPath } from "../lib/files";
import { todayKst, daysBeforeKst } from "../lib/dates";

const ACCOUNT_STATS_TREND_DAYS = 7;

export type AccountStatRow = {
  date: string;
  imp_cnt: number;
  clk_cnt: number;
  ccnt: number;
  sales_amt: number;
  ctr: number;
  cpc: number;
};

export type AccountStatsResult = {
  trend: AccountStatRow[];
  bizmoney: number | null;
};

/** A2.5: 계정 전체(모든 캠페인 합산) 일별 성과지표 + 비즈머니 잔액.
 * "네이버 키워드" 페이지 상단의 "광고 성과지표" 패널(노출수/클릭수/전환수 추이,
 * 비즈머니 잔액)에 쓰인다 — 경쟁사 추정치가 아니라 우리 자신의 실제 집행 데이터라
 * calc_basis 없이도 그대로 신뢰할 수 있다. */
export async function fetchAccountStatsAndBalance(date: string = todayKst()): Promise<AccountStatsResult> {
  const campaigns = await fetchCampaigns();
  const campaignIds = campaigns.map((c) => c.nccCampaignId);

  const since = daysBeforeKst(date, ACCOUNT_STATS_TREND_DAYS - 1);
  const statsRes = await fetchAccountStats(campaignIds, since, date);
  const trend: AccountStatRow[] = statsRes.data.map((d) => ({
    date: d.dateStart,
    imp_cnt: d.impCnt,
    clk_cnt: d.clkCnt,
    ccnt: d.ccnt,
    sales_amt: d.salesAmt,
    ctr: d.ctr,
    cpc: d.cpc,
  }));

  let bizmoney: number | null = null;
  try {
    const balance = await fetchBizmoney();
    bizmoney = balance.bizmoney;
  } catch (e) {
    console.error(`[naver-account-stats-fetch] 비즈머니 조회 실패(계속 진행): ${(e as Error).message}`);
  }

  const result: AccountStatsResult = { trend, bizmoney };
  writeJson(rawPath(date, "account_stats.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchAccountStatsAndBalance()
    .then((r) => console.log(`[naver-account-stats-fetch] ${r.trend.length}일치 계정 성과지표 + 비즈머니 수집 완료`))
    .catch((e) => {
      console.error(`[naver-account-stats-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
