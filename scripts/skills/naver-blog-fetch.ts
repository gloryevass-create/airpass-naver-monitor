import { writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { loadCompetitors } from "../lib/config";
import { searchBlog, type BlogSearchItem } from "../lib/naver-openapi-client";
import { getOrFetchRssPosts } from "../lib/blog-rss";
import { getOrComputeBlogContentKeywords, BLOG_KEYWORD_COUNT } from "../lib/blog-keyword-scope";

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

/**
 * B2: 키워드별 블로그 검색결과 상위 N개(SOV용) — 네이버 공식 블로그 검색 오픈API.
 *
 * 검색어는 광고 키워드 상위 50개가 아니라 `getOrComputeBlogContentKeywords`(실제 경쟁사
 * 게시물 제목과 겹치는 917개 등록 키워드 중 일부)를 쓴다 — 광고 키워드는 제품/카테고리
 * 검색어라 경쟁사 블로그 콘텐츠 주제와 거의 안 겹쳐서 SOV가 항상 0에 가깝게 나오는 문제가
 * 있었다(사용자 확인, 2026-08-17). 검색에 걸린 경쟁사 게시물은 postsByUrl에도 반영된다.
 */
async function fetchBlogSerp(
  targets: Awaited<ReturnType<typeof getOrComputeBlogContentKeywords>>,
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
 * B2+B3: 키워드별 블로그 검색결과(SOV용)와 경쟁사 전체 포스팅 이력(포스팅 주기용)을 함께
 * 수집한다. B2는 공식 오픈API, B3는 각 블로그가 스스로 게재한 RSS 피드를 쓴다
 * (`scripts/lib/blog-rss.ts` — 이 예외의 근거는 CLAUDE.md/SKILL.md 참고).
 */
export async function fetchBlogData(
  date: string = todayKst()
): Promise<{ serp: BlogSerpResult[]; posts: BlogPost[] }> {
  const competitors = loadCompetitors();
  const blogIdToName = new Map(
    competitors.filter((c) => c.blog_id).map((c) => [c.blog_id as string, c.name])
  );

  const postsByUrl = new Map<string, BlogPost>();

  // B3 먼저: RSS 결과가 블로그 SOV 전용 키워드 선정(getOrComputeBlogContentKeywords)의
  // 입력이기도 하다 — 캐시되어 있으면(blog-rss.ts) 재요청하지 않는다.
  const rssPosts = await getOrFetchRssPosts(date);
  for (const p of rssPosts) {
    postsByUrl.set(p.url, p);
  }

  const targets = await getOrComputeBlogContentKeywords(date);
  const serp = await fetchBlogSerp(targets, blogIdToName, postsByUrl);

  const posts = [...postsByUrl.values()];
  writeJson(rawPath(date, "blog_serp_snapshot.json"), serp);
  writeJson(rawPath(date, "blog_posts.json"), posts);
  return { serp, posts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchBlogData()
    .then(({ serp, posts }) =>
      console.log(
        `[naver-blog-fetch] 콘텐츠 매칭 키워드 최대 ${BLOG_KEYWORD_COUNT}개 중 SERP ${serp.length}개 키워드, 게시물 ${posts.length}건 수집 완료`
      )
    )
    .catch((e) => {
      console.error(`[naver-blog-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
