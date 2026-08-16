import { writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type SpendEstimate = {
  competitor_name: string;
  naver_keyword_id: string;
  estimated_monthly_spend: number;
  calc_basis: Record<string, unknown>;
};

/**
 * A4/A5: 경쟁사별 월 예상 광고비 산출 — 현재는 항상 빈 배열을 반환한다.
 *
 * 원래 계획: 파워링크 노출 도메인을 경쟁사로 매핑(A4)한 뒤 노출순위×CPC×가정
 * 클릭률×운영일수로 광고비를 추정(A5)할 예정이었다. 실 계정으로 검증한 결과
 * (사용자 확인 완료, CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절 참고):
 *   - 경쟁사가 어떤 도메인으로 파워링크에 노출되는지는 네이버가 제3자에게
 *     공개하는 공식 API가 없다.
 *   - search.naver.com robots.txt가 전체 크롤링을 금지해 스크래핑으로도 얻을 수 없다.
 * 즉 이 데이터를 합법적으로 자동 수집할 방법이 없어, 근거 없는 추정치를
 * 만들어내는 대신 빈 결과를 반환하고 리포트에 "경쟁사 광고비는 공식
 * API·합법적 수집 경로가 없어 자동 수집하지 못했다"고 명시한다(환각 차단 원칙).
 *
 * 나중에 데이터 소스가 생기면(예: 유료 서드파티 순위추적 서비스 연동) 여기에
 * 노출순위×CPC×가정 클릭률×운영일수 계산식과 calc_basis 기록 로직을 다시 채운다.
 */
export async function estimateAdSpend(date: string = todayKst()): Promise<SpendEstimate[]> {
  const estimates: SpendEstimate[] = [];
  writeJson(rawPath(date, "ad_spend_estimates.json"), estimates);
  return estimates;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  estimateAdSpend()
    .then((e) =>
      console.log(
        `[ad-spend-estimator] ${e.length}건 (경쟁사 광고비 자동 수집 불가 — 공식 API·합법적 수집 경로 없음)`
      )
    )
    .catch((err) => {
      console.error(`[ad-spend-estimator] 실패: ${err.message}`);
      process.exit(1);
    });
}
