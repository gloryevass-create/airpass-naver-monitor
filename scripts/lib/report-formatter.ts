import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type ReportType = "daily" | "weekly" | "monthly";
export type Track = "ad" | "blog" | "combined";

/** 파일명 규칙: [작성일]_[문서유형]_[영역명].md (예: 2026-08-16_daily_ad.md) */
export function reportFilePath(date: string, reportType: ReportType, track: Track): string {
  return `output/${reportType}/${date}_${reportType}_${track}.md`;
}

/** 이 함수로 쓴 파일은 .claude/settings.json 훅이 브랜드 톤 체크를 통과시켜야만
 * "발행 완료"로 간주한다 — 훅이 실패(exit 2)하면 이 write 자체가 거부된다. */
export function writeReport(
  date: string,
  reportType: ReportType,
  track: Track,
  contentMd: string
): string {
  const path = reportFilePath(date, reportType, track);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contentMd);
  return path;
}
