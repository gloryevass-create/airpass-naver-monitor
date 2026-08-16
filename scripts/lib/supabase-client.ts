import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { env } from "./env";

let client: ReturnType<typeof createClient<Database>> | null = null;

/** service_role 키를 쓰는 쓰기 전용 클라이언트. 이 에이전트만 이 키를 쓴다 —
 * 웹 대시보드(프로젝트 1)는 anon 키로 SELECT만 한다. */
export function getSupabaseClient() {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
