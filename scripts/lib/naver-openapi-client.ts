import { env } from "./env";
import { withRetry } from "./retry";

// 네이버가 2026-06-25 "NAVER API HUB"(네이버클라우드플랫폼)로 검색 오픈API 발급/호출 방식을
// 이전했다 — 예전 developers.naver.com 방식(X-Naver-Client-Id 헤더, openapi.naver.com 호스트)은
// 이 프로젝트를 만드는 시점에 이미 "NID AUTH Result Invalid" 에러로 막혀 있었다. 새 게이트웨이는
// 호스트와 인증 헤더 이름이 다르다(NCP API Gateway 공통 방식): X-NCP-APIGW-API-KEY-ID / -KEY.
const BASE_URL = "https://naverapihub.apigw.ntruss.com";

export type BlogSearchItem = {
  title: string; // <b> 태그 포함된 HTML 조각일 수 있음
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string; // YYYYMMDD
};

/**
 * 네이버 공식 검색 오픈API(NAVER API HUB, 네이버클라우드플랫폼 콘솔에서 발급받은
 * Client ID/Secret으로 인증) — search.naver.com 스크래핑이 robots.txt로 전면 금지된 뒤
 * (CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절 참고) B2(블로그 검색결과)·B3(경쟁사 게시물)
 * 모두 이 API로 대체했다. 이 도메인의 robots.txt에도 `Disallow: /`가 있을 수 있지만,
 * 이는 색인 크롤러용 규칙이고 발급받은 키로 인증하는 공식 API 호출에는 적용되는 관례가
 * 아니다(검색광고 API도 동일하게 취급).
 * 문서: https://api.ncloud-docs.com/docs/naver-api-hub-search-blog
 */
export async function searchBlog(query: string, display = 10): Promise<BlogSearchItem[]> {
  const url = new URL("/search/v1/blog", BASE_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "sim"); // 정확도순 — 실제 검색결과 화면의 기본 정렬과 가장 가까움

  return withRetry(async () => {
    const res = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": env.naverOpenApiClientId,
        "X-NCP-APIGW-API-KEY": env.naverOpenApiClientSecret,
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
