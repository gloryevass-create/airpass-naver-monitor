import { readJson, writeJson, rawPath } from "./files";
import { todayKst } from "./dates";
import { syncKeywords, type SyncResult, type SyncedKeyword } from "../skills/naver-keyword-sync";
import { fetchSearchAdStats, type KeywordStat } from "../skills/naver-searchad-fetch";

/**
 * A3(파워링크 노출순서 스크래핑)와 B2(블로그 검색결과 스크래핑)는 계정에 등록된 전체
 * 키워드(917개 규모)를 매일 다 돌리기엔 실행시간·네이버 차단 위험이 너무 크다고 판단해
 * (사용자 확인) 월간검색량 상위 N개로만 범위를 좁힌다. 검색량·경쟁정도(A2)는 공식 API라
 * 여전히 전체 키워드에 대해 매일 수집한다 — 스크래핑만 좁히는 것이다.
 */
export const SCRAPE_TARGET_COUNT = 50;

export type ScrapeTarget = SyncedKeyword & { totalMonthlySearch: number };

/**
 * data/raw/<date>/scrape_targets.json이 이미 있으면 그걸 쓰고, 없으면
 * keywords_synced.json / searchad_stats.json이 없는 경우 직접 만들어서라도 계산한다 —
 * ad-monitor/blog-monitor 어느 쪽이 먼저 실행되어도(B 트랙 단독 실행 포함) 동일한
 * 상위 N개 기준을 쓰게 하기 위함(멱등 + 두 트랙 간 일관성).
 */
export async function getOrComputeScrapeTargets(
  date: string = todayKst(),
  limit: number = SCRAPE_TARGET_COUNT
): Promise<ScrapeTarget[]> {
  const cached = readJson<ScrapeTarget[]>(rawPath(date, "scrape_targets.json"));
  if (cached) return cached;

  let synced = readJson<SyncResult>(rawPath(date, "keywords_synced.json"));
  if (!synced) {
    synced = await syncKeywords(date);
  }

  let stats = readJson<KeywordStat[]>(rawPath(date, "searchad_stats.json"));
  if (!stats) {
    stats = await fetchSearchAdStats(date);
  }

  const volumeByKeywordId = new Map(
    stats.map((s) => [s.naver_keyword_id, (s.monthly_search_pc ?? 0) + (s.monthly_search_mobile ?? 0)])
  );

  const targets: ScrapeTarget[] = synced.synced
    .map((k) => ({ ...k, totalMonthlySearch: volumeByKeywordId.get(k.naver_keyword_id) ?? 0 }))
    .sort((a, b) => b.totalMonthlySearch - a.totalMonthlySearch)
    .slice(0, limit);

  writeJson(rawPath(date, "scrape_targets.json"), targets);
  return targets;
}
