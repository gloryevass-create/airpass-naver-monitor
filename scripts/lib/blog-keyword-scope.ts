import { readJson, writeJson, rawPath } from "./files";
import { todayKst } from "./dates";
import { syncKeywords, type SyncResult, type SyncedKeyword } from "../skills/naver-keyword-sync";
import { getOrFetchRssPosts } from "./blog-rss";
import { getOrComputeScrapeTargets } from "./keyword-scope";
import { fetchAllBlogPostTitles } from "./supabase-sync";

// 매칭되는 키워드는 전부 검색한다(917개 등록 키워드 중 실제 게시물 제목과 겹치는 것만
// 골라내는 방식이라 이미 자연스럽게 좁혀져 있음 — 사용자 확인, 2026-08-18). 상한만 넉넉히
// 잡아 안전장치로 둔다.
export const BLOG_KEYWORD_COUNT = 100;

export type BlogKeywordTarget = SyncedKeyword & { titleMatchCount: number };

/**
 * 블로그 SOV(B2)는 원래 광고 키워드 상위 50개(검색량 기준)로 검색했는데, 그 키워드들은
 * 네이버 검색광고 계정에 등록된 "제품/카테고리" 검색어라 경쟁사들이 실제로 블로그에 쓰는
 * 주제(예: "OO학교 AI 융합형 교육실 구축 사례")와는 겹치지 않아 SOV가 항상 0에 가깝게
 * 나오는 문제가 있었다(사용자 확인, 2026-08-17).
 *
 * 그래서 블로그 SOV 전용 키워드 세트를 별도로 만든다: 실제 경쟁사 게시물 제목에 실제로
 * 등장하는 단어와 일치하는 것만 917개 등록 키워드 중에서 골라 쓴다. `blog_sov_daily.keyword_id`가
 * 기존 `keywords` 테이블을 참조하는 스키마 제약이 있어(FK), 등록되지 않은 임의의 키워드를
 * 새로 만들어 쓸 수는 없다 — 그래서 "완전히 새로운 키워드 목록"이 아니라 "917개 중 실제
 * 콘텐츠와 맞는 것만 선별"이다.
 *
 * 제목 풀은 그날 RSS로 새로 수집한 것(blog-rss.ts)뿐 아니라, 지금까지 Supabase
 * `blog_posts`에 누적된 전체 게시물 제목도 함께 쓴다(대시보드의 "콘텐츠 매칭 키워드" 20개와
 * 같은 방식). 그날 RSS 스냅샷만 쓰면 하루에 겨우 몇 개 블로그의 최근 글만 보게 돼 매칭되는
 * 키워드가 하루 3~7개로 들쭉날쭉하고, 어제 1위였던 경쟁사가 오늘은 평가 대상에서 통째로
 * 빠지는 문제가 있었다(사용자 확인, 2026-08-24). 누적 제목 풀을 함께 쓰면 대시보드가 뽑는
 * 안정적인 상위 20개가 매일 계속 포함된다.
 */
export async function getOrComputeBlogContentKeywords(
  date: string = todayKst(),
  limit: number = BLOG_KEYWORD_COUNT
): Promise<BlogKeywordTarget[]> {
  const cached = readJson<BlogKeywordTarget[]>(rawPath(date, "blog_content_keywords.json"));
  if (cached) return cached;

  let synced = readJson<SyncResult>(rawPath(date, "keywords_synced.json"));
  if (!synced) {
    synced = await syncKeywords(date);
  }

  const rssPosts = await getOrFetchRssPosts(date);
  let historicalTitles: string[] = [];
  try {
    historicalTitles = await fetchAllBlogPostTitles();
  } catch (e) {
    console.error(
      `[blog-keyword-scope] 누적 제목 조회 실패, 오늘 RSS만으로 계속함: ${(e as Error).message}`
    );
  }
  const titles = Array.from(
    new Set([...rssPosts.map((p) => p.title ?? "").filter(Boolean), ...historicalTitles])
  );

  const scored: BlogKeywordTarget[] = synced.synced
    .map((k) => ({
      ...k,
      titleMatchCount: titles.filter((t) => t.includes(k.keyword)).length,
    }))
    .filter((k) => k.titleMatchCount > 0)
    .sort((a, b) => b.titleMatchCount - a.titleMatchCount)
    .slice(0, limit);

  // 실제 게시물 제목과 겹치는 키워드가 하나도 없으면(예: RSS 수집 실패), 기존 방식
  // (검색량 상위 50개)으로라도 대체해 파이프라인이 완전히 비지는 않게 한다.
  const result: BlogKeywordTarget[] =
    scored.length > 0
      ? scored
      : (await getOrComputeScrapeTargets(date)).map((t) => ({ ...t, titleMatchCount: 0 }));

  writeJson(rawPath(date, "blog_content_keywords.json"), result);
  return result;
}
