import { writeJson, rawPath } from "../lib/files";
import { todayKst } from "../lib/dates";
import { loadCompetitors } from "../lib/config";
import { searchBlog, type BlogSearchItem } from "../lib/naver-openapi-client";
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
 * B2+B3: 키워드별 블로그 검색결과 상위 N개(SOV용)와, 그중 등록된 경쟁사 블로그에
 * 해당하는 게시물의 발행일(포스팅 주기용)을 네이버 공식 블로그 검색 오픈API로
 * 한 번에 수집한다.
 *
 * search.naver.com 스크래핑은 robots.txt가 전면 금지해 포기했다(사용자 확인
 * 완료, CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절 참고). 대신 공식 오픈API를 쓰되,
 * 이 API는 "이 블로거의 전체 글 목록"을 조회하는 기능이 없어 B3(포스팅 주기)의
 * 범위가 "우리가 모니터링하는 키워드와 관련된 게시물"로 좁혀진다 — 경쟁사 전체
 * 블로그 활동이 아니라 우리 키워드 주변의 활동량이라는 뜻이다(사용자 확인 완료).
 */
export async function fetchBlogData(
  date: string = todayKst()
): Promise<{ serp: BlogSerpResult[]; posts: BlogPost[] }> {
  const targets = await getOrComputeScrapeTargets(date);
  const competitors = loadCompetitors();
  const blogIdToName = new Map(
    competitors.filter((c) => c.blog_id).map((c) => [c.blog_id as string, c.name])
  );

  const serp: BlogSerpResult[] = [];
  const postsByUrl = new Map<string, BlogPost>();

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
        if (!competitorName) continue; // 등록된 경쟁사가 아니면 게시물 목록에 넣지 않음

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
