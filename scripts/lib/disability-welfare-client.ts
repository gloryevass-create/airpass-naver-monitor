import { env } from "./env";
import { withRetry } from "./retry";

// 전국장애인편의시설표준데이터(공식, getDisConvFaclList) — 원본은 전국 18만 건
// (편의시설이 설치된 건물 전체, 다세대주택·상가 등 포함)이라 매일 전체 재수집이
// 비현실적이고 "장애인이 이용하는 시설"과 성격도 다르다. 그래서 시설명에 "장애인"이
// 포함된 결과만 API에 검색 조건으로 넘겨 받아온 뒤(faclNm 파라미터, 약 330건),
// 그중 이름에 "복지관"이 포함된 것만 다시 걸러 장애인복지관류 공공시설로 범위를
// 좁힌다(사용자 확인, 2026-08-18). XML만 지원한다(JSON 파라미터가 무시됨 — 실측 확인).
const BASE_URL = "https://apis.data.go.kr/B554287/DisabledPersonConvenientFacility/getDisConvFaclList";
const SEARCH_KEYWORD = "장애인";
const NAME_FILTER = "복지관";
const PAGE_SIZE = 100;

export type DisabilityWelfareCenter = {
  facilityName: string;
  facilityType: string | null;
  provinceName: string | null;
  roadAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  operatingStatus: string | null;
  establishmentDate: string | null;
  welfareFacilityId: string | null;
};

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() || null : null;
}

function num(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** YYYYMMDD -> YYYY-MM-DD. */
function ymd(v: string | null): string | null {
  if (!v || !/^\d{8}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/** 도로명주소 첫 토큰을 시도명으로 쓴다(이 API는 시도/시군구를 별도 필드로 안 준다). */
function extractProvince(roadAddress: string | null): string | null {
  if (!roadAddress) return null;
  return roadAddress.trim().split(/\s+/)[0] || null;
}

function parseServList(xml: string): DisabilityWelfareCenter[] {
  const blocks = [...xml.matchAll(/<servList>([\s\S]*?)<\/servList>/g)].map((m) => m[1]);
  return blocks.map((b) => {
    const roadAddress = tag(b, "lcMnad");
    return {
      facilityName: tag(b, "faclNm") ?? "",
      facilityType: tag(b, "faclTyCd"),
      provinceName: extractProvince(roadAddress),
      roadAddress,
      latitude: num(tag(b, "faclLat")),
      longitude: num(tag(b, "faclLng")),
      operatingStatus: tag(b, "salStaNm"),
      establishmentDate: ymd(tag(b, "estbDate")),
      welfareFacilityId: tag(b, "wfcltId"),
    };
  });
}

async function fetchPage(pageNo: number): Promise<{ items: DisabilityWelfareCenter[]; totalCount: number }> {
  return withRetry(async () => {
    const url =
      `${BASE_URL}?serviceKey=${env.disabilityWelfareServiceKey}` +
      `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&faclNm=${encodeURIComponent(SEARCH_KEYWORD)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`장애인편의시설 API 실패 (${res.status}): ${text}`);
    }
    const xml = await res.text();
    const resultCode = tag(xml, "resultCode");
    if (resultCode !== "0") {
      throw new Error(`장애인편의시설 API 오류: ${tag(xml, "resultMessage")}`);
    }
    const totalCount = Number(tag(xml, "totalCount") ?? "0");
    return { items: parseServList(xml), totalCount };
  });
}

/** "장애인"이 시설명에 포함된 전체(약 330건)를 페이지네이션으로 받아온 뒤,
 * 이름에 "복지관"이 포함된 것만(약 109건) 최종 결과로 남긴다. */
export async function fetchAllDisabilityWelfareCenters(): Promise<DisabilityWelfareCenter[]> {
  const first = await fetchPage(1);
  const items = [...first.items];

  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  for (let pageNo = 2; pageNo <= pages; pageNo++) {
    const res = await fetchPage(pageNo);
    items.push(...res.items);
  }

  return items.filter((c) => c.facilityName.includes(NAME_FILTER));
}
