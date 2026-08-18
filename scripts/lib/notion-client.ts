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

export type BusinessProjectRecord = {
  notionPageId: string;
  title: string;
  stage: string | null;
  status: string | null;
  orgName: string | null;
  participationType: string | null;
  workType: string | null;
  result: string | null;
  amount: number | null;
  progressRate: number | null;
  submissionDate: string | null;
  submissionDateIsDatetime: boolean;
  submissionMethod: string | null;
  presentationDate: string | null;
  presentationDateIsDatetime: boolean;
  constructionStart: string | null;
  constructionEnd: string | null;
  constructionContent: string | null;
  assignees: string[];
  createdBy: string | null;
  notionCreatedAt: string | null;
  notionUrl: string;
};

/** "사업진행 현황" 데이터베이스(영업진행→사업제안→제안서작성→사업수행→사업완료 칸반)의
 * 전체 항목을 페이지네이션으로 가져온다. */
export async function fetchBusinessProjects(): Promise<BusinessProjectRecord[]> {
  const userNames = await fetchUserNameMap();
  const records: BusinessProjectRecord[] = [];
  let cursor: string | undefined;

  do {
    const res = await post<{ results: NotionPageResult[]; next_cursor: string | null; has_more: boolean }>(
      `/databases/${env.notionBusinessDatabaseId}/query`,
      { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }
    );

    for (const page of res.results) {
      const props = page.properties;
      const titleProp = props["공고명"];
      if (titleProp?.type !== "title") continue;

      const stageProp = props["분류"];
      const statusProp = props["상태"];
      const orgNameProp = props["발주처"];
      const participationTypeProp = props["구분"];
      const workTypeProp = props["업무"];
      const resultProp = props["결과"];
      const amountProp = props["금액"];
      const progressRateProp = props["진행률"];
      const submissionDateProp = props["제출일"];
      const submissionMethodProp = props["제출방법 및 시간"];
      const presentationDateProp = props["발표평가"];
      const constructionProp = props["공사&설치일정"];
      const constructionContentProp = props["공사 내용"];
      const assigneesProp = props["담당자"];
      const createdByProp = props["생성자"];
      const createdAtProp = props["날짜"];

      records.push({
        notionPageId: page.id,
        title: plainText(titleProp.title) || "(제목 없음)",
        stage: stageProp?.type === "select" ? (stageProp.select?.name ?? null) : null,
        status: statusProp?.type === "status" ? (statusProp.status?.name ?? null) : null,
        orgName: orgNameProp?.type === "rich_text" ? plainText(orgNameProp.rich_text) || null : null,
        participationType:
          participationTypeProp?.type === "select" ? (participationTypeProp.select?.name ?? null) : null,
        workType: workTypeProp?.type === "select" ? (workTypeProp.select?.name ?? null) : null,
        result: resultProp?.type === "select" ? (resultProp.select?.name ?? null) : null,
        amount: amountProp?.type === "number" ? amountProp.number : null,
        progressRate: progressRateProp?.type === "number" ? progressRateProp.number : null,
        submissionDate: submissionDateProp?.type === "date" ? (submissionDateProp.date?.start ?? null) : null,
        submissionDateIsDatetime:
          submissionDateProp?.type === "date" ? (submissionDateProp.date?.start.includes("T") ?? false) : false,
        submissionMethod:
          submissionMethodProp?.type === "rich_text" ? plainText(submissionMethodProp.rich_text) || null : null,
        presentationDate:
          presentationDateProp?.type === "date" ? (presentationDateProp.date?.start ?? null) : null,
        presentationDateIsDatetime:
          presentationDateProp?.type === "date"
            ? (presentationDateProp.date?.start.includes("T") ?? false)
            : false,
        constructionStart: constructionProp?.type === "date" ? (constructionProp.date?.start ?? null) : null,
        constructionEnd: constructionProp?.type === "date" ? (constructionProp.date?.end ?? null) : null,
        constructionContent:
          constructionContentProp?.type === "rich_text" ? plainText(constructionContentProp.rich_text) || null : null,
        assignees:
          assigneesProp?.type === "people"
            ? assigneesProp.people.map((p) => userNames.get(p.id) ?? p.id)
            : [],
        createdBy: createdByProp?.type === "created_by" ? (createdByProp.created_by.name ?? null) : null,
        notionCreatedAt: createdAtProp?.type === "created_time" ? createdAtProp.created_time : null,
        notionUrl: page.url,
      });
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return records;
}
