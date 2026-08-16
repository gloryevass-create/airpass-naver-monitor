import { readFileSync } from "node:fs";
import { basename } from "node:path";

// 발행 전 체크리스트(O3): 톤·출처 명시·과장 표현 금지·날짜 형식(YYYY-MM-DD).
// 통과해야 output/**/*.md로 발행된다 — .claude/settings.json 훅에서 호출.

const BANNED_PHRASES = [
  "업계 최고",
  "업계 평균적으로",
  "무조건",
  "100% 확실",
  "보장합니다",
  "역대 최고",
  "당연히",
  "확실히 1위",
];

const FILENAME_PATTERN = /^\d{4}-\d{2}-\d{2}_[^_]+_.+\.md$/;
const NON_HYPHEN_DATE_PATTERN = /\d{4}[.\/]\d{1,2}[.\/]\d{1,2}/;

function checkFile(filePath: string): string[] {
  const errors: string[] = [];
  const filename = basename(filePath);
  const content = readFileSync(filePath, "utf-8");

  if (!FILENAME_PATTERN.test(filename)) {
    errors.push(
      `파일명이 [작성일]_[문서유형]_[영역명].md 규칙을 따르지 않습니다: ${filename} (예: 2026-08-16_daily_ad.md)`
    );
  }

  for (const phrase of BANNED_PHRASES) {
    if (content.includes(phrase)) {
      errors.push(`과장/출처 불명 표현이 포함되어 있습니다: "${phrase}"`);
    }
  }

  const hasSourceRef = /(출처|근거|source)\s*[:：]/i.test(content);
  if (!hasSourceRef) {
    errors.push('본문에 출처/근거 표기("출처:" 또는 "근거:")가 하나도 없습니다.');
  }

  const badDateMatch = content.match(NON_HYPHEN_DATE_PATTERN);
  if (badDateMatch) {
    errors.push(
      `날짜가 YYYY-MM-DD 형식이 아닌 것으로 보입니다: "${badDateMatch[0]}" — 점(.)이나 슬래시(/) 대신 하이픈(-)을 쓰세요.`
    );
  }

  return errors;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("사용법: tsx scripts/brand-tone-check.ts <파일경로>");
    process.exit(2);
  }

  const errors = checkFile(filePath);
  if (errors.length > 0) {
    console.error(`[brand-tone-check] 발행 반려: ${basename(filePath)}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(2);
  }

  console.log(`[brand-tone-check] OK: ${filePath}`);
  process.exit(0);
}

main();
