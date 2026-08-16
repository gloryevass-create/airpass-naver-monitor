import { chromium } from "playwright";
import { writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { isAllowedByRobots, politeDelay } from "../lib/scrape-utils";
import { withRetry } from "../lib/retry";
import { loadCompetitors } from "../lib/config";
import { getOrComputeScrapeTargets, SCRAPE_TARGET_COUNT } from "../lib/keyword-scope";

const TOP_N = 10;

export type BlogSerpResult = {
  naver_keyword_id: string;
  keyword: string;
  topBlogIds: string[]; // 노출 순서대로, 상위 TOP_N
  skipped?: boolean;
  error?: string;
};

export type BlogPost = {
  competitor_name: string;
  blog_id: string;
  url: string;
  title: string | null;
  published_at: string | null; // YYYY-MM-DD
};

function extractBlogIdFromUrl(url: string): string | null {
  // blog.naver.com/<blogId>/<logNo> 형태
  const m = url.match(/blog\.naver\.com\/([^/?]+)/);
  return m ? m[1] : null;
}

/** B2: 키워드별 블로그 검색결과 상위 N개의 블로거 ID 수집(SOV 계산의 원천 데이터).
 * 네이버 공식 블로그 검색 오픈API가 있지만 그 결과 정렬은 실제 이용자가 보는
 * 검색결과 화면과 다를 수 있어(A3와 동일한 이유로) 이 프로젝트는 실제 검색결과
 * 페이지를 스크래핑한다 — 한계는 scripts/lib/scrape-utils.ts 상단 주석 참고.
 *
 * A3와 같은 이유로 계정 전체 키워드가 아니라 월간검색량 상위 SCRAPE_TARGET_COUNT
 * (기본 50)개만 대상으로 한다(사용자 확인 완료). blog-monitor가 ad-monitor 없이
 * 단독 실행되어도 getOrComputeScrapeTargets가 필요한 raw 데이터를 알아서 만든다. */
export async function fetchBlogSerp(date: string = todayKst()): Promise<BlogSerpResult[]> {
  const targets = await getOrComputeScrapeTargets(date);

  const searchUrl = "https://search.naver.com/search.naver";
  const allowed = await isAllowedByRobots(`${searchUrl}?where=blog`);
  if (!allowed) {
    console.warn("[naver-blog-fetch] robots.txt disallow — 블로그 SERP 수집 전체 스킵");
    const skipped = targets.map((k) => ({
      naver_keyword_id: k.naver_keyword_id,
      keyword: k.keyword,
      topBlogIds: [],
      skipped: true,
      error: "robots.txt disallow",
    }));
    writeJson(rawPath(date, "blog_serp_snapshot.json"), skipped);
    return skipped;
  }

  const browser = await chromium.launch({ headless: true });
  const results: BlogSerpResult[] = [];

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    });

    for (const kw of targets) {
      await politeDelay();
      try {
        const result = await withRetry(
          async () => {
            await page.goto(
              `${searchUrl}?where=blog&query=${encodeURIComponent(kw.keyword)}`,
              { waitUntil: "domcontentloaded", timeout: 15000 }
            );

            const links = await page
              .locator(".title_link, .api_txt_lines.total_tit")
              .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean));

            const blogIds = links
              .map(extractBlogIdFromUrl)
              .filter((id): id is string => Boolean(id))
              .slice(0, TOP_N);

            return {
              naver_keyword_id: kw.naver_keyword_id,
              keyword: kw.keyword,
              topBlogIds: blogIds,
            };
          },
          { attempts: 3, baseDelayMs: 2000 }
        );
        results.push(result);
      } catch (e) {
        results.push({
          naver_keyword_id: kw.naver_keyword_id,
          keyword: kw.keyword,
          topBlogIds: [],
          skipped: true,
          error: (e as Error).message,
        });
      }
    }
  } finally {
    await browser.close();
  }

  writeJson(rawPath(date, "blog_serp_snapshot.json"), results);
  return results;
}

/** B3: 경쟁사 블로그 게시물 목록·발행일. 네이버 블로그는 RSS 피드
 * (rss.blog.naver.com/<blogId>.xml)를 공식적으로 제공하므로 검색결과 스크래핑이
 * 아니라 이 피드를 우선 사용한다 — 더 안정적이고 예의 문제에서도 자유롭다. */
export async function fetchCompetitorBlogPosts(date: string = todayKst()): Promise<BlogPost[]> {
  const competitors = loadCompetitors();
  const posts: BlogPost[] = [];

  for (const competitor of competitors) {
    if (!competitor.blog_id) continue;
    await politeDelay();
    try {
      const res = await withRetry(async () => {
        const r = await fetch(`https://rss.blog.naver.com/${competitor.blog_id}.xml`);
        if (!r.ok) throw new Error(`RSS 요청 실패 (${r.status})`);
        return r.text();
      });

      const items = [...res.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      for (const [, itemXml] of items) {
        const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? null;
        const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
        const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim();
        const publishedAt = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null;

        if (!link) continue;
        posts.push({
          competitor_name: competitor.name,
          blog_id: competitor.blog_id,
          url: link,
          title,
          published_at: publishedAt,
        });
      }
    } catch (e) {
      console.warn(`[naver-blog-fetch] ${competitor.name} RSS 수집 실패, 스킵: ${(e as Error).message}`);
    }
  }

  writeJson(rawPath(date, "blog_posts.json"), posts);
  return posts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.all([fetchBlogSerp(), fetchCompetitorBlogPosts()])
    .then(([serp, posts]) =>
      console.log(
        `[naver-blog-fetch] 월간검색량 상위 ${SCRAPE_TARGET_COUNT}개 중 SERP ${serp.length}개 키워드, 게시물 ${posts.length}건 수집 완료`
      )
    )
    .catch((e) => {
      console.error(`[naver-blog-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
