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

export type EstimateBid = { bid: number; expCpc?: number };

/** 특정 순위 도달에 필요한 예상 입찰가 조회 (연관 입찰가 API). */
export async function fetchEstimateBid(params: {
  device: "PC" | "MOBILE";
  keywordId: string;
  key: string; // biz channel key 등, 계정 세팅에 따라 다름 — 실 계정 연동 시 조정 필요
  targetRank: number;
}) {
  return searchAdRequest<EstimateBid>("GET", "/estimate/average-position-bid/keyword", {
    query: {
      device: params.device,
      key: params.key,
      keywordId: params.keywordId,
      targetRank: String(params.targetRank),
    },
  });
}
