import { readJson, writeJson, rawPath } from "./files";
import { todayKst } from "./dates";
import { loadCompetitors } from "./config";
import { withRetry } from "./retry";

const RSS_REQUEST_DELAY_MS = 1500;

export type RssPost = {
  competitor_name: string;
  blog_id: string;
  url: string;
  title: string | null;
  published_at: string | null; // YYYY-MM-DD
};

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

/**
 * 등록된 모든 블로그(경쟁사 + 에어패스 자체)의 RSS 피드에서 전체(최근) 게시물을 모은다.
 * `data/raw/<날짜>/blog_posts_rss.json`에 캐시해 하루에 한 번만 실제로 호출한다 —
 * B3(포스팅 주기)와 블로그 SOV 전용 키워드 선정(둘 다 이 결과가 필요)이 같은 날 같은
 * 데이터를 중복 요청하지 않게 하기 위함(robots.txt 예외 사용 최소화, CLAUDE.md 참고).
 *
 * ⚠️ rss.blog.naver.com/robots.txt는 전체 금지지만 예외적으로 쓰기로 한 근거는
 * .claude/skills/naver-blog-fetch/SKILL.md 참고.
 */
export async function getOrFetchRssPosts(date: string = todayKst()): Promise<RssPost[]> {
  const cached = readJson<RssPost[]>(rawPath(date, "blog_posts_rss.json"));
  if (cached) return cached;

  const competitors = loadCompetitors();
  const posts: RssPost[] = [];

  for (const c of competitors) {
    if (!c.blog_id) continue;
    await sleep(RSS_REQUEST_DELAY_MS);
    try {
      const xml = await withRetry(async () => {
        const res = await fetch(`https://rss.blog.naver.com/${c.blog_id}.xml`, {
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

        posts.push({
          competitor_name: c.name,
          blog_id: c.blog_id,
          url: link,
          title,
          published_at: publishedAt,
        });
      }
    } catch (e) {
      console.warn(`[blog-rss] ${c.name} RSS 수집 실패, 스킵: ${(e as Error).message}`);
    }
  }

  writeJson(rawPath(date, "blog_posts_rss.json"), posts);
  return posts;
}
