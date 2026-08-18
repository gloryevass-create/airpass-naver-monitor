---
name: disability-welfare-monitor
description: 장애인복지관류 공공시설 현황 수집(Track I, I1~I2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# disability-welfare-monitor

Track I(장애인편의시설, 장애인복지관류 공공시설로 범위를 좁힘)를 I1부터 I2까지 실행한다.
다른 모든 트랙과 무관한 완전히 독립적인 트랙이라 다른 트랙의 성공 여부와 상관없이 항상
실행한다.

## 왜 이 트랙이 있는가, 그리고 왜 원본 API를 그대로 안 쓰는가

원본 API(전국장애인편의시설표준데이터, `getDisConvFaclList`)는 전국 **18만 건**을
반환한다 — "장애인이 이용하는 시설"이 아니라 "장애인편의시설(경사로·승강기 등)이
설치된 건물 전체"라 다세대주택·일반상가까지 포함된다. 매일 전체를 delete-all-then-insert로
재수집하기엔 규모가 비현실적이고, 사용자가 원한 것("장애인복지관 같은 공공시설")과도
성격이 다르다(사용자 확인, 2026-08-18).

그래서 API 자체의 `faclNm`(시설명) 검색 파라미터로 "장애인"이 포함된 결과만 먼저
받아오고(약 330건), 그중 다시 이름에 "복지관"이 포함된 것만 최종 결과로 남긴다(약
109건) — `scripts/lib/disability-welfare-client.ts`의 `SEARCH_KEYWORD`/`NAME_FILTER`
상수 참고. 이 필터링 로직을 바꾸고 싶으면 이 두 상수만 수정하면 된다.

## 실행 순서

1. **I1 — 수집** (`disability-welfare-fetch` 스킬): `npx tsx scripts/skills/disability-welfare-fetch.ts`.
   한국사회보장정보원 "전국장애인편의시설표준데이터"(공식,
   `https://apis.data.go.kr/B554287/DisabledPersonConvenientFacility/getDisConvFaclList`)를
   `pageNo`/`numOfRows` 파라미터로 페이지네이션해 "장애인" 검색 결과 전체를 가져온 뒤
   "복지관" 포함분만 필터링한다. ⚠️ 이 API는 XML만 응답한다(`type=json` 파라미터가
   무시됨, 실측 확인) — 정규식으로 직접 파싱한다. `data/raw/<날짜>/disability_welfare_centers.json`
   (원본)과 `data/processed/disabilitywelfare_<날짜>.json`을 함께 저장한다. 판단 단계가
   없는 순수 수집 데이터라 리포트·알림을 만들지 않는다.
   ⚠️ 이 API는 시도/시군구를 별도 필드로 안 준다 — 도로명주소(`lcMnad`) 첫 토큰을
   시도명으로 대신 쓴다(`extractProvince`).
2. **I2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/disabilitywelfare_<날짜>.json` 실행 →
   `disability_welfare_centers` 테이블에 반영된다. 참고용 스냅샷이라 이력을 누적하지
   않고 매번 delete-all-then-insert로 통째로 교체한다(자연키가 없는 공공데이터).

## 완료 기준

`data/processed/disabilitywelfare_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화
로그에 "disabilitywelfare 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는
건드리지 않는다(다른 독립 트랙과 동일한 이유).
