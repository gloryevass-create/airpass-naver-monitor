import { env } from "./env";
import { withRetry } from "./retry";

// 조달청 나라장터 입찰공고정보서비스(공식, data.go.kr) — 실측 확인(2026-08-17)한 정확한 경로.
// 여러 블로그·문서에 나온 "BidPublicInfoService04" 등은 실제로는 게이트웨이 오류
// (NO_OPENAPI_SERVICE_ERROR)를 냈다 — 진짜 필요한 건 "/ad/" 세그먼트였다.
const BASE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService";

export type BusinessType = "cnstwk" | "servc" | "thng";

const OPERATION: Record<BusinessType, string> = {
  cnstwk: "getBidPblancListInfoCnstwkPPSSrch", // 공사
  servc: "getBidPblancListInfoServcPPSSrch", // 용역
  thng: "getBidPblancListInfoThngPPSSrch", // 물품
};

export type BidItem = {
  bidNtceNo: string;
  bidNtceOrd: string;
  bidNtceNm: string; // 사업명/공고명
  ntceInsttNm?: string; // 발주기관
  dminsttNm?: string; // 수요기관
  bdgtAmt?: string; // 예산금액
  presmptPrce?: string; // 추정가격
  bidNtceDt?: string; // 공고일시
  opengDt?: string; // 개찰일시
  bidNtceDtlUrl?: string; // 상세 페이지 URL
};

type SuccessResponse = {
  response: { header: { resultCode: string; resultMsg: string }; body: { items: BidItem[]; totalCount: number } };
};

/** 조달청 나라장터 입찰공고 검색(업무구분별). inqryBgnDt~inqryEndDt 범위는 최대 1개월
 * (실측 확인, 2026-08-17 — 초과 시 resultCode "07" 입력범위값 초과 에러). bidNtceNm으로
 * 공고명 부분일치 검색이 된다. serviceKey는 data.go.kr이 이미 URL-인코딩해서 발급한
 * 값이므로 그대로 쿼리스트링에 붙인다(URLSearchParams로 다시 인코딩하면 이중 인코딩되어
 * 인증이 깨진다). */
export async function searchBids(
  businessType: BusinessType,
  keyword: string,
  sinceYmd: string,
  untilYmd: string,
  numOfRows = 50
): Promise<BidItem[]> {
  const operation = OPERATION[businessType];
  const qs = [
    `serviceKey=${env.g2bServiceKey}`,
    `pageNo=1`,
    `numOfRows=${numOfRows}`,
    `inqryDiv=1`,
    `inqryBgnDt=${sinceYmd}0000`,
    `inqryEndDt=${untilYmd}2359`,
    `bidNtceNm=${encodeURIComponent(keyword)}`,
    `type=json`,
  ].join("&");
  const url = `${BASE_URL}/${operation}?${qs}`;

  return withRetry(async () => {
    const res = await fetch(url);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`나라장터 API 응답 파싱 실패(${businessType}/${keyword}): ${text.slice(0, 300)}`);
    }

    const success = json as Partial<SuccessResponse>;
    if (success.response?.header?.resultCode === "00") {
      return success.response.body?.items ?? [];
    }
    if (success.response?.header) {
      throw new Error(
        `나라장터 API 오류(${businessType}/${keyword}, ${success.response.header.resultCode}): ${success.response.header.resultMsg}`
      );
    }
    throw new Error(`나라장터 API 게이트웨이 오류(${businessType}/${keyword}): ${text.slice(0, 300)}`);
  });
}
