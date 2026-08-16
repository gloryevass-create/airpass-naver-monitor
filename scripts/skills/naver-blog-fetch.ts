import { writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { loadCompetitors } from "../lib/config";
import { searchBlog, type BlogSearchItem } from "../lib/naver-openapi-client";
import { withRetry } from "../lib/retry";
import { getOrComputeScrapeTargets, SCRAPE_TARGET_COUNT } from "../lib/keyword-scope";

const TOP_N = 10;
const RSS_REQUEST_DELAY_MS = 1500;

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
  // blog.naver.com/<blogId>/<logNo> 또는 PostView.naver?blogId=... 형태 모두 대응
  const pathMatch = url.match(/blog\.naver\.com\/([^/?]+)/);
  if (pathMatch) return pathMatch[1];
  const queryMatch = url.match(/[?&]blogId=([^&]+)/);
  return queryMatch ? decodeURIComponent(queryMatch[1]) : null;
}

function toIsoDate(postdate: string): string | null {
  // postdate: YYYYMMDD
  if (!/^\d{8}$/.test(postdate)) return null;
  return `${postdate.slice(0, 4)}-${postdate.slice(4, 6)}-${postdate.slice(6, 8)}`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** RSS 필드는 <![CDATA[...]]>로 감싸져 오는 경우가 많다 — 벗기지 않으면 URL 검증 등이 깨진다. */
function stripCdata(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const cdataMatch = trimmed.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return (cdataMatch ? cdataMatch[1] : trimmed).trim();
}

/** B2: 키워드별 블로그 검색결과 상위 N개(SOV용) — 네이버 공식 블로그 검색 오픈API.
 * 검색에 걸린 경쟁사 게시물은 postsByUrl에도 함께 반영된다(부가적인 커버리지). */
async function fetchBlogSerp(
  targets: Awaited<ReturnType<typeof getOrComputeScrapeTargets>>,
  blogIdToName: Map<string, string>,
  postsByUrl: Map<string, BlogPost>
): Promise<BlogSerpResult[]> {
  const serp: BlogSerpResult[] = [];

  for (const kw of targets) {
    try {
      const items: BlogSearchItem[] = await searchBlog(kw.keyword, TOP_N);
      const blogIds = items
        .map((item) => extractBlogIdFromUrl(item.bloggerlink || item.link))
        .filter((id): id is string => Boolean(id));

      serp.push({ naver_keyword_id: kw.naver_keyword_id, keyword: kw.keyword, topBlogIds: blogIds });

      for (let i = 0; i < items.length; i++) {
        const blogId = blogIds[i];
        const competitorName = blogId ? blogIdToName.get(blogId) : undefined;
        if (!competitorName) continue;

        const item = items[i];
        if (!postsByUrl.has(item.link)) {
          postsByUrl.set(item.link, {
            competitor_name: competitorName,
            blog_id: blogId!,
            url: item.link,
            title: item.title.replace(/<\/?b>/g, ""),
            published_at: toIsoDate(item.postdate),
          });
        }
      }
    } catch (e) {
      serp.push({
        naver_keyword_id: kw.naver_keyword_id,
        keyword: kw.keyword,
        topBlogIds: [],
        skipped: true,
        error: (e as Error).message,
      });
    }
  }

  return serp;
}

/**
 * B3: 경쟁사 블로그 전체 포스팅 이력 — RSS 피드(`rss.blog.naver.com/<blog_id>.xml`).
 *
 * ⚠️ rss.blog.naver.com/robots.txt는 모든 User-agent에 대해 `Disallow: /`로 되어 있어
 * 엄밀히는 이 요청이 금지된 경로다. 그럼에도 이 피드를 다시 쓰기로 한 이유(사용자 확인
 * 완료, 2026-08-17):
 *   - 이 RSS 링크는 네이버가 각 블로그 페이지 자체(`<link rel="alternate" ...>`)에
 *     "구독용 주소"로 직접 게재해두는 공식 배포 채널이다 — 검색결과를 흉내 내는 스크래핑과는
 *     성격이 다르다.
 *   - B2(블로그 검색 API)만으로는 "우리가 모니터링하는 키워드로 검색했을 때 우연히 걸린
 *     게시물"만 보여서, 경쟁사의 실제 포스팅 주기(최근 게시일·평균 발행 간격·최근 30일
 *     게시물 수)를 정확히 계산할 수 없었다.
 *   - 그럼에도 이건 robots.txt를 어기는 것이므로, 요청 간 지연을 두고(정중한 접근),
 *     경쟁사 5~10곳 정도의 적은 트래픽만 발생시키며, 실패 시 해당 경쟁사만 건너뛴다.
 *     운영 중 네이버로부터 접근 제한/차단 요청을 받으면 즉시 이 방식을 중단해야 한다.
 */
async function fetchCompetitorBlogPostsViaRss(
  blogIdToName: Map<string, string>,
  postsByUrl: Map<string, BlogPost>
) {
  for (const [blogId, competitorName] of blogIdToName) {
    await sleep(RSS_REQUEST_DELAY_MS);
    try {
      const xml = await withRetry(async () => {
        const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          },
        });
        if (!res.ok) throw new Error(`RSS 요청 실패 (${res.status})`);
        return res.text();
      });

      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      for (const [, itemXml] of items) {
        const title = stripCdata(itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
        const link = stripCdata(itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]) ?? "";
        const pubDate = stripCdata(itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]);
        const publishedAt = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : null;
        if (!link) continue;

        // RSS가 더 완전한 소스이므로 API에서 이미 채워진 항목이 있어도 덮어써서 정확도를 높인다.
        postsByUrl.set(link, {
          competitor_name: competitorName,
          blog_id: blogId,
          url: link,
          title,
          published_at: publishedAt,
        });
      }
    } catch (e) {
      console.warn(`[naver-blog-fetch] ${competitorName} RSS 수집 실패, 스킵: ${(e as Error).message}`);
    }
  }
}

/**
 * B2+B3: 키워드별 블로그 검색결과(SOV용)와 경쟁사 전체 포스팅 이력(포스팅 주기용)을 함께
 * 수집한다. B2는 공식 오픈API, B3는 각 블로그가 스스로 게재한 RSS 피드를 쓴다(위 주석 참고).
 */
export async function fetchBlogData(
  date: string = todayKst()
): Promise<{ serp: BlogSerpResult[]; posts: BlogPost[] }> {
  const targets = await getOrComputeScrapeTargets(date);
  const competitors = loadCompetitors();
  const blogIdToName = new Map(
    competitors.filter((c) => c.blog_id).map((c) => [c.blog_id as string, c.name])
  );

  const postsByUrl = new Map<string, BlogPost>();
  const serp = await fetchBlogSerp(targets, blogIdToName, postsByUrl);
  await fetchCompetitorBlogPostsViaRss(blogIdToName, postsByUrl);

  const posts = [...postsByUrl.values()];
  writeJson(rawPath(date, "blog_serp_snapshot.json"), serp);
  writeJson(rawPath(date, "blog_posts.json"), posts);
  return { serp, posts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBlogData()
    .then(({ serp, posts }) =>
      console.log(
        `[naver-blog-fetch] 월간검색량 상위 ${SCRAPE_TARGET_COUNT}개 중 SERP ${serp.length}개 키워드, 경쟁사 게시물 ${posts.length}건 수집 완료`
      )
    )
    .catch((e) => {
      console.error(`[naver-blog-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
