import { fetchCampaigns, fetchAdgroups, fetchKeywords } from "../lib/naver-searchad-client";
import { upsertKeywords, markKeywordsRemoved, fetchEligibleKeywordIds } from "../lib/supabase-sync";
import { loadExcludedKeywords } from "../lib/config";
import { writeJson, rawPath, readJson } from "../lib/files";
import { todayKst, daysBeforeKst } from "../lib/dates";
import type { Database } from "../lib/database.types";

type KeywordRow = Database["public"]["Tables"]["keywords"]["Insert"];

export type SyncedKeyword = {
  naver_keyword_id: string;
  keyword: string;
  campaign_id: string;
  adgroup_id: string;
  status: string;
};

export type SyncResult = {
  date: string;
  synced: SyncedKeyword[];
  newKeywords: string[];
  removedKeywords: string[];
};

/** A0+A1: 캠페인→광고그룹→키워드를 계정에서 그대로 조회해 당일 처리 대상을 확정한다.
 * 수동 키워드 지정은 없다 — 계정에 등록된 만큼이 전부다. */
export async function syncKeywords(date: string = todayKst()): Promise<SyncResult> {
  const campaigns = await fetchCampaigns();
  const synced: SyncedKeyword[] = [];

  for (const campaign of campaigns) {
    if (campaign.status !== "ELIGIBLE") continue; // 캠페인이 일시중지/삭제 상태면 그 안의 키워드도 제외
    const adgroups = await fetchAdgroups(campaign.nccCampaignId);
    for (const adgroup of adgroups) {
      if (adgroup.status !== "ELIGIBLE") continue; // 광고그룹 단위 일시중지도 동일하게 제외
      const keywords = await fetchKeywords(adgroup.nccAdgroupId);
      for (const kw of keywords) {
        if (kw.status !== "ELIGIBLE" || kw.userLock) continue;
        synced.push({
          naver_keyword_id: kw.nccKeywordId,
          keyword: kw.keyword,
          campaign_id: campaign.nccCampaignId,
          adgroup_id: adgroup.nccAdgroupId,
          status: kw.status,
        });
      }
    }
  }

  const excluded = new Set(loadExcludedKeywords());

  // 전일 스냅샷과 비교해 신규/삭제 식별
  const prevDate = daysBeforeKst(date, 1);
  const prev = readJson<SyncResult>(rawPath(prevDate, "keywords_synced.json"));
  const prevIds = new Set((prev?.synced ?? []).map((k) => k.naver_keyword_id));
  const currentIds = new Set(synced.map((k) => k.naver_keyword_id));

  const newKeywords = synced
    .filter((k) => !prevIds.has(k.naver_keyword_id))
    .map((k) => k.naver_keyword_id);
  const removedKeywords = [...prevIds].filter((id) => !currentIds.has(id));

  const result: SyncResult = { date, synced, newKeywords, removedKeywords };
  writeJson(rawPath(date, "keywords_synced.json"), result);

  const rows: KeywordRow[] = synced.map((k) => ({
    naver_keyword_id: k.naver_keyword_id,
    keyword: k.keyword,
    campaign_id: k.campaign_id,
    adgroup_id: k.adgroup_id,
    status: k.status,
    is_excluded: excluded.has(k.keyword),
    updated_at: new Date().toISOString(),
  }));
  await upsertKeywords(rows);

  // 오늘 동기화 대상에서 빠진(캠페인/광고그룹 일시중지 등) 키워드는 "활성"으로 남아있지
  // 않도록 REMOVED로 표시한다 — KPI/대시보드가 status='ELIGIBLE'만 활성으로 집계하므로
  // 이 정리를 안 하면 더 이상 운영되지 않는 키워드가 계속 카운트된다.
  // 어제 raw 파일이 아니라 "현재 DB에서 ELIGIBLE인 것" 기준으로 비교한다 — 같은 날 여러 번
  // 실행하거나 어제 파일이 없어도(최초 실행 등) 정확히 동작하게 하기 위함.
  const dbEligibleIds = await fetchEligibleKeywordIds();
  const staleIds = dbEligibleIds.filter((id) => !currentIds.has(id));
  if (staleIds.length > 0) {
    await markKeywordsRemoved(staleIds);
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncKeywords()
    .then((r) =>
      console.log(
        `[naver-keyword-sync] ${r.date}: ${r.synced.length}개 동기화, 신규 ${r.newKeywords.length}개, 제거 ${r.removedKeywords.length}개`
      )
    )
    .catch((e) => {
      console.error(`[naver-keyword-sync] 실패: ${e.message}`);
      process.exit(1);
    });
}
