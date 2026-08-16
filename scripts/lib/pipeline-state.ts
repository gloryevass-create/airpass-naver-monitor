import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getSupabaseClient } from "./supabase-client";

export type Track = "ad" | "blog";
export type RunStatus = "success" | "partial" | "failed";

const STATE_PATH = "output/_pipeline_state.json";

type PipelineState = {
  runs: Record<string, Partial<Record<Track, { status: RunStatus; message?: string; updatedAt: string }>>>;
};

function readState(): PipelineState {
  if (!existsSync(STATE_PATH)) return { runs: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return { runs: {} };
  }
}

function writeState(state: PipelineState) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/** 로컬 _pipeline_state.json과 Supabase pipeline_runs 테이블을 동시에 갱신한다.
 * unique(date, track) 기준 upsert — 같은 날 같은 트랙을 여러 번 실행해도 멱등. */
export async function recordRun(
  date: string,
  track: Track,
  status: RunStatus,
  message?: string
) {
  const state = readState();
  state.runs[date] = state.runs[date] ?? {};
  state.runs[date][track] = { status, message, updatedAt: new Date().toISOString() };
  writeState(state);

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("pipeline_runs")
    .upsert({ date, track, status, message: message ?? null }, { onConflict: "date,track" });

  if (error) {
    console.error(`[pipeline-state] Supabase pipeline_runs upsert 실패: ${error.message}`);
  }
}

/** O2: 통합 리포트는 그날 ad·blog 트랙이 모두 성공했을 때만 생성한다.
 * 로컬 상태가 아니라 Supabase를 조회한다 — 여러 머신/재시작에도 일관된 진실을 유지하기 위함. */
export async function bothTracksSucceeded(date: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("track, status")
    .eq("date", date);

  if (error || !data) return false;

  const ad = data.find((r) => r.track === "ad");
  const blog = data.find((r) => r.track === "blog");
  return ad?.status === "success" && blog?.status === "success";
}
