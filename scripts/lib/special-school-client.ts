import { env } from "./env";
import { withRetry } from "./retry";

// 교육부 국립특수교육원_특수학교현황(공식, 2025.04.01 버전). odcloud.kr 표준 API 형식 —
// page/perPage 파라미터를 쓴다(pageNo/numOfRows가 아니다).
const BASE_URL = "https://api.odcloud.kr/api/15052682/v1/uddi:80cefa55-5b53-4bdb-9ef3-998945a82761";
const PAGE_SIZE = 250; // 전체 196개교가 1페이지에 다 들어온다(실측 확인, 2026-08-18).

type RawItem = {
  기관명: string;
  시도?: string;
  설립별?: string;
  장애영역?: string;
  교장명?: string;
  인가년월일?: string;
  개교년월일?: string;
  교장실?: string;
  행정실?: string;
  교무실?: string;
  팩스?: string;
  우편번호?: number | string;
  주소?: string;
  누리집?: string;
  기준일자?: string;
};

type ApiResponse = {
  data: RawItem[];
  page: number;
  perPage: number;
  totalCount: number;
  currentCount: number;
  matchCount: number;
};

export type SpecialSchool = {
  schoolName: string;
  provinceName: string | null;
  foundationType: string | null;
  disabilityDomain: string | null;
  principalName: string | null;
  approvalDate: string | null;
  openingDate: string | null;
  principalOfficePhone: string | null;
  adminOfficePhone: string | null;
  teacherOfficePhone: string | null;
  faxNumber: string | null;
  zipCode: string | null;
  address: string | null;
  homepageUrl: string | null;
  referenceDate: string | null;
};

function str(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** 이미 YYYY-MM-DD 형식으로 온다 — 형식만 검증. */
function ymd(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

function toSchool(item: RawItem): SpecialSchool {
  return {
    schoolName: item.기관명,
    provinceName: str(item.시도),
    foundationType: str(item.설립별),
    disabilityDomain: str(item.장애영역),
    principalName: str(item.교장명),
    approvalDate: ymd(item.인가년월일),
    openingDate: ymd(item.개교년월일),
    principalOfficePhone: str(item.교장실),
    adminOfficePhone: str(item.행정실),
    teacherOfficePhone: str(item.교무실),
    faxNumber: str(item.팩스),
    zipCode: item.우편번호 != null ? String(item.우편번호) : null,
    address: str(item.주소),
    homepageUrl: str(item.누리집),
    referenceDate: ymd(item.기준일자),
  };
}

async function fetchPage(page: number): Promise<ApiResponse> {
  return withRetry(async () => {
    const url = `${BASE_URL}?page=${page}&perPage=${PAGE_SIZE}&serviceKey=${env.specialSchoolServiceKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`특수학교현황 API 실패 (${res.status}): ${text}`);
    }
    return (await res.json()) as ApiResponse;
  });
}

/** 전국 특수학교 전체(약 196개교, 1페이지로 충분하지만 totalCount 기준으로 안전하게
 * 페이지네이션한다). */
export async function fetchAllSpecialSchools(): Promise<SpecialSchool[]> {
  const first = await fetchPage(1);
  const items = [...first.data];

  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  for (let page = 2; page <= pages; page++) {
    const res = await fetchPage(page);
    items.push(...res.data);
  }

  return items.map(toSchool);
}
