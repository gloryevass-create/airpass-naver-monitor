import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { z } from "zod";

// data/processed/{ads,blog}_*.json 의 기대 형태 — Supabase에 upsert하기 직전의 정제본.
// calc_basis/source_refs가 항상 채워져야 한다(환각 차단 스펙) — 근거 없는 수치·인용을 막는다.

const CalcBasis = z
  .record(z.string(), z.unknown())
  .refine((b) => Object.keys(b).length > 0, "calc_basis(산출 근거)가 비어 있습니다");

const SourceRefs = z
  .array(z.string().min(1))
  .min(1, "source_refs(인용 출처)가 비어 있습니다 — 근거 없는 리포트는 반려됩니다");

const ReportSchema = z.object({
  report_type: z.enum(["daily", "weekly", "monthly"]),
  title: z.string().min(1),
  content_md: z.string().min(1),
  source_refs: SourceRefs,
});

const AlertSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  category: z.string().min(1),
  message: z.string().min(1),
  evidence_ref: z.string().min(1, "evidence_ref 없이는 알림을 발행할 수 없습니다"),
});

const ProcessedAdsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  keywords: z.array(
    z.object({
      naver_keyword_id: z.string().min(1),
      keyword: z.string().min(1),
      campaign_id: z.string().nullable().optional(),
      adgroup_id: z.string().nullable().optional(),
      status: z.string().min(1),
      is_excluded: z.boolean(),
    })
  ),
  metrics: z.array(
    z.object({
      naver_keyword_id: z.string().min(1),
      monthly_search_pc: z.number().nullable().optional(),
      monthly_search_mobile: z.number().nullable().optional(),
      monthly_click_pc: z.number().nullable().optional(),
      monthly_click_mobile: z.number().nullable().optional(),
      avg_cpc: z.number().nullable().optional(),
      competition_level: z.string().nullable().optional(),
      our_rank: z.number().nullable().optional(),
      spend_7d: z.number().nullable().optional(),
    })
  ),
  spend_estimates: z.array(
    z.object({
      competitor_name: z.string().min(1),
      naver_keyword_id: z.string().min(1),
      estimated_monthly_spend: z.number().nonnegative(),
      calc_basis: CalcBasis,
    })
  ),
  account_stats: z
    .object({
      trend: z.array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          imp_cnt: z.number().nonnegative(),
          clk_cnt: z.number().nonnegative(),
          ccnt: z.number().nonnegative(),
          sales_amt: z.number().nonnegative(),
          ctr: z.number(),
          cpc: z.number(),
        })
      ),
      bizmoney: z.number().nullable(),
    })
    .optional(),
  alerts: z.array(AlertSchema).optional().default([]),
  report: ReportSchema.optional(),
});

const ProcessedBlogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  blog_posts: z.array(
    z.object({
      competitor_name: z.string().min(1),
      url: z.string().url(),
      title: z.string().nullable().optional(),
      published_at: z.string().nullable().optional(),
    })
  ),
  sov: z.array(
    z.object({
      naver_keyword_id: z.string().min(1),
      competitor_name: z.string().min(1),
      share_pct: z.number().min(0).max(100),
    })
  ),
  cadence: z.array(
    z.object({
      competitor_name: z.string().min(1),
      avg_interval_days: z.number().nullable().optional(),
      last_post_at: z.string().nullable().optional(),
      post_count_30d: z.number().int().nonnegative(),
    })
  ),
  alerts: z.array(AlertSchema).optional().default([]),
  report: ReportSchema.optional(),
});

const ProcessedNewsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  articles: z.array(
    z.object({
      keyword: z.string().min(1),
      title: z.string().min(1),
      link: z.string().url(),
      description: z.string().nullable().optional(),
      published_at: z.string().nullable().optional(),
    })
  ),
});

const ProcessedBudgetSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  bids: z.array(
    z.object({
      keyword: z.string().min(1),
      business_type: z.enum(["cnstwk", "servc", "thng"]),
      bid_no: z.string().min(1),
      bid_ord: z.string().min(1),
      title: z.string().min(1),
      notice_inst: z.string().nullable().optional(),
      demand_inst: z.string().nullable().optional(),
      budget_amount: z.number().nullable().optional(),
      presmpt_price: z.number().nullable().optional(),
      notice_date: z.string().nullable().optional(),
      opening_date: z.string().nullable().optional(),
      detail_url: z.string().nullable().optional(),
    })
  ),
});

const ProcessedYoutubeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  channel: z.object({
    subscriber_count: z.number().nonnegative(),
    view_count: z.number().nonnegative(),
    video_count: z.number().nonnegative(),
  }),
  videos: z.array(
    z.object({
      video_id: z.string().min(1),
      title: z.string().min(1),
      published_at: z.string().nullable().optional(),
      view_count: z.number().nonnegative(),
      like_count: z.number().nonnegative(),
      comment_count: z.number().nonnegative(),
      duration_seconds: z.number().nullable().optional(),
      thumbnail_url: z.string().nullable().optional(),
    })
  ),
});

const ProcessedEventsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  events: z.array(
    z.object({
      notionPageId: z.string().min(1),
      title: z.string().min(1),
      dateStart: z.string().min(1),
      dateEnd: z.string().nullable(),
      isDatetime: z.boolean(),
      category: z.string().nullable(),
      tags: z.array(z.string()),
      target: z.string().nullable(),
      location: z.string().nullable(),
      content: z.string().nullable(),
      assignees: z.array(z.string()),
      attendees: z.array(z.string()),
      notionUrl: z.string().min(1),
    })
  ),
});

const ProcessedYouthFacilitiesSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  facilities: z.array(
    z.object({
      facilityName: z.string().min(1),
      representativeName: z.string().nullable(),
      operatingBody: z.string().nullable(),
      operationMode: z.string().nullable(),
      foundationSubject: z.string().nullable(),
      foundationOrgDetail: z.string().nullable(),
      installationType: z.string().nullable(),
      facilityType: z.string().nullable(),
      provinceName: z.string().nullable(),
      districtName: z.string().nullable(),
      roadAddress: z.string().nullable(),
      lotAddress: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      homepageUrl: z.string().nullable(),
      phoneNumber: z.string().nullable(),
      faxNumber: z.string().nullable(),
      email: z.string().nullable(),
      operatingHours: z.string().nullable(),
      holidayInfo: z.string().nullable(),
      hasParking: z.boolean().nullable(),
      capacityCount: z.number().nullable(),
      overnightCapacityCount: z.number().nullable(),
      stayCapacityCount: z.number().nullable(),
      companionCapacityCount: z.number().nullable(),
      firstRegisteredDate: z.string().nullable(),
      referenceDate: z.string().nullable(),
      isExposed: z.boolean().nullable(),
      remarks: z.string().nullable(),
    })
  ),
});

const ProcessedDisabilityOrgsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  organizations: z.array(
    z.object({
      groupName: z.string().min(1),
      provinceName: z.string().nullable(),
      districtName: z.string().nullable(),
      roadAddress: z.string().nullable(),
      lotAddress: z.string().nullable(),
      foundationDate: z.string().nullable(),
      memberCount: z.number().nullable(),
      phoneNumber: z.string().nullable(),
      representativeName: z.string().nullable(),
      referenceDate: z.string().nullable(),
      providerOrgCode: z.string().nullable(),
      providerOrgName: z.string().nullable(),
    })
  ),
});

const ProcessedDisabilitySportsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  facilities: z.array(
    z.object({
      facilityName: z.string().min(1),
      provinceName: z.string().nullable(),
      districtName: z.string().nullable(),
      operatingBody: z.string().nullable(),
      phoneNumber: z.string().nullable(),
      homepageUrl: z.string().nullable(),
      hasVoucherProgram: z.boolean().nullable(),
      hasBandabiFacility: z.boolean().nullable(),
    })
  ),
});

const ProcessedDisabilityWelfareSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  centers: z.array(
    z.object({
      facilityName: z.string().min(1),
      facilityType: z.string().nullable(),
      provinceName: z.string().nullable(),
      roadAddress: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      operatingStatus: z.string().nullable(),
      establishmentDate: z.string().nullable(),
      welfareFacilityId: z.string().nullable(),
    })
  ),
});

const ProcessedSpecialSchoolsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date는 YYYY-MM-DD 형식이어야 합니다"),
  schools: z.array(
    z.object({
      schoolName: z.string().min(1),
      provinceName: z.string().nullable(),
      foundationType: z.string().nullable(),
      disabilityDomain: z.string().nullable(),
      principalName: z.string().nullable(),
      approvalDate: z.string().nullable(),
      openingDate: z.string().nullable(),
      principalOfficePhone: z.string().nullable(),
      adminOfficePhone: z.string().nullable(),
      teacherOfficePhone: z.string().nullable(),
      faxNumber: z.string().nullable(),
      zipCode: z.string().nullable(),
      address: z.string().nullable(),
      homepageUrl: z.string().nullable(),
      referenceDate: z.string().nullable(),
    })
  ),
});

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("사용법: tsx scripts/validate-schema.ts <파일경로>");
    process.exit(2);
  }

  const filename = basename(filePath);
  const schema = filename.startsWith("blog_")
    ? ProcessedBlogSchema
    : filename.startsWith("news_")
      ? ProcessedNewsSchema
      : filename.startsWith("budget_")
        ? ProcessedBudgetSchema
        : filename.startsWith("youtube_")
          ? ProcessedYoutubeSchema
          : filename.startsWith("events_")
            ? ProcessedEventsSchema
            : filename.startsWith("youthfacilities_")
              ? ProcessedYouthFacilitiesSchema
              : filename.startsWith("disabilityorgs_")
                ? ProcessedDisabilityOrgsSchema
                : filename.startsWith("disabilitysports_")
                  ? ProcessedDisabilitySportsSchema
                  : filename.startsWith("disabilitywelfare_")
                    ? ProcessedDisabilityWelfareSchema
                    : filename.startsWith("specialschools_")
                      ? ProcessedSpecialSchoolsSchema
                      : ProcessedAdsSchema;

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.error(`[validate-schema] JSON 파싱 실패: ${(e as Error).message}`);
    process.exit(2);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    console.error(`[validate-schema] 스키마 검증 실패: ${filePath}`);
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(2);
  }

  console.log(`[validate-schema] OK: ${filePath}`);
  process.exit(0);
}

main();
