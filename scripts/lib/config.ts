import { readFileSync } from "node:fs";
import { parse } from "yaml";

export type CompetitorConfig = {
  name: string;
  domain?: string | null;
  blog_id?: string | null;
};

export function loadCompetitors(): CompetitorConfig[] {
  const raw = parse(readFileSync("config/competitors.yaml", "utf-8")) as {
    competitors: CompetitorConfig[];
  };
  return raw.competitors ?? [];
}

export function loadExcludedKeywords(): string[] {
  const raw = parse(readFileSync("config/keyword_exclude.yaml", "utf-8")) as {
    exclude_keywords: string[];
  };
  return raw.exclude_keywords ?? [];
}

export function loadNewsKeywords(): string[] {
  const raw = parse(readFileSync("config/news_keywords.yaml", "utf-8")) as {
    keywords: string[];
  };
  return raw.keywords ?? [];
}

export function loadBudgetKeywords(): string[] {
  const raw = parse(readFileSync("config/budget_keywords.yaml", "utf-8")) as {
    keywords: string[];
  };
  return raw.keywords ?? [];
}
