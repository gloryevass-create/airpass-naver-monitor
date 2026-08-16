---
name: ad-spend-estimator
description: 파워링크 노출 도메인을 경쟁사로 매핑하고(A4), 순위·CPC·가정 클릭률·운영일수로 월 예상 광고비를 산출한다(A5). 산출 근거를 항상 calc_basis에 남긴다.
---

# ad-spend-estimator

## 절차 (A4: 도메인→경쟁사 매핑)

1. `config/competitors.yaml`의 `domain` 필드와 정확히 일치하는 도메인은 자동으로 확정된다.
2. 정확히 일치하지 않는 도메인(서브도메인 포함 관계 등)은 "ambiguous"로,
   전혀 매칭되지 않으면 "unmatched"로 분류되어
   `data/raw/<오늘>/domain_mapping_escalation.json`에 기록된다.
3. **이 파일이 비어 있지 않으면**, Claude 세션(당신)이 다음을 판단한다:
   - 도메인 whois/제목 등 합리적으로 확인 가능한 근거로 특정 경쟁사와 확실히 연결된다고
     판단되면, 그 판단 근거를 알림 메시지(`evidence_ref`)에 남기고 `config/competitors.yaml`에
     도메인을 추가하는 것을 사람에게 제안한다(파일을 직접 고치지 않는다 — 경쟁사 목록은
     사람이 등록한 값이므로).
   - 판단이 애매하면 **추측하지 말고** `severity: "info"` 알림으로 사람에게 확인을 요청한다
     (실패 처리 스펙: 경쟁사 매핑이 모호하면 에스컬레이션).

## 절차 (A5: 광고비 추정)

1. `naver-keyword-sync`, `naver-searchad-fetch`, `naver-serp-scraper`가 먼저 실행되어 있어야 한다.
2. 다음을 실행한다:
   ```
   npx tsx scripts/skills/ad-spend-estimator.ts
   ```
3. 산출식: `estimated_monthly_spend = (월간검색수/30) × 가정 클릭률(순위별) × 예상 CPC × 가정 운영일수`.
   가정값(클릭률 테이블, 운영일수 30일)과 산출식 자체가 `calc_basis`에 그대로 기록된다 —
   근거 없는 숫자는 만들지 않는다(환각 차단 스펙).
4. 결과는 `data/raw/<오늘>/ad_spend_estimates.json`에 저장된다.

## 알려진 미완성 지점

경쟁사 CPC는 비공개이므로 "같은 순위 슬롯은 비슷한 CPC로 낙찰됐을 것"이라는 가정하에 예상 CPC를
프록시로 쓰는데, 이 프록시 조회(`fetchEstimateBid`)는 실제 검색광고 계정의 biz channel 설정이
있어야 정확히 연동할 수 있어 현재는 미연동 상태다. 이 경우 해당 항목은 조용히 0을 채우지 않고
**건너뛰며 경고를 남긴다** — 실 계정 정보를 받으면 `scripts/lib/naver-searchad-client.ts::fetchEstimateBid`
호출부를 완성해야 한다.
