import { getSupabaseClient } from "./supabase-client";

export type MonitorTrack = "news" | "budget";

/** 뉴스·예산 모니터링 검색 키워드를 Supabase에서 읽는다 — 예전엔 config/{news,budget}_keywords.yaml
 * 정적 파일이었는데, 팀원이 대시보드(/dashboard/news, /dashboard/budget)에서 직접 추가·삭제할 수
 * 있도록 옮겼다(0010_add_monitor_keywords.sql). 코드 배포 없이 다음 날 수집부터 바로 반영된다. */
export async function fetchMonitorKeywords(track: MonitorTrack): Promise<string[]> {
  const { data, error } = await getSupabaseClient()
    .from("monitor_keywords")
    .select("keyword")
    .eq("track", track)
    .order("keyword", { ascending: true });
  if (error) throw new Error(`monitor_keywords(${track}) 조회 실패: ${error.message}`);
  return (data ?? []).map((k) => k.keyword);
}
