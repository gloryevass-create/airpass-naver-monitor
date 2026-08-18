import { env } from "./env";
import { withRetry } from "./retry";

// 여성가족부/한국청소년활동진흥원 "청소년수련시설정보서비스"(공식) — getTeenTrftListV2.
// 서비스키는 data.go.kr이 이미 URL-인코딩해서 발급하므로, 나라장터 API와 동일하게
// URLSearchParams로 재인코딩하지 않고 쿼리스트링에 그대로(raw) 스플라이스한다(재인코딩하면
// %2F 등이 이중 인코딩되어 인증 실패).
const BASE_URL = "https://apis.data.go.kr/1383000/gmis/teenTrftServiceV2/getTeenTrftListV2";
const PAGE_SIZE = 1000;

type RawItem = {
  fcltNm: string;
  rprsvNm?: string;
  operMbyCn?: string;
  operModeCn?: string;
  fndnSbjtCn?: string;
  fdngbdDtlCn?: string;
  instlTypeCn?: string;
  fcltTypeNm?: string;
  ctpvNm?: string;
  sggNm?: string;
  roadNmAddr?: string;
  lotnoAddr?: string;
  lat?: number | string;
  lot?: number | string;
  hmpgAddr?: string;
  rprsTelno?: string;
  fxno?: string;
  emlAddr?: string;
  operHrCn?: string;
  hldyCn?: string;
  pknFcltYn?: string;
  cpctCnt?: number | string;
  nstyCpctCnt?: number | string;
  stayCpctCnt?: number | string;
  cmpnCpctCnt?: number | string;
  frstRegYmd?: string;
  crtrYmd?: string;
  expsrYn?: string;
  rmrkCn?: string;
};

type ApiResponse = {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: {
      totalCount: number;
      pageNo: number;
      numOfRows: number;
      items: { item: RawItem[] } | "";
    };
  };
};

export type YouthFacility = {
  facilityName: string;
  representativeName: string | null;
  operatingBody: string | null;
  operationMode: string | null;
  foundationSubject: string | null;
  foundationOrgDetail: string | null;
  installationType: string | null;
  facilityType: string | null;
  provinceName: string | null;
  districtName: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  homepageUrl: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  operatingHours: string | null;
  holidayInfo: string | null;
  hasParking: boolean | null;
  capacityCount: number | null;
  overnightCapacityCount: number | null;
  stayCapacityCount: number | null;
  companionCapacityCount: number | null;
  firstRegisteredDate: string | null;
  referenceDate: string | null;
  isExposed: boolean | null;
  remarks: string | null;
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

function bool(v: string | undefined): boolean | null {
  if (v === "Y") return true;
  if (v === "N") return false;
  return null;
}

/** YYYYMMDD -> YYYY-MM-DD (Postgres date 컬럼용). 형식이 아니면 null. */
function ymd(v: string | undefined): string | null {
  if (!v || !/^\d{8}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

function toFacility(item: RawItem): YouthFacility {
  return {
    facilityName: item.fcltNm,
    representativeName: str(item.rprsvNm),
    operatingBody: str(item.operMbyCn),
    operationMode: str(item.operModeCn),
    foundationSubject: str(item.fndnSbjtCn),
    foundationOrgDetail: str(item.fdngbdDtlCn),
    installationType: str(item.instlTypeCn),
    facilityType: str(item.fcltTypeNm),
    provinceName: str(item.ctpvNm),
    districtName: str(item.sggNm),
    roadAddress: str(item.roadNmAddr),
    lotAddress: str(item.lotnoAddr),
    latitude: num(item.lat),
    longitude: num(item.lot),
    homepageUrl: str(item.hmpgAddr),
    phoneNumber: str(item.rprsTelno),
    faxNumber: str(item.fxno),
    email: str(item.emlAddr),
    operatingHours: str(item.operHrCn),
    holidayInfo: str(item.hldyCn),
    hasParking: bool(item.pknFcltYn),
    capacityCount: num(item.cpctCnt),
    overnightCapacityCount: num(item.nstyCpctCnt),
    stayCapacityCount: num(item.stayCpctCnt),
    companionCapacityCount: num(item.cmpnCpctCnt),
    firstRegisteredDate: ymd(item.frstRegYmd),
    referenceDate: ymd(item.crtrYmd),
    isExposed: bool(item.expsrYn),
    remarks: str(item.rmrkCn),
  };
}

async function fetchPage(pageNo: number): Promise<ApiResponse> {
  return withRetry(async () => {
    const url =
      `${BASE_URL}?serviceKey=${env.youthFacilityServiceKey}` +
      `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`청소년수련시설 API 실패 (${res.status}): ${text}`);
    }
    const data = (await res.json()) as ApiResponse;
    if (data.response.header.resultCode !== "0") {
      throw new Error(`청소년수련시설 API 오류: ${data.response.header.resultMsg}`);
    }
    return data;
  });
}

/** 전국청소년수련시설 전체(약 930개소, numOfRows=1000이면 1페이지로 충분하지만
 * totalCount 기준으로 안전하게 페이지네이션한다). */
export async function fetchAllYouthFacilities(): Promise<YouthFacility[]> {
  const first = await fetchPage(1);
  const total = first.response.body.totalCount;
  const items: RawItem[] = first.response.body.items === "" ? [] : first.response.body.items.item;

  const pages = Math.ceil(total / PAGE_SIZE);
  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    const res = await fetchPage(pageNo);
    if (res.response.body.items !== "") items.push(...res.response.body.items.item);
  }

  return items.map(toFacility);
}
