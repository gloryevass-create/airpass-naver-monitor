import { writeJson, rawPath } from "../lib/files";
import { todayKst, daysBeforeKst } from "../lib/dates";
import { fetchKeywordStatReport } from "../lib/naver-searchad-client";
import { getOrComputeScrapeTargets, SCRAPE_TARGET_COUNT } from "../lib/keyword-scope";

export type RankResult = {
  naver_keyword_id: string;
  keyword: string;
  ourRank: number | null; // 1-based, 없으면 null
  avgCpc: number | null; // 실제 집행 평균 CPC(추정치 아님) — 클릭이 없었으면 null
  skipped?: boolean;
  error?: string;
};

/**
 * A3: "우리 순위" 확정.
 *
 * 원래 계획은 검색결과 페이지의 파워링크(광고) 영역을 Playwright로 스크래핑해
 * 경쟁사 도메인·노출순서까지 함께 수집하는 것이었다(예전 스킬명: naver-serp-scraper).
 * 실 계정으로 검증한 결과 두 가지 이유로 이 방식을 포기했다(사용자 확인 완료,
 * 상세 근거는 CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절):
 *   1) search.naver.com/robots.txt가 모든 User-agent에 대해 전체 경로를 금지한다
 *      (`Disallow: /`) — 셀렉터 문제가 아니라 애초에 이 경로를 크롤링하면 안 된다.
 *   2) robots.txt 확인 전 디버깅 단계에서도, 실제 입찰 경쟁이 있는 키워드조차
 *      파워링크 광고 콘텐츠 자체가 자동화 세션에는 비어 있었다(네이버의 광고
 *      사기 방지 조치로 추정).
 *
 * 그래서 "우리 순위"는 검색광고 공식 통계 API(`/stats`의 `avgRnk`, 실제 집행
 * 데이터)로 얻고, "경쟁사가 어떤 도메인으로 파워링크에 노출되는지"는 자동 수집을
 * 포기했다 — ad-spend-estimator(A4/A5)는 그 결과 항상 빈 데이터를 만들고,
 * 리포트에는 "경쟁사 광고비는 공식 API·합법적 수집 경로가 없어 자동 수집하지
 * 못했다"고 명시한다(근거 없는 추정치를 지어내지 않는다는 환각 차단 원칙).
 */
export async function trackRank(date: string = todayKst()): Promise<RankResult[]> {
  const targets = await getOrComputeScrapeTargets(date);
  const since = daysBeforeKst(date, 6);
  const results: RankResult[] = [];

  for (const kw of targets) {
    try {
      const { data } = await fetchKeywordStatReport(kw.naver_keyword_id, since, date);
      const withImpressions = data
        .filter((d) => d.impCnt > 0)
        .sort((a, b) => (a.dateEnd < b.dateEnd ? 1 : -1));

      // 평균 CPC는 입찰 추정치가 아니라 최근 7일간 실제 집행된 지출액/클릭수로 계산한
      // 실제 평균 단가다(biz channel 연동 없이도 얻을 수 있음) — 클릭이 하나도 없었던
      // 기간이면 나눗셈이 무의미하므로 null로 둔다.
      const totalClicks = data.reduce((sum, d) => sum + d.clkCnt, 0);
      const totalSales = data.reduce((sum, d) => sum + d.salesAmt, 0);
      const avgCpc = totalClicks > 0 ? Math.round((totalSales / totalClicks) * 100) / 100 : null;

      results.push({
        naver_keyword_id: kw.naver_keyword_id,
        keyword: kw.keyword,
        ourRank: withImpressions[0]?.avgRnk ?? null,
        avgCpc,
      });
    } catch (e) {
      results.push({
        naver_keyword_id: kw.naver_keyword_id,
        keyword: kw.keyword,
        ourRank: null,
        avgCpc: null,
        skipped: true,
        error: (e as Error).message,
      });
    }
  }

  writeJson(rawPath(date, "rank_snapshot.json"), results);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  trackRank()
    .then((r) => {
      const failed = r.filter((x) => x.skipped).length;
      console.log(
        `[naver-rank-tracker] 월간검색량 상위 ${SCRAPE_TARGET_COUNT}개 중 ${r.length}개 순위 확인, 실패 ${failed}개`
      );
    })
    .catch((e) => {
      console.error(`[naver-rank-tracker] 실패: ${e.message}`);
      process.exit(1);
    });
}
