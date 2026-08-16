import { fetchCampaigns, fetchAdgroups, fetchKeywords } from "../lib/naver-searchad-client";
import { upsertKeywords } from "../lib/supabase-sync";
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
    const adgroups = await fetchAdgroups(campaign.nccCampaignId);
    for (const adgroup of adgroups) {
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
