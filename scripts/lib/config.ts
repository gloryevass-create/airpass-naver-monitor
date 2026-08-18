import { readFileSync } from "node:fs";
import { parse } from "yaml";

export function loadExcludedKeywords(): string[] {
  const raw = parse(readFileSync("config/keyword_exclude.yaml", "utf-8")) as {
    exclude_keywords: string[];
  };
  return raw.exclude_keywords ?? [];
}
