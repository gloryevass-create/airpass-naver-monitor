import { fetchChannelByHandle, fetchAllVideoIds, fetchVideoStats } from "../lib/youtube-client";
import { env } from "../lib/env";
import { writeJson, rawPath, processedPath } from "../lib/files";
import { todayKst } from "../lib/dates";

export type YoutubeResult = {
  channel: {
    subscriber_count: number;
    view_count: number;
    video_count: number;
  };
  videos: {
    video_id: string;
    title: string;
    published_at: string | null;
    view_count: number;
    like_count: number;
    comment_count: number;
    duration_seconds: number | null;
    thumbnail_url: string | null;
  }[];
};

/** Y1: 에어패스 공식 유튜브 채널(@AIRPASS_XR) 운영 현황 수집(YouTube Data API v3, 공식,
 * OAuth 불필요 — 공개 채널·영상 통계만 조회). 채널 통계는 일별 스냅샷으로, 영상은 매일
 * 전체를 다시 조회해 최신 조회수·좋아요·댓글수로 upsert한다. */
export async function fetchYoutubeData(date: string = todayKst()): Promise<YoutubeResult> {
  const channel = await fetchChannelByHandle(env.youtubeChannelHandle);
  const videoIds = await fetchAllVideoIds(channel.uploadsPlaylistId);
  const stats = await fetchVideoStats(videoIds);

  const result: YoutubeResult = {
    channel: {
      subscriber_count: channel.subscriberCount,
      view_count: channel.viewCount,
      video_count: channel.videoCount,
    },
    videos: stats.map((v) => ({
      video_id: v.videoId,
      title: v.title,
      published_at: v.publishedAt,
      view_count: v.viewCount,
      like_count: v.likeCount,
      comment_count: v.commentCount,
      duration_seconds: v.durationSeconds,
      thumbnail_url: v.thumbnailUrl,
    })),
  };

  writeJson(rawPath(date, "youtube.json"), result);
  // 판단 단계가 없는 순수 수집 데이터라 processed 파일도 함께 저장.
  writeJson(processedPath(date, "youtube_{date}.json"), { date, ...result });
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchYoutubeData()
    .then((r) =>
      console.log(
        `[youtube-fetch] 채널 통계 + 영상 ${r.videos.length}건 수집 완료 (구독자 ${r.channel.subscriber_count}명)`
      )
    )
    .catch((e) => {
      console.error(`[youtube-fetch] 실패: ${e.message}`);
      process.exit(1);
    });
}
