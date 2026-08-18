import { fetchTeamEvents, type TeamEventRecord } from "../lib/notion-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type NotionEventsResult = {
  date: string;
  events: TeamEventRecord[];
};

/** E1: 팀 노션(Airpass전략기획) "행사 및 스케쥴" 데이터베이스 전체를 매번 다시 읽어와
 * upsert한다(판단 단계 없는 순수 수집). notion_page_id가 고유키. */
export async function fetchNotionEvents(date: string = todayKst()): Promise<NotionEventsResult> {
  const events = await fetchTeamEvents();
  const result: NotionEventsResult = { date, events };

  writeJson(rawPath(date, "notion_events.json"), result);
  writeJson(processedPath(date, "events_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchNotionEvents()
    .then((r) => console.log(`[notion-events-fetch] 팀 일정 ${r.events.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[notion-events-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
