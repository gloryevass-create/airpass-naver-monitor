import {
  fetchAllDisabilitySportsFacilities,
  type DisabilitySportsFacility,
} from "../lib/disability-sports-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type DisabilitySportsResult = {
  date: string;
  facilities: DisabilitySportsFacility[];
};

/** H1: 전국 장애인전용체육시설 현황(공공데이터포털, 대한장애인체육회 공식 API) 전체를
 * 매번 다시 받아온다(판단 단계 없는 순수 수집, 참고용 데이터라 이력 누적 불필요). */
export async function fetchDisabilitySportsFacilities(
  date: string = todayKst()
): Promise<DisabilitySportsResult> {
  const facilities = await fetchAllDisabilitySportsFacilities();
  const result: DisabilitySportsResult = { date, facilities };

  writeJson(rawPath(date, "disability_sports_facilities.json"), result);
  writeJson(processedPath(date, "disabilitysports_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchDisabilitySportsFacilities()
    .then((r) => console.log(`[disability-sports-fetch] 장애인체육시설 ${r.facilities.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[disability-sports-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
