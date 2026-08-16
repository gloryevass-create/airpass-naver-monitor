import { fetchKeywordStats } from "../lib/naver-searchad-client";
import { readJson, writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import type { SyncResult } from "./naver-keyword-sync";

export type KeywordStat = {
  naver_keyword_id: string;
  keyword: string;
  monthly_search_pc: number | null;
  monthly_search_mobile: number | null;
  competition_level: string | null;
};

/** A2: 예상입찰가·월간검색수·경쟁정도. 순위(our_rank)는 A3(SERP 스크래핑)에서 채운다. */
export async function fetchSearchAdStats(date: string = todayKst()): Promise<KeywordStat[]> {
  const synced = readJson<SyncResult>(rawPath(date, "keywords_synced.json"));
  if (!synced) {
    throw new Error(
      `${rawPath(date, "keywords_synced.json")} 없음 — naver-keyword-sync를 먼저 실행하세요.`
    );
  }

  const keywordTexts = synced.synced.map((k) => k.keyword);
  const stats: KeywordStat[] = [];

  // 키워드도구 API는 한 번에 여러 키워드를 받을 수 있으나 계정 제한에 따라 배치 처리.
  const BATCH_SIZE = 5;
  for (let i = 0; i < keywordTexts.length; i += BATCH_SIZE) {
    const batch = keywordTexts.slice(i, i + BATCH_SIZE);
    const res = await fetchKeywordStats(batch);
    for (const item of res.keywordList) {
      const matched = synced.synced.find((k) => k.keyword === item.relKeyword);
      if (!matched) continue;
      stats.push({
        naver_keyword_id: matched.naver_keyword_id,
        keyword: matched.keyword,
        monthly_search_pc:
          typeof item.monthlyPcQcCnt === "number" ? item.monthlyPcQcCnt : Number(item.monthlyPcQcCnt) || null,
        monthly_search_mobile:
          typeof item.monthlyMobileQcCnt === "number"
            ? item.monthlyMobileQcCnt
            : Number(item.monthlyMobileQcCnt) || null,
        competition_level: item.compIdx ?? null,
      });
    }
  }

  writeJson(rawPath(date, "searchad_stats.json"), stats);
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchSearchAdStats()
    .then((s) => console.log(`[naver-searchad-fetch] ${s.length}개 키워드 통계 수집 완료`))
    .catch((e) => {
      console.error(`[naver-searchad-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
