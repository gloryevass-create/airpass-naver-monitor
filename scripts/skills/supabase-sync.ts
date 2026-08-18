import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fetchCompetitorIdMap } from "../lib/competitors";
import type { Json } from "../lib/database.types";
import { recordRun } from "../lib/pipeline-state";
import {
  fetchKeywordIdMap,
  upsertKeywordDailyMetrics,
  upsertAdSpendEstimates,
  upsertAdAccountDailyStats,
  upsertAdAccountBizmoney,
  upsertBlogPosts,
  upsertBlogSovDaily,
  upsertPostingCadence,
  upsertNewsArticles,
  upsertBudgetBids,
  upsertYoutubeChannelStats,
  upsertYoutubeVideos,
  upsertTeamEvents,
  deleteStaleTeamEvents,
  replaceYouthFacilities,
  replaceDisabilityOrganizations,
  replaceDisabilitySportsFacilities,
  replaceDisabilityWelfareCenters,
  replaceSpecialSchools,
  insertAlerts,
  upsertDailyReport,
} from "../lib/supabase-sync";

type ProcessedAds = {
  date: string;
  metrics: {
    naver_keyword_id: string;
    monthly_search_pc?: number | null;
    monthly_search_mobile?: number | null;
    monthly_click_pc?: number | null;
    monthly_click_mobile?: number | null;
    avg_cpc?: number | null;
    competition_level?: string | null;
    our_rank?: number | null;
    spend_7d?: number | null;
  }[];
  spend_estimates: {
    competitor_name: string;
    naver_keyword_id: string;
    estimated_monthly_spend: number;
    calc_basis: Record<string, unknown>;
  }[];
  account_stats?: {
    trend: {
      date: string;
      imp_cnt: number;
      clk_cnt: number;
      ccnt: number;
      sales_amt: number;
      ctr: number;
      cpc: number;
    }[];
    bizmoney: number | null;
  };
  alerts?: { severity: "info" | "warning" | "critical"; category: string; message: string; evidence_ref: string }[];
  report?: { report_type: "daily" | "weekly" | "monthly"; title: string; content_md: string; source_refs: string[] };
};

type ProcessedBlog = {
  date: string;
  blog_posts: { competitor_name: string; url: string; title?: string | null; published_at?: string | null }[];
  sov: { naver_keyword_id: string; competitor_name: string; share_pct: number }[];
  cadence: { competitor_name: string; avg_interval_days?: number | null; last_post_at?: string | null; post_count_30d: number }[];
  alerts?: { severity: "info" | "warning" | "critical"; category: string; message: string; evidence_ref: string }[];
  report?: { report_type: "daily" | "weekly" | "monthly"; title: string; content_md: string; source_refs: string[] };
};

type ProcessedNews = {
  date: string;
  articles: {
    keyword: string;
    title: string;
    link: string;
    description?: string | null;
    published_at?: string | null;
  }[];
};

type ProcessedBudget = {
  date: string;
  bids: {
    keyword: string;
    business_type: "cnstwk" | "servc" | "thng";
    bid_no: string;
    bid_ord: string;
    title: string;
    notice_inst?: string | null;
    demand_inst?: string | null;
    budget_amount?: number | null;
    presmpt_price?: number | null;
    notice_date?: string | null;
    opening_date?: string | null;
    detail_url?: string | null;
  }[];
};

type ProcessedEvents = {
  date: string;
  events: {
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
  }[];
};

type ProcessedYouthFacilities = {
  date: string;
  facilities: {
    facilityName: string;
    representativeName: string | null;
    operatingBody: string | null;
    operationMode: string | null;
    foundationSubject: string | null;
    foundationOrgDetail: string | null;
    installationType: string | null;
    facilityType: string | null;
    provinceName: string | null;
    districtName: string | null;
    roadAddress: string | null;
    lotAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    homepageUrl: string | null;
    phoneNumber: string | null;
    faxNumber: string | null;
    email: string | null;
    operatingHours: string | null;
    holidayInfo: string | null;
    hasParking: boolean | null;
    capacityCount: number | null;
    overnightCapacityCount: number | null;
    stayCapacityCount: number | null;
    companionCapacityCount: number | null;
    firstRegisteredDate: string | null;
    referenceDate: string | null;
    isExposed: boolean | null;
    remarks: string | null;
  }[];
};

type ProcessedDisabilityOrgs = {
  date: string;
  organizations: {
    groupName: string;
    provinceName: string | null;
    districtName: string | null;
    roadAddress: string | null;
    lotAddress: string | null;
    foundationDate: string | null;
    memberCount: number | null;
    phoneNumber: string | null;
    representativeName: string | null;
    referenceDate: string | null;
    providerOrgCode: string | null;
    providerOrgName: string | null;
  }[];
};

type ProcessedDisabilitySports = {
  date: string;
  facilities: {
    facilityName: string;
    provinceName: string | null;
    districtName: string | null;
    operatingBody: string | null;
    phoneNumber: string | null;
    homepageUrl: string | null;
    hasVoucherProgram: boolean | null;
    hasBandabiFacility: boolean | null;
  }[];
};

type ProcessedDisabilityWelfare = {
  date: string;
  centers: {
    facilityName: string;
    facilityType: string | null;
    provinceName: string | null;
    roadAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    operatingStatus: string | null;
    establishmentDate: string | null;
    welfareFacilityId: string | null;
  }[];
};

type ProcessedSpecialSchools = {
  date: string;
  schools: {
    schoolName: string;
    provinceName: string | null;
    foundationType: string | null;
    disabilityDomain: string | null;
    principalName: string | null;
    approvalDate: string | null;
    openingDate: string | null;
    principalOfficePhone: string | null;
    adminOfficePhone: string | null;
    teacherOfficePhone: string | null;
    faxNumber: string | null;
    zipCode: string | null;
    address: string | null;
    homepageUrl: string | null;
    referenceDate: string | null;
  }[];
};

type ProcessedYoutube = {
  date: string;
  channel: {
    subscriber_count: number;
    view_count: number;
    video_count: number;
  };
  videos: {
    video_id: string;
    title: string;
    published_at?: string | null;
    view_count: number;
    like_count: number;
    comment_count: number;
    duration_seconds?: number | null;
    thumbnail_url?: string | null;
  }[];
};

/** A8: Track A(ads_*.json) 결과를 Supabase에 반영. 이미 .claude/settings.json 훅에서
 * 스키마 검증을 통과한 파일만 여기까지 온다는 전제(Spec-First). */
async function syncAds(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedAds;
  const competitorMap = await fetchCompetitorIdMap();
  const keywordMap = await fetchKeywordIdMap();

  const metricRows = data.metrics
    .filter((m) => keywordMap.has(m.naver_keyword_id))
    .map((m) => ({
      date: data.date,
      keyword_id: keywordMap.get(m.naver_keyword_id)!,
      monthly_search_pc: m.monthly_search_pc ?? null,
      monthly_search_mobile: m.monthly_search_mobile ?? null,
      monthly_click_pc: m.monthly_click_pc ?? null,
      monthly_click_mobile: m.monthly_click_mobile ?? null,
      avg_cpc: m.avg_cpc ?? null,
      competition_level: m.competition_level ?? null,
      // keyword_daily_metrics.our_rank는 integer 컬럼인데, 검색광고 공식 통계의 avgRnk는
      // 여러 날짜/노출의 평균이라 소수(예: 22.3)로 온다 — 반올림해서 저장한다.
      our_rank: m.our_rank != null ? Math.round(m.our_rank) : null,
      spend_7d: m.spend_7d ?? null,
    }));
  await upsertKeywordDailyMetrics(metricRows);

  const spendRows = data.spend_estimates
    .filter((s) => keywordMap.has(s.naver_keyword_id) && competitorMap.has(s.competitor_name))
    .map((s) => ({
      date: data.date,
      keyword_id: keywordMap.get(s.naver_keyword_id)!,
      competitor_id: competitorMap.get(s.competitor_name)!,
      estimated_monthly_spend: s.estimated_monthly_spend,
      calc_basis: s.calc_basis as Json,
    }));
  await upsertAdSpendEstimates(spendRows);

  if (data.account_stats) {
    const statRows = data.account_stats.trend.map((t) => ({
      date: t.date,
      imp_cnt: t.imp_cnt,
      clk_cnt: t.clk_cnt,
      ccnt: t.ccnt,
      sales_amt: t.sales_amt,
      ctr: t.ctr,
      cpc: t.cpc,
    }));
    await upsertAdAccountDailyStats(statRows);
    if (data.account_stats.bizmoney != null) {
      await upsertAdAccountBizmoney(data.date, data.account_stats.bizmoney);
    }
  }

  if (data.alerts?.length) {
    await insertAlerts(data.alerts.map((a) => ({ date: data.date, ...a })));
  }
  if (data.report) {
    await upsertDailyReport({
      date: data.date,
      report_type: data.report.report_type,
      track: "ad",
      title: data.report.title,
      content_md: data.report.content_md,
      source_refs: data.report.source_refs,
    });
  }

  await recordRun(data.date, "ad", "success", `${metricRows.length}개 키워드, ${spendRows.length}건 광고비 추정`);
  console.log(`[supabase-sync] ad 트랙 동기화 완료 (${data.date})`);
}

/** B8: Track B(blog_*.json) 결과를 Supabase에 반영. */
async function syncBlog(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedBlog;
  const competitorMap = await fetchCompetitorIdMap();
  const keywordMap = await fetchKeywordIdMap();

  const postRows = data.blog_posts
    .filter((p) => competitorMap.has(p.competitor_name))
    .map((p) => ({
      competitor_id: competitorMap.get(p.competitor_name)!,
      url: p.url,
      title: p.title ?? null,
      published_at: p.published_at ?? null,
      collected_at: data.date,
    }));
  await upsertBlogPosts(postRows);

  const sovRows = data.sov
    .filter((s) => keywordMap.has(s.naver_keyword_id) && competitorMap.has(s.competitor_name))
    .map((s) => ({
      date: data.date,
      keyword_id: keywordMap.get(s.naver_keyword_id)!,
      competitor_id: competitorMap.get(s.competitor_name)!,
      share_pct: s.share_pct,
    }));
  await upsertBlogSovDaily(sovRows);

  const cadenceRows = data.cadence
    .filter((c) => competitorMap.has(c.competitor_name))
    .map((c) => ({
      date: data.date,
      competitor_id: competitorMap.get(c.competitor_name)!,
      avg_interval_days: c.avg_interval_days ?? null,
      last_post_at: c.last_post_at ?? null,
      post_count_30d: c.post_count_30d,
    }));
  await upsertPostingCadence(cadenceRows);

  if (data.alerts?.length) {
    await insertAlerts(data.alerts.map((a) => ({ date: data.date, ...a })));
  }
  if (data.report) {
    await upsertDailyReport({
      date: data.date,
      report_type: data.report.report_type,
      track: "blog",
      title: data.report.title,
      content_md: data.report.content_md,
      source_refs: data.report.source_refs,
    });
  }

  await recordRun(data.date, "blog", "success", `${postRows.length}건 게시물, ${sovRows.length}건 SOV`);
  console.log(`[supabase-sync] blog 트랙 동기화 완료 (${data.date})`);
}

/** N2: 뉴스 모니터링 결과를 Supabase에 반영. keywords/competitors와 무관한 독립 데이터라
 * pipeline_runs(track 체크 제약이 'ad'/'blog'만 허용)는 건드리지 않고 콘솔 로그로만 기록한다. */
async function syncNews(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedNews;

  const rows = data.articles.map((a) => ({
    keyword: a.keyword,
    title: a.title,
    link: a.link,
    description: a.description ?? null,
    published_at: a.published_at ?? null,
    collected_at: data.date,
  }));
  await upsertNewsArticles(rows);

  console.log(`[supabase-sync] news 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

/** N4: 예산 모니터링 결과를 Supabase에 반영. news와 마찬가지로 독립 데이터라
 * pipeline_runs는 건드리지 않는다. */
async function syncBudget(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedBudget;

  const rows = data.bids.map((b) => ({
    keyword: b.keyword,
    business_type: b.business_type,
    bid_no: b.bid_no,
    bid_ord: b.bid_ord,
    title: b.title,
    notice_inst: b.notice_inst ?? null,
    demand_inst: b.demand_inst ?? null,
    budget_amount: b.budget_amount ?? null,
    presmpt_price: b.presmpt_price ?? null,
    notice_date: b.notice_date ?? null,
    opening_date: b.opening_date ?? null,
    detail_url: b.detail_url ?? null,
    collected_at: data.date,
  }));
  await upsertBudgetBids(rows);

  console.log(`[supabase-sync] budget 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

/** Y2: 유튜브 채널 분석 결과를 Supabase에 반영. news/budget과 마찬가지로 독립 데이터라
 * pipeline_runs는 건드리지 않는다. */
async function syncYoutube(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedYoutube;

  await upsertYoutubeChannelStats({
    date: data.date,
    subscriber_count: data.channel.subscriber_count,
    view_count: data.channel.view_count,
    video_count: data.channel.video_count,
  });

  const videoRows = data.videos.map((v) => ({
    video_id: v.video_id,
    title: v.title,
    published_at: v.published_at ?? null,
    view_count: v.view_count,
    like_count: v.like_count,
    comment_count: v.comment_count,
    duration_seconds: v.duration_seconds ?? null,
    thumbnail_url: v.thumbnail_url ?? null,
  }));
  await upsertYoutubeVideos(videoRows);

  console.log(`[supabase-sync] youtube 트랙 동기화 완료 (${data.date}) — 영상 ${videoRows.length}건`);
}

/** E2: 팀 노션 일정 결과를 Supabase에 반영. news/budget/youtube와 마찬가지로 독립
 * 데이터라 pipeline_runs는 건드리지 않는다. Notion에서 삭제된 항목은 오늘 동기화에
 * 없는 notion_page_id로 판단해 함께 삭제한다(원본이 Notion이므로 그대로 미러링). */
async function syncEvents(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedEvents;

  const rows = data.events.map((e) => ({
    notion_page_id: e.notionPageId,
    title: e.title,
    date_start: e.dateStart,
    date_end: e.dateEnd,
    is_datetime: e.isDatetime,
    category: e.category,
    tags: e.tags,
    target: e.target,
    location: e.location,
    content: e.content,
    assignees: e.assignees,
    attendees: e.attendees,
    notion_url: e.notionUrl,
    updated_at: new Date().toISOString(),
  }));
  await upsertTeamEvents(rows);
  if (rows.length > 0) await deleteStaleTeamEvents(rows.map((r) => r.notion_page_id));

  console.log(`[supabase-sync] events 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

/** F2: 청소년관련기관DB 결과를 Supabase에 반영. 참고용 스냅샷이라 pipeline_runs는
 * 건드리지 않고, 매번 delete-all-then-insert로 통째로 교체한다. */
async function syncYouthFacilities(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedYouthFacilities;

  const rows = data.facilities.map((f) => ({
    facility_name: f.facilityName,
    representative_name: f.representativeName,
    operating_body: f.operatingBody,
    operation_mode: f.operationMode,
    foundation_subject: f.foundationSubject,
    foundation_org_detail: f.foundationOrgDetail,
    installation_type: f.installationType,
    facility_type: f.facilityType,
    province_name: f.provinceName,
    district_name: f.districtName,
    road_address: f.roadAddress,
    lot_address: f.lotAddress,
    latitude: f.latitude,
    longitude: f.longitude,
    homepage_url: f.homepageUrl,
    phone_number: f.phoneNumber,
    fax_number: f.faxNumber,
    email: f.email,
    operating_hours: f.operatingHours,
    holiday_info: f.holidayInfo,
    has_parking: f.hasParking,
    capacity_count: f.capacityCount,
    overnight_capacity_count: f.overnightCapacityCount,
    stay_capacity_count: f.stayCapacityCount,
    companion_capacity_count: f.companionCapacityCount,
    first_registered_date: f.firstRegisteredDate,
    reference_date: f.referenceDate,
    is_exposed: f.isExposed,
    remarks: f.remarks,
  }));
  await replaceYouthFacilities(rows);

  console.log(`[supabase-sync] youthfacilities 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

/** G2: 장애인관련기관 결과를 Supabase에 반영. 참고용 스냅샷이라 pipeline_runs는
 * 건드리지 않고, 매번 delete-all-then-insert로 통째로 교체한다. */
async function syncDisabilityOrgs(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedDisabilityOrgs;

  const rows = data.organizations.map((o) => ({
    group_name: o.groupName,
    province_name: o.provinceName,
    district_name: o.districtName,
    road_address: o.roadAddress,
    lot_address: o.lotAddress,
    foundation_date: o.foundationDate,
    member_count: o.memberCount,
    phone_number: o.phoneNumber,
    representative_name: o.representativeName,
    reference_date: o.referenceDate,
    provider_org_code: o.providerOrgCode,
    provider_org_name: o.providerOrgName,
  }));
  await replaceDisabilityOrganizations(rows);

  console.log(`[supabase-sync] disabilityorgs 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

/** H2: 장애인체육시설 결과를 Supabase에 반영. 참고용 스냅샷이라 pipeline_runs는
 * 건드리지 않고, 매번 delete-all-then-insert로 통째로 교체한다. */
async function syncDisabilitySports(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedDisabilitySports;

  const rows = data.facilities.map((f) => ({
    facility_name: f.facilityName,
    province_name: f.provinceName,
    district_name: f.districtName,
    operating_body: f.operatingBody,
    phone_number: f.phoneNumber,
    homepage_url: f.homepageUrl,
    has_voucher_program: f.hasVoucherProgram,
    has_bandabi_facility: f.hasBandabiFacility,
  }));
  await replaceDisabilitySportsFacilities(rows);

  console.log(`[supabase-sync] disabilitysports 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

/** I2: 장애인복지관류 시설 결과를 Supabase에 반영. 참고용 스냅샷이라 pipeline_runs는
 * 건드리지 않고, 매번 delete-all-then-insert로 통째로 교체한다. */
async function syncDisabilityWelfare(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedDisabilityWelfare;

  const rows = data.centers.map((c) => ({
    facility_name: c.facilityName,
    facility_type: c.facilityType,
    province_name: c.provinceName,
    road_address: c.roadAddress,
    latitude: c.latitude,
    longitude: c.longitude,
    operating_status: c.operatingStatus,
    establishment_date: c.establishmentDate,
    welfare_facility_id: c.welfareFacilityId,
  }));
  await replaceDisabilityWelfareCenters(rows);

  console.log(`[supabase-sync] disabilitywelfare 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

/** J2: 특수학교현황 결과를 Supabase에 반영. 참고용 스냅샷이라 pipeline_runs는
 * 건드리지 않고, 매번 delete-all-then-insert로 통째로 교체한다. */
async function syncSpecialSchools(filePath: string) {
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as ProcessedSpecialSchools;

  const rows = data.schools.map((s) => ({
    school_name: s.schoolName,
    province_name: s.provinceName,
    foundation_type: s.foundationType,
    disability_domain: s.disabilityDomain,
    principal_name: s.principalName,
    approval_date: s.approvalDate,
    opening_date: s.openingDate,
    principal_office_phone: s.principalOfficePhone,
    admin_office_phone: s.adminOfficePhone,
    teacher_office_phone: s.teacherOfficePhone,
    fax_number: s.faxNumber,
    zip_code: s.zipCode,
    address: s.address,
    homepage_url: s.homepageUrl,
    reference_date: s.referenceDate,
  }));
  await replaceSpecialSchools(rows);

  console.log(`[supabase-sync] specialschools 트랙 동기화 완료 (${data.date}) — ${rows.length}건`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(
      "사용법: tsx scripts/skills/supabase-sync.ts <data/processed/{ads,blog,news,budget,youtube,events,youthfacilities,disabilityorgs,disabilitysports,disabilitywelfare,specialschools}_YYYY-MM-DD.json>"
    );
    process.exit(1);
  }

  const filename = basename(filePath);
  try {
    if (filename.startsWith("blog_")) {
      await syncBlog(filePath);
    } else if (filename.startsWith("news_")) {
      await syncNews(filePath);
    } else if (filename.startsWith("budget_")) {
      await syncBudget(filePath);
    } else if (filename.startsWith("youtube_")) {
      await syncYoutube(filePath);
    } else if (filename.startsWith("events_")) {
      await syncEvents(filePath);
    } else if (filename.startsWith("youthfacilities_")) {
      await syncYouthFacilities(filePath);
    } else if (filename.startsWith("disabilityorgs_")) {
      await syncDisabilityOrgs(filePath);
    } else if (filename.startsWith("disabilitysports_")) {
      await syncDisabilitySports(filePath);
    } else if (filename.startsWith("disabilitywelfare_")) {
      await syncDisabilityWelfare(filePath);
    } else if (filename.startsWith("specialschools_")) {
      await syncSpecialSchools(filePath);
    } else {
      await syncAds(filePath);
    }
  } catch (e) {
    const date = filename.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const independentTrack =
      filename.startsWith("news_") ||
      filename.startsWith("budget_") ||
      filename.startsWith("youtube_") ||
      filename.startsWith("events_") ||
      filename.startsWith("youthfacilities_") ||
      filename.startsWith("disabilityorgs_") ||
      filename.startsWith("disabilitysports_") ||
      filename.startsWith("disabilitywelfare_") ||
      filename.startsWith("specialschools_");
    const track = filename.startsWith("blog_") ? "blog" : independentTrack ? undefined : "ad";
    if (date && track) await recordRun(date, track, "failed", (e as Error).message);
    console.error(`[supabase-sync] 실패: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();
