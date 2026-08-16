import { createHmac } from "node:crypto";
import { env } from "./env";
import { withRetry } from "./retry";

const BASE_URL = "https://api.searchad.naver.com";

function sign(timestamp: string, method: string, path: string) {
  const message = `${timestamp}.${method}.${path}`;
  return createHmac("sha256", env.naverSecretKey).update(message).digest("base64");
}

/** 네이버 검색광고(SearchAd) API 공식 인증 방식(HMAC-SHA256) 요청 헬퍼.
 * 문서: https://naver.github.io/searchad-apidoc/ */
export async function searchAdRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {}
): Promise<T> {
  const timestamp = Date.now().toString();
  const url = new URL(path, BASE_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, v);
  }

  return withRetry(async () => {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Timestamp": timestamp,
        "X-API-KEY": env.naverApiKey,
        "X-Customer": env.naverCustomerId,
        "X-Signature": sign(timestamp, method, path),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SearchAd API ${method} ${path} 실패 (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  });
}

export type NccCampaign = { nccCampaignId: string; name: string; status: string };
export type NccAdgroup = { nccAdgroupId: string; nccCampaignId: string; name: string; status: string };
export type NccKeyword = {
  nccKeywordId: string;
  nccAdgroupId: string;
  keyword: string;
  status: string;
  userLock: boolean;
};

export async function fetchCampaigns() {
  return searchAdRequest<NccCampaign[]>("GET", "/ncc/campaigns");
}

export async function fetchAdgroups(campaignId: string) {
  return searchAdRequest<NccAdgroup[]>("GET", "/ncc/adgroups", {
    query: { nccCampaignId: campaignId },
  });
}

export async function fetchKeywords(adgroupId: string) {
  return searchAdRequest<NccKeyword[]>("GET", "/ncc/keywords", {
    query: { nccAdgroupId: adgroupId },
  });
}

export type KeywordToolStat = {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx: string; // 경쟁정도: 낮음/중간/높음
};

/** 월간검색수·경쟁정도 조회 (키워드도구 API). */
export async function fetchKeywordStats(keywords: string[]) {
  return searchAdRequest<{ keywordList: KeywordToolStat[] }>("GET", "/keywordstool", {
    query: { hintKeywords: keywords.join(","), showDetail: "1" },
  });
}

export type StatDay = {
  dateStart: string;
  dateEnd: string;
  impCnt: number;
  clkCnt: number;
  ctr: number;
  cpc: number;
  salesAmt: number;
  avgRnk: number;
};

/** 키워드의 실제 광고 통계(공식 API) — 노출수·클릭수·평균 노출순위(avgRnk) 등.
 * "우리 순위"는 이 avgRnk를 쓴다 — 파워링크 페이지를 스크래핑해 추정하는 것보다
 * 우리 자신의 실제 집행 데이터라 훨씬 정확하고, 네이버가 자동화 세션에는 파워링크
 * 광고 콘텐츠 자체를 보여주지 않는 문제(CLAUDE.md의 "왜 스크래핑을 안 쓰는가" 절 참고)와
 * 무관하게 항상 얻을 수 있다. */
export async function fetchKeywordStatReport(keywordId: string, since: string, until: string) {
  return searchAdRequest<{ data: StatDay[] }>("GET", "/stats", {
    query: {
      id: keywordId,
      fields: JSON.stringify(["impCnt", "clkCnt", "ctr", "cpc", "salesAmt", "avgRnk"]),
      timeRange: JSON.stringify({ since, until }),
    },
  });
}

