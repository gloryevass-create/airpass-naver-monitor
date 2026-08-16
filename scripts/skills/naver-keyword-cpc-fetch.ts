import { fetchKeywordStatReport } from "../lib/naver-searchad-client";
import { readJson, writeJson, rawPath } from "../lib/files";
import { todayKst, daysBeforeKst } from "../lib/dates";
import type { SyncResult } from "./naver-keyword-sync";

export type CpcResult = {
  naver_keyword_id: string;
  keyword: string;
  avg_cpc: number | null; // 최근 7일 실제 집행 지출액/클릭수 — 추정치 아님. 클릭이 없으면 null.
  skipped?: boolean;
  error?: string;
};

const CPC_WINDOW_DAYS = 7;

/** A2.6: 전체 등록 키워드(917개 규모)의 실제 평균 CPC.
 *
 * "우리 순위"(A3)는 비용 절감을 위해 월간검색량 상위 50개만 조회하지만, CPC는 등록된
 * 키워드 전체에 대해 알고 싶다는 요구가 있어 별도 단계로 분리했다. /stats는 id 하나당
 * 호출 1건이 필요해(여러 id를 묶으면 합산 결과만 나옴, 개별 분해 안 됨) 917번의 순차
 * 호출이 필요하지만, 실측(2026-08-17) 결과 건당 ~200ms로 전체 약 3분이면 끝난다.
 * 실제 클릭이 없었던 키워드는 CPC를 계산할 근거가 없으므로 null로 둔다(값을 지어내지 않는다). */
export async function fetchAllKeywordCpc(date: string = todayKst()): Promise<CpcResult[]> {
  const synced = readJson<SyncResult>(rawPath(date, "keywords_synced.json"));
  if (!synced) {
    throw new Error(
      `${rawPath(date, "keywords_synced.json")} 없음 — naver-keyword-sync를 먼저 실행하세요.`
    );
  }

  const since = daysBeforeKst(date, CPC_WINDOW_DAYS - 1);
  const results: CpcResult[] = [];

  for (const kw of synced.synced) {
    try {
      const { data } = await fetchKeywordStatReport(kw.naver_keyword_id, since, date);
      const totalClicks = data.reduce((sum, d) => sum + d.clkCnt, 0);
      const totalSales = data.reduce((sum, d) => sum + d.salesAmt, 0);
      const avgCpc = totalClicks > 0 ? Math.round((totalSales / totalClicks) * 100) / 100 : null;

      results.push({ naver_keyword_id: kw.naver_keyword_id, keyword: kw.keyword, avg_cpc: avgCpc });
    } catch (e) {
      results.push({
        naver_keyword_id: kw.naver_keyword_id,
        keyword: kw.keyword,
        avg_cpc: null,
        skipped: true,
        error: (e as Error).message,
      });
    }
  }

  writeJson(rawPath(date, "keyword_cpc.json"), results);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchAllKeywordCpc()
    .then((r) => {
      const withCpc = r.filter((x) => x.avg_cpc != null).length;
      const failed = r.filter((x) => x.skipped).length;
      console.log(
        `[naver-keyword-cpc-fetch] 전체 ${r.length}개 중 CPC 확보 ${withCpc}개, 실패 ${failed}개`
      );
    })
    .catch((e) => {
      console.error(`[naver-keyword-cpc-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
