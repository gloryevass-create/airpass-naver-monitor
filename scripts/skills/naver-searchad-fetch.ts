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

  const keywordTexts = [...new Set(synced.synced.map((k) => k.keyword))];

  // 키워드도구 API는 요청한 힌트 키워드 외에 연관 키워드도 함께 돌려준다 — 그 연관 키워드가
  // 우연히 우리 목록의 "다른" 키워드 텍스트와 같을 수 있어(예: "XR바이크" 조회 시 "XR사격"이
  // 연관어로 같이 옴), 배치별로 바로 push하면 같은 키워드가 여러 번 중복 수집된다.
  // 그래서 먼저 키워드 텍스트 → 통계 Map으로 모으고(중복은 자연히 1건으로 합쳐짐),
  // 그다음 우리가 실제로 동기화한 키워드 목록을 기준으로 딱 1건씩만 뽑는다.
  const statByText = new Map<
    string,
    { monthly_search_pc: number | null; monthly_search_mobile: number | null; competition_level: string | null }
  >();

  // 키워드도구 API는 한 번에 여러 키워드를 받을 수 있으나 계정 제한에 따라 배치 처리.
  const BATCH_SIZE = 5;
  for (let i = 0; i < keywordTexts.length; i += BATCH_SIZE) {
    const batch = keywordTexts.slice(i, i + BATCH_SIZE);
    const res = await fetchKeywordStats(batch);
    for (const item of res.keywordList) {
      if (statByText.has(item.relKeyword)) continue; // 이미 채워진 텍스트면 덮어쓰지 않음(첫 응답 신뢰)
      statByText.set(item.relKeyword, {
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

  const stats: KeywordStat[] = synced.synced
    .filter((k) => statByText.has(k.keyword))
    .map((k) => ({
      naver_keyword_id: k.naver_keyword_id,
      keyword: k.keyword,
      ...statByText.get(k.keyword)!,
    }));

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
