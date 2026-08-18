import { env } from "./env";
import { withRetry } from "./retry";

// 대한장애인체육회_장애인전용체육시설(공식, 2022년 v2). odcloud.kr 표준 API 형식 —
// page/perPage 파라미터를 쓰고, 나라장터·청소년수련시설과 달리 pageNo/numOfRows가 아니다.
const BASE_URL =
  "https://api.odcloud.kr/api/15071029/v1/uddi:7c6a4eaa-179a-469e-bb19-cd39e221190c";
const PAGE_SIZE = 100;

type RawItem = {
  번호?: number;
  시_도?: string;
  시설명: string;
  소재지?: string;
  홈페이지?: string;
  "장애인스포츠강좌 바우처시설"?: string;
  반다비시설?: string | null;
  운영기관?: string;
  전화번호?: string;
};

type ApiResponse = {
  data: RawItem[];
  page: number;
  perPage: number;
  totalCount: number;
  currentCount: number;
  matchCount: number;
};

export type DisabilitySportsFacility = {
  facilityName: string;
  provinceName: string | null;
  districtName: string | null;
  operatingBody: string | null;
  phoneNumber: string | null;
  homepageUrl: string | null;
  hasVoucherProgram: boolean | null;
  hasBandabiFacility: boolean | null;
};

function str(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function yn(v: string | undefined | null): boolean | null {
  if (v === "Y") return true;
  if (v === "N") return false;
  return null;
}

function toFacility(item: RawItem): DisabilitySportsFacility {
  return {
    facilityName: item.시설명,
    provinceName: str(item.시_도),
    districtName: str(item.소재지),
    operatingBody: str(item.운영기관),
    phoneNumber: str(item.전화번호),
    homepageUrl: str(item.홈페이지),
    hasVoucherProgram: yn(item["장애인스포츠강좌 바우처시설"]),
    hasBandabiFacility: yn(item.반다비시설),
  };
}

async function fetchPage(page: number): Promise<ApiResponse> {
  return withRetry(async () => {
    const url = `${BASE_URL}?page=${page}&perPage=${PAGE_SIZE}&serviceKey=${env.disabilitySportsServiceKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`장애인체육시설 API 실패 (${res.status}): ${text}`);
    }
    return (await res.json()) as ApiResponse;
  });
}

/** 전국 장애인전용체육시설 전체(약 73개, 1페이지로 충분하지만 totalCount 기준으로
 * 안전하게 페이지네이션한다). */
export async function fetchAllDisabilitySportsFacilities(): Promise<DisabilitySportsFacility[]> {
  const first = await fetchPage(1);
  const items = [...first.data];

  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    const res = await fetchPage(page);
    items.push(...res.data);
  }

  return items.map(toFacility);
}
