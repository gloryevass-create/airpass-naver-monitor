import { searchNews } from "../lib/naver-openapi-client";
import { loadNewsKeywords } from "../lib/config";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type NewsResult = {
  keyword: string;
  title: string;
  link: string;
  description: string;
  published_at: string | null; // ISO
};

function stripHtml(s: string): string {
  return s
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

function toIso(pubDate: string): string | null {
  const d = new Date(pubDate);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** N1: 교육청 사업·정책 관련 뉴스 모니터링. config/news_keywords.yaml에 등록된 키워드로
 * 네이버 뉴스 검색(NAVER API HUB)을 돌려 정책 변화·법령 개정처럼 영업 전략에 직접 영향을
 * 줄 수 있는 뉴스를 모은다. 같은 기사가 여러 키워드에 걸리면 첫 번째 키워드로만 저장한다
 * (link 기준 중복 제거). */
export async function fetchNews(date: string = todayKst()): Promise<NewsResult[]> {
  const keywords = loadNewsKeywords();
  const results: NewsResult[] = [];
  const seenLinks = new Set<string>();

  for (const keyword of keywords) {
    const items = await searchNews(keyword);
    for (const item of items) {
      const link = item.originallink || item.link;
      if (!link || seenLinks.has(link)) continue;
      seenLinks.add(link);
      results.push({
        keyword,
        title: stripHtml(item.title),
        link,
        description: stripHtml(item.description),
        published_at: toIso(item.pubDate),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 300)); // 연속 호출 간격
  }

  writeJson(rawPath(date, "news.json"), results);
  // 뉴스는 avg_cpc 계산 같은 추가 판단 단계가 없는 순수 수집 데이터라, LLM 가공 없이
  // 원본 스냅샷을 그대로 검증·동기화 직전 형태(processed)로도 함께 저장한다.
  writeJson(processedPath(date, "news_{date}.json"), { date, articles: results });
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchNews()
    .then((r) => console.log(`[naver-news-fetch] ${r.length}건 수집 완료`))
    .catch((e) => {
      console.error(`[naver-news-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
