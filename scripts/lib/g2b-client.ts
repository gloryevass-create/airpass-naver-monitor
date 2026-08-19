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

// 사전규격정보서비스(공식, HrcspSsstndrdInfoService) — 입찰공고보다 앞선 단계에서
// 발주기관이 규격을 미리 공개하는 단계를 조회한다. 같은 나라장터 도메인(조달청)이라
// G2B_SERVICE_KEY를 그대로 재사용한다(실측 확인, 2026-08-19 — 별도 활용신청 없이 바로
// 동작함). 엔드포인트/파라미터 네이밍이 입찰공고 API와 대칭이다
// (getBidPblancListInfo{Type}PPSSrch ↔ getPublicPrcureThngInfo{Type}PPSSrch).
const PRESPEC_BASE_URL = "https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService";

const PRESPEC_OPERATION: Record<BusinessType, string> = {
  cnstwk: "getPublicPrcureThngInfoCnstwkPPSSrch",
  servc: "getPublicPrcureThngInfoServcPPSSrch",
  thng: "getPublicPrcureThngInfoThngPPSSrch",
};

export type PreSpecItem = {
  bfSpecRgstNo: string; // 사전규격등록번호(자연키)
  prdctClsfcNoNm: string; // 사업명
  refNo?: string;
  orderInsttNm?: string; // 발주기관
  rlDminsttNm?: string; // 수요기관
  asignBdgtAmt?: string; // 배정예산금액
  rcptDt?: string; // 등록일시
  opninRgstClseDt?: string; // 의견등록마감일시
  ofclNm?: string; // 담당자명
  ofclTelNo?: string; // 담당자 전화번호
  specDocFileUrl1?: string;
  specDocFileUrl2?: string;
  specDocFileUrl3?: string;
  specDocFileUrl4?: string;
  specDocFileUrl5?: string;
  bidNtceNoList?: string; // 이후 실제 입찰공고로 전환된 경우 그 공고번호(콤마 구분)
};

type PreSpecSuccessResponse = {
  response: { header: { resultCode: string; resultMsg: string }; body: { items: PreSpecItem[]; totalCount: number } };
};

/** 조달청 나라장터 사전규격 검색(업무구분별). inqryBgnDt~inqryEndDt 범위는 입찰공고
 * API와 동일하게 최대 1개월로 가정한다(같은 계열 API, 문서화되지 않아 보수적으로 맞춤).
 * prdctClsfcNoNm으로 사업명 부분일치 검색이 된다. */
export async function searchPreSpecs(
  businessType: BusinessType,
  keyword: string,
  sinceYmd: string,
  untilYmd: string,
  numOfRows = 50
): Promise<PreSpecItem[]> {
  const operation = PRESPEC_OPERATION[businessType];
  const qs = [
    `serviceKey=${env.g2bServiceKey}`,
    `pageNo=1`,
    `numOfRows=${numOfRows}`,
    `inqryDiv=1`,
    `inqryBgnDt=${sinceYmd}0000`,
    `inqryEndDt=${untilYmd}2359`,
    `prdctClsfcNoNm=${encodeURIComponent(keyword)}`,
    `type=json`,
  ].join("&");
  const url = `${PRESPEC_BASE_URL}/${operation}?${qs}`;

  return withRetry(async () => {
    const res = await fetch(url);
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`사전규격 API 응답 파싱 실패(${businessType}/${keyword}): ${text.slice(0, 300)}`);
    }

    const success = json as Partial<PreSpecSuccessResponse>;
    if (success.response?.header?.resultCode === "00") {
      return success.response.body?.items ?? [];
    }
    if (success.response?.header) {
      throw new Error(
        `사전규격 API 오류(${businessType}/${keyword}, ${success.response.header.resultCode}): ${success.response.header.resultMsg}`
      );
    }
    throw new Error(`사전규격 API 게이트웨이 오류(${businessType}/${keyword}): ${text.slice(0, 300)}`);
  });
}
