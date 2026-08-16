import { loadCompetitors, type CompetitorConfig } from "./config";
import { writeJson, rawPath } from "./files";

export type MappingResult = {
  domain: string;
  competitorName: string | null;
  confidence: "exact" | "ambiguous" | "unmatched";
};

/** A4: 도메인 → 경쟁사명 매핑. 1차는 config/competitors.yaml의 정확 일치로 처리하고,
 * 매칭되지 않는 도메인은 "ambiguous/unmatched"로 분류해 에스컬레이션 로그에 남긴다.
 * 이후 에이전트(Claude) 세션이 이 로그를 읽고 LLM 판단으로 보정하거나
 * (실패 처리 스펙에 따라) 사람에게 확인을 요청한다 — 이 함수 자체는 추측하지 않는다. */
export function mapDomainsToCompetitors(
  domains: string[],
  date: string
): MappingResult[] {
  const competitors = loadCompetitors();
  const byDomain = new Map<string, CompetitorConfig>();
  for (const c of competitors) {
    if (c.domain) byDomain.set(c.domain.replace(/^www\./, ""), c);
  }

  const results: MappingResult[] = domains.map((domain) => {
    const normalized = domain.replace(/^www\./, "");
    const exact = byDomain.get(normalized);
    if (exact) {
      return { domain, competitorName: exact.name, confidence: "exact" as const };
    }
    // 서브도메인/부분 포함 등 애매한 경우 — 정확 일치만 자동 확정, 나머지는 에스컬레이션.
    const partial = competitors.find(
      (c) => c.domain && (normalized.includes(c.domain) || c.domain.includes(normalized))
    );
    if (partial) {
      return { domain, competitorName: partial.name, confidence: "ambiguous" as const };
    }
    return { domain, competitorName: null, confidence: "unmatched" as const };
  });

  const needsEscalation = results.filter((r) => r.confidence !== "exact");
  if (needsEscalation.length > 0) {
    writeJson(rawPath(date, "domain_mapping_escalation.json"), needsEscalation);
    console.warn(
      `[domain-mapper] ${needsEscalation.length}개 도메인이 모호하거나 매칭되지 않았습니다 — data/raw/${date}/domain_mapping_escalation.json 확인 필요 (LLM 보정 또는 사람 확인 대상)`
    );
  }

  return results;
}
