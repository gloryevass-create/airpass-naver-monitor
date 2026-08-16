/**
 * 네이버 검색결과 스크래핑 관련 공통 유틸.
 *
 * ⚠️ 한계 고지: 네이버 검색결과/블로그 페이지 스크래핑은 네이버 이용약관상
 * 비공식 영역이다. 이 프로젝트는 (1) robots.txt를 확인하고, (2) 요청 사이에
 * 최소 간격을 두고, (3) 실패 시 즉시 중단(재시도 3회 후 스킵)하는 최소한의
 * 예의를 지키도록 구현되어 있지만, 네이버 약관 준수 여부에 대한 최종 판단과
 * 책임은 이 도구를 운영하는 조직(에어패스)에 있다. 공식 API가 있는 데이터
 * (검색광고 입찰가·검색량 등)는 반드시 A2처럼 공식 API를 쓰고, 스크래핑은
 * 공식 API가 없는 파워링크 노출순서·블로그 검색결과에 한정한다.
 */

const MIN_REQUEST_INTERVAL_MS = 1500;
let lastRequestAt = 0;

export async function politeDelay() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

const robotsCache = new Map<string, string>();

export async function isAllowedByRobots(url: string, userAgent = "*"): Promise<boolean> {
  const origin = new URL(url).origin;
  let robotsTxt = robotsCache.get(origin);
  if (robotsTxt === undefined) {
    try {
      const res = await fetch(`${origin}/robots.txt`);
      robotsTxt = res.ok ? await res.text() : "";
    } catch {
      robotsTxt = "";
    }
    robotsCache.set(origin, robotsTxt);
  }

  const path = new URL(url).pathname;
  const lines = robotsTxt.split("\n").map((l) => l.trim());
  let applies = false;
  let disallowed = false;

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase() === userAgent.toLowerCase();
    } else if (applies && key === "disallow" && value && path.startsWith(value)) {
      disallowed = true;
    }
  }

  return !disallowed;
}
