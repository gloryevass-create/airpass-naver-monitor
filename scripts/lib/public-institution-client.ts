import { env } from "./env";
import { withRetry } from "./retry";

// 행정안전부_공공기관 웹,모바일웹 사이트 정보(공식, 2025.03.27 버전). odcloud.kr 표준 API
// 형식 — page/perPage 파라미터를 쓴다(pageNo/numOfRows가 아니다).
const BASE_URL = "https://api.odcloud.kr/api/15050540/v1/uddi:7ef4e778-78c3-4a6c-9faf-dd5c5d1f443e";
const PAGE_SIZE = 1000; // 전체 591개 기관이 1페이지에 다 들어온다(실측 확인, 2026-08-19).

type RawItem = {
  사이트명: string;
  기관유형?: string;
  기관분류?: string;
  상세기관분류?: string;
  "사이트 구분"?: string;
  주소?: string;
};

type ApiResponse = {
  data: RawItem[];
  page: number;
  perPage: number;
  totalCount: number;
  currentCount: number;
  matchCount: number;
};

export type PublicInstitution = {
  siteName: string;
  institutionType: string | null;
  institutionCategory: string | null;
  detailCategory: string | null;
  siteType: string | null;
  url: string | null;
};

function str(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function toInstitution(item: RawItem): PublicInstitution {
  return {
    siteName: item.사이트명,
    institutionType: str(item.기관유형),
    institutionCategory: str(item.기관분류),
    detailCategory: str(item.상세기관분류),
    siteType: str(item["사이트 구분"]),
    url: str(item.주소),
  };
}

async function fetchPage(page: number): Promise<ApiResponse> {
  return withRetry(async () => {
    const url = `${BASE_URL}?page=${page}&perPage=${PAGE_SIZE}&serviceKey=${env.publicInstitutionServiceKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`공공기관정보 API 실패 (${res.status}): ${text}`);
    }
    return (await res.json()) as ApiResponse;
  });
}

/** 전국 공공기관 웹사이트 전체(약 591개, 1페이지로 충분하지만 totalCount 기준으로
 * 안전하게 페이지네이션한다). */
export async function fetchAllPublicInstitutions(): Promise<PublicInstitution[]> {
  const first = await fetchPage(1);
  const items = [...first.data];

  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    const res = await fetchPage(page);
    items.push(...res.data);
  }

  return items.map(toInstitution);
}
