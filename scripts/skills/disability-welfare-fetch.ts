import {
  fetchAllDisabilityWelfareCenters,
  type DisabilityWelfareCenter,
} from "../lib/disability-welfare-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type DisabilityWelfareResult = {
  date: string;
  centers: DisabilityWelfareCenter[];
};

/** I1: 장애인복지관류 공공시설 현황(공공데이터포털, 전국장애인편의시설표준데이터 중
 * 시설명 "장애인"+"복지관" 포함분만 — scripts/lib/disability-welfare-client.ts 참고)을
 * 매번 다시 받아온다(판단 단계 없는 순수 수집, 참고용 데이터라 이력 누적 불필요). */
export async function fetchDisabilityWelfareCenters(
  date: string = todayKst()
): Promise<DisabilityWelfareResult> {
  const centers = await fetchAllDisabilityWelfareCenters();
  const result: DisabilityWelfareResult = { date, centers };

  writeJson(rawPath(date, "disability_welfare_centers.json"), result);
  writeJson(processedPath(date, "disabilitywelfare_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchDisabilityWelfareCenters()
    .then((r) => console.log(`[disability-welfare-fetch] 장애인복지관류 시설 ${r.centers.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[disability-welfare-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
