import { fetchAllSeniorWelfareFacilities, type SeniorWelfareFacility } from "../lib/senior-welfare-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type SeniorWelfareResult = {
  date: string;
  facilities: SeniorWelfareFacility[];
};

/** M1: 전국 경로당(시니어복지시설) 현황(공공데이터포털, 전국마을회관및경로당표준데이터
 * 중 시설유형 "경로당"만)을 매번 다시 받아온다(판단 단계 없는 순수 수집, 참고용
 * 데이터라 이력 누적 불필요). */
export async function fetchSeniorWelfareFacilities(date: string = todayKst()): Promise<SeniorWelfareResult> {
  const facilities = await fetchAllSeniorWelfareFacilities();
  const result: SeniorWelfareResult = { date, facilities };

  writeJson(rawPath(date, "senior_welfare_facilities.json"), result);
  writeJson(processedPath(date, "seniorwelfare_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchSeniorWelfareFacilities()
    .then((r) => console.log(`[senior-welfare-fetch] 시니어복지시설(경로당) ${r.facilities.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[senior-welfare-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
