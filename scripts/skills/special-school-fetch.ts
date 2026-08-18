import { fetchAllSpecialSchools, type SpecialSchool } from "../lib/special-school-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type SpecialSchoolResult = {
  date: string;
  schools: SpecialSchool[];
};

/** J1: 전국 특수학교현황(공공데이터포털, 교육부 국립특수교육원_특수학교현황)을 매번
 * 다시 받아온다(판단 단계 없는 순수 수집, 참고용 데이터라 이력 누적 불필요). */
export async function fetchSpecialSchools(date: string = todayKst()): Promise<SpecialSchoolResult> {
  const schools = await fetchAllSpecialSchools();
  const result: SpecialSchoolResult = { date, schools };

  writeJson(rawPath(date, "special_schools.json"), result);
  writeJson(processedPath(date, "specialschools_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchSpecialSchools()
    .then((r) => console.log(`[special-school-fetch] 특수학교 ${r.schools.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[special-school-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
