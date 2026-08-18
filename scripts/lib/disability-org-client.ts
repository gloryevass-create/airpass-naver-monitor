import { env } from "./env";
import { withRetry } from "./retry";

// 보건복지부 "전국장애인단체표준데이터"(공식) — data.go.kr 표준데이터 자동변환 API.
const BASE_URL = "https://api.data.go.kr/openapi/tn_pubr_public_disabled_orgs_api";
const PAGE_SIZE = 1000;

type RawItem = {
  grpNm: string;
  ctpvNm?: string;
  sggNm?: string;
  lctnRoadNmAddr?: string;
  lctnLotnoAddr?: string;
  fndnYmd?: string;
  mbrCnt?: number | string;
  telno?: string;
  rprsvNm?: string;
  dataCrtrYmd?: string;
  insttCode?: string;
  insttNm?: string;
};

type ApiResponse = {
  header: { resultCode: string; resultMsg: string };
  body: {
    totalCount: number;
    pageNo: number;
    numOfRows: number;
    items: { item: RawItem[] } | "";
  };
};

export type DisabilityOrganization = {
  groupName: string;
  provinceName: string | null;
  districtName: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  foundationDate: string | null;
  memberCount: number | null;
  phoneNumber: string | null;
  representativeName: string | null;
  referenceDate: string | null;
  providerOrgCode: string | null;
  providerOrgName: string | null;
};

function str(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function num(v: number | string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** API가 YYYY-MM-DD 형식으로 이미 준다(청소년수련시설의 YYYYMMDD와 다름) — 형식만 검증. */
function ymd(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function toOrganization(item: RawItem): DisabilityOrganization {
  return {
    groupName: item.grpNm,
    provinceName: str(item.ctpvNm),
    districtName: str(item.sggNm),
    roadAddress: str(item.lctnRoadNmAddr),
    lotAddress: str(item.lctnLotnoAddr),
    foundationDate: ymd(item.fndnYmd),
    memberCount: num(item.mbrCnt),
    phoneNumber: str(item.telno),
    representativeName: str(item.rprsvNm),
    referenceDate: ymd(item.dataCrtrYmd),
    providerOrgCode: str(item.insttCode),
    providerOrgName: str(item.insttNm),
  };
}

async function fetchPage(pageNo: number): Promise<ApiResponse> {
  return withRetry(async () => {
    const url =
      `${BASE_URL}?serviceKey=${env.disabilityOrgServiceKey}` +
      `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`장애인단체 API 실패 (${res.status}): ${text}`);
    }
    const data = (await res.json()) as ApiResponse;
    if (data.header.resultCode !== "00") {
      throw new Error(`장애인단체 API 오류: ${data.header.resultMsg}`);
    }
    return data;
  });
}

/** 전국장애인단체 전체(약 605개, numOfRows=1000이면 1페이지로 충분하지만 totalCount
 * 기준으로 안전하게 페이지네이션한다). */
export async function fetchAllDisabilityOrganizations(): Promise<DisabilityOrganization[]> {
  const first = await fetchPage(1);
  const total = first.body.totalCount;
  const items: RawItem[] = first.body.items === "" ? [] : first.body.items.item;

  const pages = Math.ceil(total / PAGE_SIZE);
  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    const res = await fetchPage(pageNo);
    if (res.body.items !== "") items.push(...res.body.items.item);
  }

  return items.map(toOrganization);
}
