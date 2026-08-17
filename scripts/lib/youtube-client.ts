import { env } from "./env";
import { withRetry } from "./retry";

// YouTube Data API v3(공식, API 키 인증) — OAuth 없이 공개 채널·영상 통계만 조회한다.
// 문서: https://developers.google.com/youtube/v3/docs
const BASE_URL = "https://www.googleapis.com/youtube/v3";

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  // new URL(path, BASE_URL)은 path가 "/"로 시작하면 BASE_URL의 경로(/youtube/v3)를
  // origin 기준으로 덮어써버린다(WHATWG URL 스펙) — 반드시 문자열 결합으로 만든다.
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", env.youtubeApiKey);

  return withRetry(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`YouTube API ${path} 실패 (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  });
}

export type ChannelInfo = {
  channelId: string;
  title: string;
  uploadsPlaylistId: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
};

/** 채널 핸들(@없이)로 채널 ID·통계·업로드 재생목록 ID를 한 번에 조회한다. */
export async function fetchChannelByHandle(handle: string): Promise<ChannelInfo> {
  const res = await get<{
    items: {
      id: string;
      snippet: { title: string };
      contentDetails: { relatedPlaylists: { uploads: string } };
      statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
    }[];
  }>("/channels", { part: "snippet,statistics,contentDetails", forHandle: handle });

  const channel = res.items[0];
  if (!channel) throw new Error(`채널을 찾을 수 없습니다: @${handle}`);

  return {
    channelId: channel.id,
    title: channel.snippet.title,
    uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads,
    subscriberCount: Number(channel.statistics.subscriberCount ?? 0),
    viewCount: Number(channel.statistics.viewCount ?? 0),
    videoCount: Number(channel.statistics.videoCount ?? 0),
  };
}

/** 업로드 재생목록의 전체 영상 ID를 페이지네이션으로 모두 가져온다. */
export async function fetchAllVideoIds(uploadsPlaylistId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const res = await get<{
      items: { contentDetails: { videoId: string } }[];
      nextPageToken?: string;
    }>("/playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    ids.push(...res.items.map((i) => i.contentDetails.videoId));
    pageToken = res.nextPageToken;
  } while (pageToken);

  return ids;
}

export type VideoStat = {
  videoId: string;
  title: string;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
};

function parseIsoDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, h, min, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(min ?? 0) * 60) + Number(s ?? 0);
}

/** videos.list는 한 번에 최대 50개 ID까지 받는다 — 배치로 나눠 호출한다. */
export async function fetchVideoStats(videoIds: string[]): Promise<VideoStat[]> {
  const results: VideoStat[] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);
    const res = await get<{
      items: {
        id: string;
        snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string } } };
        statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
        contentDetails: { duration?: string };
      }[];
    }>("/videos", { part: "snippet,statistics,contentDetails", id: batch.join(",") });

    for (const item of res.items) {
      results.push({
        videoId: item.id,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt ?? null,
        viewCount: Number(item.statistics.viewCount ?? 0),
        likeCount: Number(item.statistics.likeCount ?? 0),
        commentCount: Number(item.statistics.commentCount ?? 0),
        durationSeconds: parseIsoDuration(item.contentDetails.duration),
        thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? null,
      });
    }
  }

  return results;
}
