import { getSupabaseClient } from "./supabase-client";

export type CompetitorRecord = {
  id: string;
  name: string;
  domain: string | null;
  blog_id: string | null;
  is_active: boolean;
};

/** 대시보드가 관리하는 경쟁사 블로그 전체(비활성 포함) — 이름→ID 매핑용. */
export async function fetchAllCompetitors(): Promise<CompetitorRecord[]> {
  const { data, error } = await getSupabaseClient().from("competitors").select("*");
  if (error) throw new Error(`competitors 조회 실패: ${error.message}`);
  return data ?? [];
}

/** 실제 오늘 수집 대상(대시보드에서 활성화된 경쟁사 블로그)만. */
export async function fetchActiveCompetitors(): Promise<CompetitorRecord[]> {
  const all = await fetchAllCompetitors();
  return all.filter((c) => c.is_active);
}

/** ad_spend_estimates/blog_posts 등 다른 테이블 upsert 시 쓰는 이름→ID 맵.
 * 비활성 경쟁사도 과거 데이터 참조를 위해 포함한다. */
export async function fetchCompetitorIdMap(): Promise<Map<string, string>> {
  const all = await fetchAllCompetitors();
  return new Map(all.map((c) => [c.name, c.id]));
}
