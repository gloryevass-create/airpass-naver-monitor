import { searchPreSpecs, type BusinessType, type PreSpecItem } from "../lib/g2b-client";
import { fetchMonitorKeywords } from "../lib/monitor-keywords";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst, daysBeforeKst } from "../lib/dates";

const BUSINESS_TYPES: BusinessType[] = ["cnstwk", "servc", "thng"];
const WINDOW_DAYS = 30; // 입찰공고 API와 동일한 제약으로 보수적으로 맞춤(실측 확인 전).

export type PrespecNotice = {
  keyword: string;
  business_type: BusinessType;
  pre_spec_reg_no: string;
  title: string;
  ref_no: string | null;
  notice_inst: string | null;
  demand_inst: string | null;
  budget_amount: number | null;
  registered_at: string | null; // ISO
  opinion_close_at: string | null; // ISO
  official_name: string | null;
  official_tel: string | null;
  spec_doc_urls: string[];
  bid_notice_nos: string[];
};

function toIso(ymdHm: string | undefined): string | null {
  if (!ymdHm) return null;
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

function mapItem(keyword: string, businessType: BusinessType, item: PreSpecItem): PrespecNotice {
  const specDocUrls = [
    item.specDocFileUrl1,
    item.specDocFileUrl2,
    item.specDocFileUrl3,
    item.specDocFileUrl4,
    item.specDocFileUrl5,
  ].filter((u): u is string => Boolean(u));
  const bidNoticeNos = (item.bidNtceNoList ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    keyword,
    business_type: businessType,
    pre_spec_reg_no: item.bfSpecRgstNo,
    title: item.prdctClsfcNoNm,
    ref_no: item.refNo ?? null,
    notice_inst: item.orderInsttNm ?? null,
    demand_inst: item.rlDminsttNm ?? null,
    budget_amount: toNumberOrNull(item.asignBdgtAmt),
    registered_at: toIso(item.rcptDt),
    opinion_close_at: toIso(item.opninRgstClseDt),
    official_name: item.ofclNm ?? null,
    official_tel: item.ofclTelNo ?? null,
    spec_doc_urls: specDocUrls,
    bid_notice_nos: bidNoticeNos,
  };
}

/** N5: 사전규격 모니터링(나라장터 사전규격정보서비스, 공식 API).
 *
 * g2b-budget-fetch와 동일하게 monitor_keywords(track='budget')에 등록된 키워드마다
 * 업무구분(공사/용역/물품) 3종을 모두 조회한다. 같은 키워드 목록을 재사용하는 이유는
 * 사전규격도 입찰공고와 동일한 영업 대응 목적이기 때문(대시보드 /dashboard/budget에서
 * 관리하는 키워드가 여기도 그대로 적용됨). 같은 사전규격이 여러 키워드에 걸리면
 * (pre_spec_reg_no) 기준으로 중복 제거하되 먼저 매칭된 키워드를 유지한다. */
export async function fetchPrespecNotices(date: string = todayKst()): Promise<PrespecNotice[]> {
  const keywords = await fetchMonitorKeywords("budget");
  const since = daysBeforeKst(date, WINDOW_DAYS - 1).replace(/-/g, "");
  const until = date.replace(/-/g, "");

  const seen = new Set<string>();
  const results: PrespecNotice[] = [];

  for (const keyword of keywords) {
    for (const businessType of BUSINESS_TYPES) {
      const items = await searchPreSpecs(businessType, keyword, since, until);
      for (const item of items) {
        if (seen.has(item.bfSpecRgstNo)) continue;
        seen.add(item.bfSpecRgstNo);
        results.push(mapItem(keyword, businessType, item));
      }
      await new Promise((resolve) => setTimeout(resolve, 300)); // 연속 호출 간격
    }
  }

  writeJson(rawPath(date, "prespec_notices.json"), results);
  writeJson(processedPath(date, "prespec_{date}.json"), { date, notices: results });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchPrespecNotices()
    .then((r) => console.log(`[g2b-prespec-fetch] ${r.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[g2b-prespec-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
