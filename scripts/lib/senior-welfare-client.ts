import { env } from "./env";
import { withRetry } from "./retry";

// 전국마을회관및경로당표준데이터(공식, 행정안전부). 원본은 마을회관과 경로당이 결합된
// 시설(예: "마을회관및경로당")까지 섞여 있어, "시니어복지시설"이라는 목적에 맞게
// 시설유형이 순수 "경로당"인 항목만 요청 시점에 flctTyp 파라미터로 서버 필터링해서
// 받는다(사용자 확인, 2026-08-20). 전국 약 3.5만 개소 규모라 매일 페이지네이션으로
// 전체를 다시 받는다(numOfRows 최대 1000).
const BASE_URL = "https://api.data.go.kr/openapi/tn_pubr_public_vill_hall_sen_cent_api";
const FACILITY_TYPE_FILTER = "경로당";
const PAGE_SIZE = 1000;

type RawItem = {
  flctNm: string;
  flctTyp?: string;
  lctnRoadNmAddr?: string;
  lctnLotnoAddr?: string;
  lat?: string;
  lot?: string;
  busiCodNm?: string;
  telno?: string;
  mngInstNm?: string;
  crtrYmd?: string;
  insttNm?: string;
};

type ApiResponse = {
  header: { resultCode: string; resultMsg: string };
  body: {
    items: { item: RawItem[] } | RawItem[] | "";
    numOfRows: number;
    pageNo: number;
    totalCount: number;
  };
};

export type SeniorWelfareFacility = {
  facilityName: string;
  facilityType: string | null;
  provinceName: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  businessStatus: string | null;
  phoneNumber: string | null;
  managingOrgName: string | null;
  providingInstName: string | null;
  referenceDate: string | null;
};

function str(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 이미 YYYY-MM-DD 형식으로 오지만(실측 확인), 혹시 모를 YYYYMMDD 형식도 방어적으로 변환한다. */
function ymd(v: string | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  return null;
}

/** 도로명주소 첫 토큰을 시도명으로 쓴다(이 API는 시도/시군구를 별도 필드로 안 준다). */
function extractProvince(roadAddress: string | undefined): string | null {
  if (!roadAddress) return null;
  return roadAddress.trim().split(/\s+/)[0] || null;
}

function toFacility(item: RawItem): SeniorWelfareFacility {
  return {
    facilityName: item.flctNm,
    facilityType: str(item.flctTyp),
    provinceName: extractProvince(item.lctnRoadNmAddr),
    roadAddress: str(item.lctnRoadNmAddr),
    lotAddress: str(item.lctnLotnoAddr),
    latitude: num(item.lat),
    longitude: num(item.lot),
    businessStatus: str(item.busiCodNm),
    phoneNumber: str(item.telno),
    managingOrgName: str(item.mngInstNm),
    providingInstName: str(item.insttNm),
    referenceDate: ymd(item.crtrYmd),
  };
}

function itemsOf(body: ApiResponse["body"]): RawItem[] {
  if (body.items === "") return [];
  if (Array.isArray(body.items)) return body.items;
  return body.items.item;
}

async function fetchPage(pageNo: number): Promise<ApiResponse> {
  return withRetry(async () => {
    const url =
      `${BASE_URL}?serviceKey=${env.seniorWelfareServiceKey}` +
      `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json&flctTyp=${encodeURIComponent(FACILITY_TYPE_FILTER)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`경로당(시니어복지시설) API 실패 (${res.status}): ${text}`);
    }
    const data = (await res.json()) as ApiResponse;
    if (data.header.resultCode !== "00") {
      throw new Error(`경로당(시니어복지시설) API 오류: ${data.header.resultMsg}`);
    }
    return data;
  });
}

/** "경로당"으로 필터링된 전국 시설 전체(약 3.5만 개소)를 페이지네이션으로 받아온다. */
export async function fetchAllSeniorWelfareFacilities(): Promise<SeniorWelfareFacility[]> {
  const first = await fetchPage(1);
  const items = [...itemsOf(first.body)];

  const pages = Math.ceil(first.body.totalCount / PAGE_SIZE);
  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    const res = await fetchPage(pageNo);
    items.push(...itemsOf(res.body));
  }

  return items.map(toFacility);
}
