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
};
