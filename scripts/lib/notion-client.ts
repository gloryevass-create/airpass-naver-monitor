import { env } from "./env";
import { withRetry } from "./retry";

const BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

async function post<T>(path: string, body: unknown): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion API ${path} 실패 (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  });
}

async function get<T>(path: string): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${env.notionToken}`,
        "Notion-Version": NOTION_VERSION,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion API ${path} 실패 (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  });
}

type NotionDate = { start: string; end: string | null; time_zone: string | null } | null;
type NotionSelect = { name: string } | null;
type NotionStatus = { name: string } | null;
type NotionMultiSelect = { name: string }[];
type NotionPeople = { id: string }[];
type NotionRichText = { plain_text: string }[];
type NotionUser = { id: string; name: string | null };

type NotionPageResult = {
  id: string;
  url: string;
  properties: Record<
    string,
    | { type: "title"; title: NotionRichText }
    | { type: "date"; date: NotionDate }
    | { type: "select"; select: NotionSelect }
    | { type: "status"; status: NotionStatus }
    | { type: "multi_select"; multi_select: NotionMultiSelect }
    | { type: "rich_text"; rich_text: NotionRichText }
    | { type: "people"; people: NotionPeople }
    | { type: "number"; number: number | null }
    | { type: "created_by"; created_by: NotionUser }
    | { type: "created_time"; created_time: string }
    | { type: "files" }
  >;
};

/** 워크스페이스 사용자 id → 이름 맵. 담당자/참석자(people 속성) 표시용. */
async function fetchUserNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const res = await get<{
      results: { id: string; name: string | null }[];
      next_cursor: string | null;
    }>(`/users${cursor ? `?start_cursor=${cursor}` : ""}`);
    for (const u of res.results) if (u.name) map.set(u.id, u.name);
    cursor = res.next_cursor ?? undefined;
  } while (cursor);
  return map;
}

function plainText(rt: NotionRichText | undefined): string {
  return (rt ?? []).map((t) => t.plain_text).join("");
}

export type TeamEventRecord = {
  notionPageId: string;
  title: string;
  dateStart: string;
  dateEnd: string | null;
  isDatetime: boolean;
  category: string | null;
  tags: string[];
  target: string | null;
  location: string | null;
  content: string | null;
  assignees: string[];
  attendees: string[];
  notionUrl: string;
};

/** "행사 및 스케쥴" 데이터베이스의 전체 항목을 페이지네이션으로 가져온다. */
export async function fetchTeamEvents(): Promise<TeamEventRecord[]> {
  const userNames = await fetchUserNameMap();
  const records: TeamEventRecord[] = [];
  let cursor: string | undefined;

  do {
    const res = await post<{ results: NotionPageResult[]; next_cursor: string | null; has_more: boolean }>(
      `/databases/${env.notionEventsDatabaseId}/query`,
      { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }
    );

    for (const page of res.results) {
      const props = page.properties;
      const titleProp = props["이름"];
      const dateProp = props["날짜"];
      if (titleProp?.type !== "title" || dateProp?.type !== "date" || !dateProp.date) continue;

      const categoryProp = props["분류"];
      const tagsProp = props["태그"];
      const targetProp = props["대상"];
      const locationProp = props["장소"];
      const contentProp = props["내용"];
      const assigneesProp = props["담당자"];
      const attendeesProp = props["참석자"];

      records.push({
        notionPageId: page.id,
        title: plainText(titleProp.title) || "(제목 없음)",
        dateStart: dateProp.date.start,
        dateEnd: dateProp.date.end,
        isDatetime: dateProp.date.start.includes("T"),
        category: categoryProp?.type === "select" ? (categoryProp.select?.name ?? null) : null,
        tags: tagsProp?.type === "multi_select" ? tagsProp.multi_select.map((t) => t.name) : [],
        target: targetProp?.type === "select" ? (targetProp.select?.name ?? null) : null,
        location: locationProp?.type === "rich_text" ? plainText(locationProp.rich_text) || null : null,
        content: contentProp?.type === "rich_text" ? plainText(contentProp.rich_text) || null : null,
        assignees:
          assigneesProp?.type === "people"
            ? assigneesProp.people.map((p) => userNames.get(p.id) ?? p.id)
            : [],
        attendees:
          attendeesProp?.type === "people"
            ? attendeesProp.people.map((p) => userNames.get(p.id) ?? p.id)
            : [],
        notionUrl: page.url,
      });
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return records;
}

