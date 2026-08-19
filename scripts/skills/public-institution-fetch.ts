import { fetchAllPublicInstitutions, type PublicInstitution } from "../lib/public-institution-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type PublicInstitutionResult = {
  date: string;
  institutions: PublicInstitution[];
};

/** L1: 전국 공공기관 웹사이트 정보(공공데이터포털, 행정안전부_공공기관 웹,모바일웹
 * 사이트 정보)를 매번 다시 받아온다(판단 단계 없는 순수 수집, 참고용 데이터라 이력
 * 누적 불필요). */
export async function fetchPublicInstitutions(date: string = todayKst()): Promise<PublicInstitutionResult> {
  const institutions = await fetchAllPublicInstitutions();
  const result: PublicInstitutionResult = { date, institutions };

  writeJson(rawPath(date, "public_institutions.json"), result);
  writeJson(processedPath(date, "publicinstitutions_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchPublicInstitutions()
    .then((r) => console.log(`[public-institution-fetch] 공공기관 ${r.institutions.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[public-institution-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
