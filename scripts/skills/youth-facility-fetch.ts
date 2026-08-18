import { fetchAllYouthFacilities, type YouthFacility } from "../lib/youth-facility-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type YouthFacilityResult = {
  date: string;
  facilities: YouthFacility[];
};

/** F1: 전국청소년수련시설 현황(공공데이터포털, 여성가족부/한국청소년활동진흥원 공식 API) 전체를
 * 매번 다시 받아온다(판단 단계 없는 순수 수집, 참고용 데이터라 이력 누적 불필요). */
export async function fetchYouthFacilities(date: string = todayKst()): Promise<YouthFacilityResult> {
  const facilities = await fetchAllYouthFacilities();
  const result: YouthFacilityResult = { date, facilities };

  writeJson(rawPath(date, "youth_facilities.json"), result);
  writeJson(processedPath(date, "youthfacilities_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchYouthFacilities()
    .then((r) => console.log(`[youth-facility-fetch] 청소년관련기관 ${r.facilities.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[youth-facility-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
