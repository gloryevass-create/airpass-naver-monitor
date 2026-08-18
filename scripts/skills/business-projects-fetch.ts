import { fetchBusinessProjects, type BusinessProjectRecord } from "../lib/notion-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type BusinessProjectsResult = {
  date: string;
  projects: BusinessProjectRecord[];
};

/** K1: 팀 노션(Airpass전략기획) "사업진행 현황" 데이터베이스 전체를 매번 다시 읽어와
 * upsert한다(판단 단계 없는 순수 수집). notion_page_id가 고유키. */
export async function fetchBusinessProjectsSkill(date: string = todayKst()): Promise<BusinessProjectsResult> {
  const projects = await fetchBusinessProjects();
  const result: BusinessProjectsResult = { date, projects };

  writeJson(rawPath(date, "business_projects.json"), result);
  writeJson(processedPath(date, "businessprojects_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBusinessProjectsSkill()
    .then((r) => console.log(`[business-projects-fetch] 사업진행 현황 ${r.projects.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[business-projects-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
