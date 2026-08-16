import { env } from "./env";
import { withRetry } from "./retry";

const BASE_URL = "https://openapi.naver.com";

export type BlogSearchItem = {
  title: string; // <b> 태그 포함된 HTML 조각일 수 있음
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string; // YYYYMMDD
};

/**
 * 네이버 공식 오픈API(개발자센터에서 발급받은 Client ID/Secret으로 인증) —
 * search.naver.com 스크래핑이 robots.txt로 전면 금지된 뒤(CLAUDE.md의
 * "왜 스크래핑을 안 쓰는가" 절 참고) B2(블로그 검색결과)·B3(경쟁사 게시물) 모두 이 API로 대체했다.
 * 이 도메인의 robots.txt에도 `Disallow: /`가 있지만, 이는 색인 크롤러용 규칙이고
 * 발급받은 키로 인증하는 공식 개발자 API 호출에는 적용되는 관례가 아니다
 * (검색광고 API도 동일하게 취급).
 * 문서: https://developers.naver.com/docs/serviceapi/search/blog/blog.md
 */
export async function searchBlog(query: string, display = 10): Promise<BlogSearchItem[]> {
  const url = new URL("/v1/search/blog.json", BASE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "sim"); // 정확도순 — 실제 검색결과 화면의 기본 정렬과 가장 가까움

  return withRetry(async () => {
    const res = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": env.naverOpenApiClientId,
        "X-Naver-Client-Secret": env.naverOpenApiClientSecret,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`블로그 검색 API 실패 (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { items: BlogSearchItem[] };
    return json.items;
  });
}
