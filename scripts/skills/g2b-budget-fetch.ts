import { searchBids, type BusinessType, type BidItem } from "../lib/g2b-client";
import { loadBudgetKeywords } from "../lib/config";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst, daysBeforeKst } from "../lib/dates";

const BUSINESS_TYPES: BusinessType[] = ["cnstwk", "servc", "thng"];
const WINDOW_DAYS = 30; // 나라장터 API의 조회 기간 최대 한도(실측 확인, 2026-08-17)

export type BudgetBid = {
  keyword: string;
  business_type: BusinessType;
  bid_no: string;
  bid_ord: string;
  title: string;
  notice_inst: string | null;
  demand_inst: string | null;
  budget_amount: number | null;
  presmpt_price: number | null;
  notice_date: string | null; // ISO
  opening_date: string | null; // ISO
  detail_url: string | null;
};

function toIso(ymdHm: string | undefined): string | null {
  if (!ymdHm) return null;
  // "2026-08-13 18:00" / "2026-08-13 18:00:00" 형태 — 나라장터는 항상 KST 기준.
  const normalized = ymdHm.trim().replace(" ", "T");
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const d = new Date(`${withSeconds}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toNumberOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapItem(keyword: string, businessType: BusinessType, item: BidItem): BudgetBid {
  return {
    keyword,
    business_type: businessType,
    bid_no: item.bidNtceNo,
    bid_ord: item.bidNtceOrd || "000",
    title: item.bidNtceNm,
    notice_inst: item.ntceInsttNm ?? null,
    demand_inst: item.dminsttNm ?? null,
    budget_amount: toNumberOrNull(item.bdgtAmt),
    presmpt_price: toNumberOrNull(item.presmptPrce),
    notice_date: toIso(item.bidNtceDt),
    opening_date: toIso(item.opengDt),
    detail_url: item.bidNtceDtlUrl || null,
  };
}

/** N3: 교육청 예산·사업명 모니터링(나라장터 입찰공고정보서비스, 공식 API).
 *
 * config/budget_keywords.yaml에 등록된 키워드마다 업무구분(공사/용역/물품) 3종을 모두
 * 조회한다 — 같은 사업이라도 발주 방식에 따라 공사/용역/물품 어디에 걸릴지 예측할 수
 * 없어서다. 같은 공고가 여러 키워드에 걸리면 (bid_no, bid_ord) 기준으로 중복 제거하되
 * 먼저 매칭된 키워드를 유지한다. */
export async function fetchBudgetBids(date: string = todayKst()): Promise<BudgetBid[]> {
  const keywords = loadBudgetKeywords();
  const since = daysBeforeKst(date, WINDOW_DAYS - 1).replace(/-/g, "");
  const until = date.replace(/-/g, "");

  const seen = new Set<string>();
  const results: BudgetBid[] = [];

  for (const keyword of keywords) {
    for (const businessType of BUSINESS_TYPES) {
      const items = await searchBids(businessType, keyword, since, until);
      for (const item of items) {
        const key = `${item.bidNtceNo}:${item.bidNtceOrd || "000"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(mapItem(keyword, businessType, item));
      }
      await new Promise((resolve) => setTimeout(resolve, 300)); // 연속 호출 간격
    }
  }

  writeJson(rawPath(date, "budget_bids.json"), results);
  // 뉴스와 마찬가지로 추가 판단 단계가 없는 순수 수집 데이터라 processed 파일도 함께 저장.
  writeJson(processedPath(date, "budget_{date}.json"), { date, bids: results });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBudgetBids()
    .then((r) => console.log(`[g2b-budget-fetch] ${r.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[g2b-budget-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
