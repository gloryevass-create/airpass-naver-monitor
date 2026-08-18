import { fetchAllDisabilityOrganizations, type DisabilityOrganization } from "../lib/disability-org-client";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type DisabilityOrgResult = {
  date: string;
  organizations: DisabilityOrganization[];
};

/** G1: 전국장애인단체 현황(공공데이터포털, 보건복지부 공식 API) 전체를 매번 다시
 * 받아온다(판단 단계 없는 순수 수집, 참고용 데이터라 이력 누적 불필요). */
export async function fetchDisabilityOrganizations(
  date: string = todayKst()
): Promise<DisabilityOrgResult> {
  const organizations = await fetchAllDisabilityOrganizations();
  const result: DisabilityOrgResult = { date, organizations };

  writeJson(rawPath(date, "disability_organizations.json"), result);
  writeJson(processedPath(date, "disabilityorgs_{date}.json"), result);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchDisabilityOrganizations()
    .then((r) => console.log(`[disability-org-fetch] 장애인관련기관 ${r.organizations.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[disability-org-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
