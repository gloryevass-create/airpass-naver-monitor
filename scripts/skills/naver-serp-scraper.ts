import { chromium } from "playwright";
import { readJson, writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { isAllowedByRobots, politeDelay } from "../lib/scrape-utils";
import { withRetry } from "../lib/retry";
import { env } from "../lib/env";
import type { SyncResult } from "./naver-keyword-sync";

export type SerpResult = {
  naver_keyword_id: string;
  keyword: string;
  powerlinkDomains: string[]; // 노출 순서대로
  ourRank: number | null; // 1-based, 없으면 null
  skipped?: boolean;
  error?: string;
};

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** A3: 검색결과 페이지 파워링크(광고) 노출 순서·광고주 도메인 수집.
 * 공식 API가 없는 영역이므로 Playwright로 렌더링 후 파싱한다 — 실패 시 스킵하고
 * 다음 키워드로 진행(선택적 단계 실패 처리 스펙). robots.txt와 요청 간격을 지킨다.
 *
 * ⚠️ 네이버 검색결과 마크업은 예고 없이 바뀔 수 있다. 아래 셀렉터가 깨지면
 * 이 함수는 빈 결과를 반환하고 에러를 기록할 뿐 파이프라인 전체를 중단하지
 * 않는다 — 셀렉터를 실제 페이지에 맞춰 주기적으로 점검해야 한다.
 */
export async function scrapeSerp(date: string = todayKst()): Promise<SerpResult[]> {
  const synced = readJson<SyncResult>(rawPath(date, "keywords_synced.json"));
  if (!synced) {
    throw new Error(
      `${rawPath(date, "keywords_synced.json")} 없음 — naver-keyword-sync를 먼저 실행하세요.`
    );
  }

  const searchUrl = "https://search.naver.com/search.naver";
  const allowed = await isAllowedByRobots(searchUrl);
  if (!allowed) {
    console.warn("[naver-serp-scraper] robots.txt가 이 경로의 크롤링을 허용하지 않습니다 — 전체 스킵합니다.");
    const skipped = synced.synced.map((k) => ({
      naver_keyword_id: k.naver_keyword_id,
      keyword: k.keyword,
      powerlinkDomains: [],
      ourRank: null,
      skipped: true,
      error: "robots.txt disallow",
    }));
    writeJson(rawPath(date, "serp_snapshot.json"), skipped);
    return skipped;
  }

  const browser = await chromium.launch({ headless: true });
  const results: SerpResult[] = [];

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });

    for (const kw of synced.synced) {
      await politeDelay();
      try {
        const result = await withRetry(
          async () => {
            await page.goto(
              `${searchUrl}?query=${encodeURIComponent(kw.keyword)}`,
              { waitUntil: "domcontentloaded", timeout: 15000 }
            );

            // 파워링크 광고 영역의 링크 목록. 실제 마크업 확인 후 셀렉터 조정 필요.
            const links = await page
              .locator('a[data-cr-area="pwr*a" i], .power_link a.link_tit, .link_ad a')
              .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href));

            const domains = links
              .map(extractDomain)
              .filter((d): d is string => Boolean(d));

            const uniqueDomains = [...new Set(domains)];
            const ourRankIdx = uniqueDomains.findIndex((d) => d.includes(env.airpassDomain));

            return {
              naver_keyword_id: kw.naver_keyword_id,
              keyword: kw.keyword,
              powerlinkDomains: uniqueDomains,
              ourRank: ourRankIdx >= 0 ? ourRankIdx + 1 : null,
            };
          },
          { attempts: 3, baseDelayMs: 2000 }
        );
        results.push(result);
      } catch (e) {
        results.push({
          naver_keyword_id: kw.naver_keyword_id,
          keyword: kw.keyword,
          powerlinkDomains: [],
          ourRank: null,
          skipped: true,
          error: (e as Error).message,
        });
      }
    }
  } finally {
    await browser.close();
  }

  writeJson(rawPath(date, "serp_snapshot.json"), results);
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeSerp()
    .then((r) => {
      const failed = r.filter((x) => x.skipped).length;
      console.log(`[naver-serp-scraper] ${r.length}개 키워드 스캔, 실패/스킵 ${failed}개`);
    })
    .catch((e) => {
      console.error(`[naver-serp-scraper] 실패: ${e.message}`);
      process.exit(1);
    });
}
