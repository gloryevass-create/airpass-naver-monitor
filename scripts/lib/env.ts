function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}이(가) 설정되지 않았습니다. .env를 확인하세요.`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get naverCustomerId() {
    return required("NAVER_SEARCHAD_CUSTOMER_ID");
  },
  get naverApiKey() {
    return required("NAVER_SEARCHAD_API_KEY");
  },
  get naverSecretKey() {
    return required("NAVER_SEARCHAD_SECRET_KEY");
  },
  get airpassDomain() {
    return required("AIRPASS_DOMAIN");
  },
  get naverOpenApiClientId() {
    return required("NAVER_OPENAPI_CLIENT_ID");
  },
  get naverOpenApiClientSecret() {
    return required("NAVER_OPENAPI_CLIENT_SECRET");
  },
  get g2bServiceKey() {
    return required("G2B_SERVICE_KEY");
  },
  get youtubeApiKey() {
    return required("YOUTUBE_API_KEY");
  },
  get youtubeChannelHandle() {
    return required("YOUTUBE_CHANNEL_HANDLE");
  },
  get notionToken() {
    return required("NOTION_TOKEN");
  },
  get notionEventsDatabaseId() {
    return required("NOTION_EVENTS_DATABASE_ID");
  },
  get notionBusinessDatabaseId() {
    return required("NOTION_BUSINESS_DATABASE_ID");
  },
  get youthFacilityServiceKey() {
    return required("YOUTH_FACILITY_SERVICE_KEY");
  },
  get disabilityOrgServiceKey() {
    return required("DISABILITY_ORG_SERVICE_KEY");
  },
  get disabilitySportsServiceKey() {
    return required("DISABILITY_SPORTS_SERVICE_KEY");
  },
  get disabilityWelfareServiceKey() {
    return required("DISABILITY_WELFARE_SERVICE_KEY");
  },
  get specialSchoolServiceKey() {
    return required("SPECIAL_SCHOOL_SERVICE_KEY");
  },
  get publicInstitutionServiceKey() {
    return required("PUBLIC_INSTITUTION_SERVICE_KEY");
  },
  get seniorWelfareServiceKey() {
    return required("SENIOR_WELFARE_SERVICE_KEY");
  },
};
