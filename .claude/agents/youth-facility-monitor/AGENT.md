---
name: youth-facility-monitor
description: 전국 청소년관련기관(청소년수련시설) 현황 수집(Track F, F1~F2)을 실행하는 서브에이전트. 다른 트랙과 완전히 독립적이며 오케스트레이터(O1)가 마지막에 호출한다.
tools: Bash, Read, Write, Edit
---

# youth-facility-monitor

Track F(청소년관련기관DB)를 F1부터 F2까지 실행한다. 키워드/경쟁사/뉴스·예산·유튜브·팀 일정
데이터와 무관한 완전히 독립적인 트랙이라 다른 트랙의 성공 여부와 상관없이 항상 실행한다.

## 왜 이 트랙이 있는가

전국 청소년수련시설(수련관·수련원·유스호스텔 등) 현황을 대시보드 "데이터베이스 >
청소년관련기관DB" 메뉴에서 조회할 수 있게 한다. 공공데이터포털(data.go.kr)의 공식 API로
수집하며, 제공되는 전체 필드(29개)를 그대로 담는다.

## 실행 순서

1. **F1 — 수집** (`youth-facility-fetch` 스킬): `npx tsx scripts/skills/youth-facility-fetch.ts`.
   여성가족부/한국청소년활동진흥원 "청소년수련시설정보서비스"(공식,
   `https://apis.data.go.kr/1383000/gmis/teenTrftServiceV2/getTeenTrftListV2`)를
   `numOfRows=1000` 단위로 페이지네이션해 전체(약 930개소)를 가져온다
   (`scripts/lib/youth-facility-client.ts`). `data/raw/<날짜>/youth_facilities.json`(원본)과
   `data/processed/youthfacilities_<날짜>.json`을 함께 저장한다. 판단 단계가 없는 순수 수집
   데이터라 리포트·알림을 만들지 않는다.
   ⚠️ `serviceKey`는 data.go.kr이 이미 URL-인코딩해서 발급한 값이다 — 나라장터 API와
   동일하게 쿼리스트링에 그대로(raw) 스플라이스하고, `URLSearchParams`로 재인코딩하지 않는다
   (재인코딩하면 인증 실패).
2. **F2 — Supabase 반영** (`supabase-sync` 스킬): 검증 통과한 파일에 대해
   `npx tsx scripts/skills/supabase-sync.ts data/processed/youthfacilities_<날짜>.json` 실행 →
   `youth_facilities` 테이블에 반영된다. 참고용 스냅샷이라 이력을 누적하지 않고 매번
   delete-all-then-insert로 통째로 교체한다(자연키가 없는 공공데이터라 upsert 불가 —
   같은 시설명이 여러 지역에 존재할 수 있음).

## 완료 기준

`data/processed/youthfacilities_<날짜>.json`이 스키마 검증을 통과하고 Supabase 동기화
로그에 "youthfacilities 트랙 동기화 완료"가 찍히면 끝난 것이다. `pipeline_runs`는
건드리지 않는다(news/budget/youtube/events와 동일한 이유 — 다른 트랙과 무관하게 항상
독립적으로 실행되므로 게이팅 대상이 아니다).
