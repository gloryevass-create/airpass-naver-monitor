import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function rawPath(date: string, filename: string) {
  return `data/raw/${date}/${filename}`;
}

export function processedPath(date: string, filename: string) {
  return `data/processed/${filename.replace("{date}", date)}`;
}
