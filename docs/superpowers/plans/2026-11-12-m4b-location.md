# M4b: 단지 좌표·역·학교 거리 조건·관리비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수도권 단지에 좌표를 붙이고 지하철역·학교 위치를 적재해, 3단계에서 "지하철역까지 직선거리 ○m 이내", "초등학교까지 직선거리 ○m 이내"를 필수·선호·상관없음 조건으로 고를 수 있게 한다. 4단계 목록·상세에는 가장 가까운 역·학교와 거리를 보여주고, 단지 상세를 열면 그 단지의 최근 관리비(K-apt)를 보여준다.

**Architecture:** collector `jobs/geocode.py`가 VWorld 지오코더로 `complexes.location`을 채운다(좌표 없는 단지만, 증분). `jobs/pois.py`는 저장소에 커밋한 수도권 역·학교 CSV(공공데이터포털 표준데이터 파일에서 추림)를 `pois`에 적재한다. `complexes_for_conditions`가 단지마다 가장 가까운 역·초등학교 직선거리를 PostGIS KNN으로 함께 돌려주고, `meets`에 거리 조건 두 개를 더해 3단계 충돌 점검과 4단계 적합도가 같은 판정을 쓴다. 단지 상세는 새 RPC `complex_nearby_pois`로 반경 안의 역·학교 목록을 보여준다. 관리비는 **원칙 3의 예외**로, 웹 서버가 단지 상세를 열 때 K-apt API를 실시간 조회하고 Next `'use cache'`로 단지별 캐시한다(DB에 쓰지 않음).

**Tech Stack:** M4a와 동일 — Next.js 16 App Router, zod v4, vitest, Supabase CLI(로컬)·pgTAP·PostGIS, Python 3.13 + uv + requests + supabase-py + pytest, GitHub Actions.

**Spec:** `CLAUDE.md`(2단계 "역세권 및 학세권", 4단계 "③ 주거 환경 비교 — 교통 접근성·교육 환경", 원칙 1~11), 로드맵 M4b, 브레인스토밍(2026-11-12) Q1 방안 A: 역·학교 거리를 3단계 조건으로 추가하고 4단계에 표시. 관리비 Q 방안 B(사용자 선택, 2026-11-12): 전체 적재 없이 단지 상세를 열 때 실시간 조회 + 캐시, M4c 없이 M4b에서 마무리.

**선행 조건:** `main`(PR #5 머지 후)에서 `feat/m4b-location` 브랜치. GitHub secret `VWORLD_OPENAPI_KEY`와 로컬 `collector/.env`의 `VWORLD_OPENAPI_KEY`는 사용자가 넣었다(2026-11-12 확인, VWorld 지오코더 API 신청).

## 확인한 사실 (2026-11-12, 추측 아님)

- VWorld 지오코더: `GET https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&type=parcel&format=json&refine=true&simple=false&address=<주소>&key=<키>`. 로컬 단지 주소 `서울특별시 강남구 역삼동 653-4번지`로 호출하면 200, `response.status = "OK"`, `response.refined.text = "서울특별시 강남구 역삼동 653-4"`, `response.result.point = {x: "127.038…", y: "37.507…"}`(문자열 경도·위도)이다. 일일 한도는 확인하지 못했다.
- 전국도시철도역사정보표준데이터(15013205, 국가철도공단): **OpenAPI가 없고 XLSX 파일**만 있으며, 연 1회 갱신된다. 역번호·역사명·노선명·위도·경도·운영기관명·도로명주소 항목이 있다고 안내돼 있다.
- 전국초중등학교위치표준데이터(15021148, 한국교육시설안전원): **OpenAPI가 없고 파일**(CSV·XLS·JSON 등)만 있다. 항목은 학교ID, 학교명, 학교급구분, 운영상태, 소재지지번주소, 소재지도로명주소, 위도, 경도, 데이터기준일자 등이다.
- K-apt 관리비: 공용관리비(15057937) 17개 오퍼레이션, 개별사용료(15059469) 10개 오퍼레이션으로 나뉘어 있고, 모두 `kaptCode + searchDate(YYYYMM)`로 조회한다. 개발계정 트래픽은 5,000건/일이다. 단지 코드를 얻으려면 단지 목록(15057332)과 기본 정보(15058453, `AptBasisInfoServiceV5/getAphusDtlInfoV5`) 서비스가 필요하다. 응답 필드는 포털에 공개돼 있지 않다.

## 결정 사항 (승인 필요)

| # | 결정 | 이유 |
|---|------|------|
| M4b-D1 | **관리비는 단지 상세를 열 때만 실시간 조회한다(원칙 3의 예외, 사용자 결정).** 웹 서버(server-only 모듈)가 K-apt API를 호출하고, 결과는 Next `'use cache'`로 캐시한다. 단지 코드 매핑과 기본 정보는 `cacheLife('max')`, 월별 관리비는 `cacheLife('days')`. DB에는 저장하지 않는다. 전체 단지를 미리 적재하지 않으므로 3단계 관리비 조건은 계속 `data_unavailable:mgmt_fee`로 둔다. CLAUDE.md 원칙 3에 이 예외를 한 줄로 적는다. | 전체 적재는 단지당 월 27회 × 약 1만 5천 단지라 개발계정 한도(5,000건/일)로 수 주가 걸린다. 사용자가 실제로 여는 단지만 조회하면 호출이 작다. 웹에는 서비스 롤 키가 없어 공용 DB 캐시 테이블에 쓰면 사용자가 값을 조작할 수 있으므로, 서버 캐시를 쓴다. |
| M4b-D2 | 역·학교는 **표준데이터 파일을 한 번 내려받아 수도권(서울·경기·인천)만 필요한 컬럼으로 추린 CSV를 `collector/data/`에 커밋**하고, `jobs/pois.py`가 이 CSV를 적재한다. 갱신은 파일을 새로 받아 CSV를 바꾸는 수동 작업이다(역 연 1회, 학교는 필요할 때). | 두 데이터 모두 OpenAPI가 없다. 다운로드 링크(`atchFileId`)는 바뀔 수 있어 자동 다운로드는 깨지기 쉽다. 공공데이터라 공개 저장소에 둬도 된다(이용허락 범위는 Task 3 Step 1에서 확인). |
| M4b-D3 | 거리는 **직선거리(m)**만 다룬다. 화면과 TIP에 "직선거리, 실제 도보 거리는 더 깁니다"를 항상 표시한다. 출퇴근 소요시간은 다루지 않는다. | 도보·대중교통 경로 계산은 별도 API와 호출이 필요하다. 원칙 1: 근사치임을 숨기지 않는다. |
| M4b-D4 | 조건은 두 개: `station_distance_max_m`(가장 가까운 지하철·도시철도역까지), `elementary_distance_max_m`(가장 가까운 **운영 중인 초등학교**까지). 범위 100~5,000m, 50m 단위. 중·고등학교는 상세 화면에 표시만 한다. | "역세권·초품아"가 가장 흔한 기준이다. 조건이 늘수록 must 충돌만 늘어난다. |
| M4b-D5 | 거리는 미리 계산해 저장하지 않고, `complexes_for_conditions`가 조회할 때 PostGIS KNN(`<->`, 기존 gist 인덱스)으로 계산한다. 원격에서 1초를 넘으면 그때 저장 컬럼으로 바꾼다. | `pois`를 다시 적재해도 값이 바로 맞고, 갱신용 함수와 컬럼이 늘지 않는다. pois는 약 5천 행이라 KNN 비용이 작다. |
| M4b-D6 | 좌표가 없는 단지(지오코딩 실패)는 거리 조건에서 **판정 불가(`missing`)**로 보고, M4a와 같이 점수에서는 미충족으로 센다. | `meets`의 기존 규칙(null이면 미충족)과 같다. 화면에는 "데이터 없음"으로 보인다. |
| M4b-D7 | 지오코딩은 **지번 주소**(`jibun_address`에서 "번지" 제거)로 `type=parcel`을 먼저 시도하고, 실패하면 `road_address`로 `type=road`를 시도한다. 둘 다 실패하면 좌표 없이 둔다. 한 실행의 호출 상한은 `GEOCODE_MAX_CALLS`(기본 3,000)이고, 좌표가 없는 단지만 대상으로 하는 증분 방식이다. | 일일 한도를 모른다. 증분이라 여러 번 나눠 돌려도 결과가 같다. |

## 용량 추정 (원칙 11)

- `complexes.location`: 이미 있는 컬럼과 gist 인덱스 → 14,905행 × (point 32B + 인덱스 ~60B) ≈ **1.5MB**.
- `pois`: 수도권 지하철·도시철도역 약 1,000행(노선별 행) + 수도권 초·중·고 약 4,500행 ≈ 5,500행 × (힙 ~250B + gist·유니크 인덱스 ~120B) ≈ **2MB**.
- `condition_sets` 컬럼 2개: 무시할 수준.
- 합계 증가 **5MB 미만**. 현재 약 247MB → 250MB < 400MB.
- 검증: Task 7에서 실제 행 수와 `pg_total_relation_size`로 다시 계산한다.

## Global Constraints

- 금액·거리·점수는 SQL(PostGIS) 또는 `lib/calc`로만 계산한다. LLM은 툴 결과의 거리 숫자만 인용하고, 도보 시간으로 바꿔 말하지 않는다.
- 에이전트·웹은 공공 API를 호출하지 않는다. **단 하나의 예외는 관리비(M4b-D1)**이다. `apps/web/lib/kapt/`(첫 줄 `import "server-only"`)만 K-apt를 호출하고, 다른 곳에서는 공공 API를 부르지 않는다. 툴 결과 `as_of`에 `complexes:location`, `pois:subway_station`, `pois:school`을 포함하고, 관리비는 `mgmt_fee:<YYYY-MM>`(부과 월)과 조회 시각을 함께 준다.
- 웹의 `DATA_GO_KR_SERVICE_KEY`는 서버 전용이다. `NEXT_PUBLIC_` 접두사를 붙이지 않고, 클라이언트 컴포넌트에서 import하지 않는다. `apps/web/.env.example`에 이름만 추가하고, 실제 값은 사용자가 `.env.local`과 Vercel env에 넣는다.
- 툴 인자 1단 스키마와 zod 검증. 새 툴 인자는 없다(기존 툴 결과에 필드만 추가).
- 스키마 변경은 `supabase/migrations/*.sql`. `condition_sets` RLS는 그대로 유지. `pois`는 참조 테이블이라 anon·authenticated는 select만 하고, 쓰기는 service role만 한다(기존 정책 확인).
- 새 SQL 함수: `set search_path = ''`. PostGIS 함수·연산자는 `extensions.` 스키마로 한정한다(`extensions.st_distance`, `OPERATOR(extensions.<->)`, `extensions.st_dwithin`). `region_code` 비교는 `::char(10)`. service role 전용 함수는 `security definer`이고 execute는 `service_role`에만 준다.
- 비밀값: VWorld 키는 URL 쿼리(`key=`)에 들어간다. 예외와 로그에 URL이 남지 않게 하고, 원본 예외는 `raise … from None`으로 버린다. 남기는 것은 단지 id, 상태코드, 예외 이름뿐이다. 워크플로에서는 `VWORLD_OPENAPI_KEY`를 그 값을 쓰는 run 단계의 env에만 넣는다.
- 단위: 거리 m(정수, 반올림), 좌표 WGS84(EPSG:4326, 경도 x·위도 y), 날짜 KST `YYYY-MM-DD`.
- 좌표 검증: 경도 124~132, 위도 33~39 밖이면 버린다.
- 로컬 실행·테스트는 메모리 규칙을 따른다. `.env.local`과 `collector/.env`는 수정·출력하지 않고, 로컬 Supabase는 `http://[::1]:54321`을 쓰며, env는 명령에 직접 넘긴다.
- Next.js 16 코드를 쓰기 전 `apps/web/node_modules/next/dist/docs/01-app/`의 해당 문서를 읽는다.

## Review Focus

1. **좌표 없는 단지 + 거리 must 조건** — 지오코딩이 덜 된 지역에서 거리 must를 걸면 후보가 전부 빠진다. 거리 조건이 켜져 있고 희망 지역 단지 중 좌표가 없는 단지가 있으면 `location_partial` notice로 "좌표가 없는 단지 N개는 거리 조건을 판단하지 못했습니다"를 보여준다. (Task 4 `location_partial notice when some rows lack location`)
2. **pois가 비어 있음**(pois job을 아직 안 돌린 원격) — 모든 단지의 거리가 null이 된다. 충돌로 처리하지 않고 `no_poi_data` notice를 보여준다. (Task 4 `no_poi_data when pois empty`)
3. **같은 역이 노선마다 행으로 들어감**(환승역) — 가장 가까운 역 이름이 노선별로 중복돼 보이면 안 된다. 상세 목록은 역 이름으로 묶고 노선을 합쳐 보여준다. (Task 1 pgTAP `nearby merges transfer station lines`)
4. **관리비를 못 찾음**(K-apt 미등록 단지, 단지 코드 매칭 실패, 최근 2개월 모두 부과 내역 없음, API 오류·한도 초과) — 상세 화면 전체가 실패하면 안 된다. 관리비 칸만 사유와 함께 "관리비 정보를 찾지 못했습니다"로 바뀐다. API 오류는 캐시하지 않는다(다음에 다시 시도). (Task 6 `fee failure does not break detail`, `errors are not cached`)
5. **지오코더가 엉뚱한 곳을 돌려줌**(동명 지번, 정제 실패) — 응답 `refined.structure.level4LC` 앞 10자리(법정동코드)가 단지 `region_code`와 다르면 버린다. (Task 2 `test_rejects_point_in_other_dong`)
6. **지오코딩 일부 실패·한도 초과** — 나머지는 적재하고, 실패가 호출의 1%를 넘으면 비정상 종료하고 freshness를 갱신하지 않는다(M3 규칙과 같음). 호출 상한에 걸리면 정상 종료하고 남은 개수를 출력한다. (Task 2 `test_stops_at_max_calls`, `test_failure_rate_skips_freshness`)

---

## File Structure

```
supabase/migrations/
  20261112000000_m4b_location.sql      condition_sets 컬럼, complexes_for_conditions 재정의(+거리), complex_nearby_pois,
                                       collector용 complexes_missing_location / set_complex_locations
  20261112000100_m4b_seed_tips.sql     3단계 TIP 1개(직선거리)
supabase/tests/database/location.test.sql
supabase/tests/database/complexes.test.sql   반환 컬럼 변경 반영
packages/db-types/database.types.ts           재생성
collector/
  jobs/geocode.py (+ tests/test_geocode.py, tests/fixtures/vworld_ok.json, vworld_not_found.json)
  jobs/pois.py (+ tests/test_pois.py)
  data/subway_stations.csv, data/schools.csv, data/README.md   출처·기준일·추린 방법
  main.py                                   JOBS에 geocode, pois
.github/workflows/collect.yml               geocode 단계(주 1회 + 수동), pois 단계(수동만)
.env.example                                VWORLD_OPENAPI_KEY
apps/web/
  lib/calc/conditions.ts, fit.ts (+tests)   거리 조건 2개
  lib/agent/tools/condition-context.ts, search-complexes.ts, get-complex-detail.ts (+tests), prompt.ts
  app/plans/[planId]/stage/3/page.tsx, actions.ts, actions.test.ts
  app/plans/[planId]/_components/ConditionCheckCard.tsx
  app/plans/[planId]/stage/4/_components/CandidateList.tsx, ComplexDetail.tsx
  lib/kapt/client.ts, lib/kapt/mgmt-fee.ts (+ tests, fixtures)   K-apt 실시간 조회와 캐시(server-only)
  lib/calc/mgmt-fee.ts (+ test)             관리비 합계·㎡당 계산(순수 함수)
  .env.example                              DATA_GO_KR_SERVICE_KEY(서버 전용)
claude.md                                   원칙 3 예외 한 줄
docs/superpowers/plans/2026-11-03-roadmap.md, docs/screenshots/m4b/
```

---

### Task 1: DB — 거리 조건 컬럼, 거리 포함 조회, 주변 시설 RPC, collector용 함수

**Files:** Create `supabase/migrations/20261112000000_m4b_location.sql`, `supabase/tests/database/location.test.sql`; Modify `supabase/tests/database/complexes.test.sql`, `packages/db-types/database.types.ts`

**Interfaces (Produces):**
- `condition_sets` 컬럼: `station_distance_max_m integer check (between 100 and 5000)`, `elementary_distance_max_m integer check (between 100 and 5000)`.
- `complexes_for_conditions(region_codes text[], area_min numeric default null, area_max numeric default null, months int default 12)`. 기존 반환 컬럼 뒤에 `nearest_station_name text, nearest_station_m int, nearest_elementary_m int`를 추가한다. 단지 `location`이 null이거나 해당 category의 pois가 없으면 null이다. 반환 타입이 바뀌므로 `drop function` 후 다시 만들고 grant도 다시 준다. 나머지 동작(검증, 3,001행, 중위가 규칙)은 그대로다. 역은 `category = 'subway_station'`, 초등학교는 `category = 'elementary_school'`이다.
- `complex_nearby_pois(p_complex_id bigint, radius_m int default 1000) returns table (category text, name text, lines text[], distance_m int)`: 반경 안의 `subway_station`·`elementary_school`·`middle_school`·`high_school`. 역은 `name`으로 묶어 노선을 `lines`에 합치고(거리는 최솟값), 학교의 `lines`는 null이다. 정렬은 category → distance_m이고, category마다 최대 5개다. `radius_m`이 100~3000 밖이면 `22023`. 단지 좌표가 없으면 0행. stable, invoker, anon·authenticated execute.
- `complexes_missing_location(sgg text) returns table (id bigint, region_code text, jibun_address text, road_address text)`: 그 시군구에서 `location is null`인 단지, id 순. security definer, service_role만.
- `set_complex_locations(ids bigint[], lons float8[], lats float8[]) returns int`: 길이가 다르면 `22023`. `location = st_setsrid(st_makepoint(lon, lat), 4326)::geography`로 갱신하고 갱신 행 수를 반환한다. security definer, service_role만.

- [ ] **Step 1: 실패하는 pgTAP** — `location.test.sql`(`complex_detail.test.sql` 시드 형식, setup 첫 줄에 `delete from public.candidates;`).
  - 시드: 단지 A는 좌표 (127.0, 37.5), B는 좌표 null. pois: 역 '가역'은 노선 2행(2호선, 신분당선, A에서 약 300m), 역 '나역'(약 900m), 초등학교 '다초'(약 400m), 중학교 '라중'(약 600m), 운영 중이 아닌 학교는 시드에서 넣지 않는다(pois job이 거른다). 좌표는 위도 37.5에서 경도 0.001° ≈ 88m로 잡는다.
  - `complexes_for_conditions`: A의 `nearest_station_name = '가역'`, `nearest_station_m`이 250~350, `nearest_elementary_m`이 350~450. B의 세 값은 모두 null.
  - `nearby merges transfer station lines`: `complex_nearby_pois(A)`의 역 행은 '가역' 1행이고 `lines`는 노선 2개를 담는다. '나역'도 포함된다(1000m 이내).
  - `complex_nearby_pois(A, 500)`에는 '나역'이 없다. `radius_m 50` → `throws_ok '22023'`.
  - `set_complex_locations(array[B], array[127.001], array[37.5])` → 1을 반환하고 B의 거리가 채워진다. 길이가 다르면 `22023`.
  - `anon`이 `set_complex_locations`·`complexes_missing_location`을 실행하면 권한 오류가 난다.
  - `condition_sets.station_distance_max_m = 50`을 insert하면 check 위반.
- [ ] **Step 2: 실패 확인** — Run: `supabase test db` / Expected: `location.test.sql` FAIL.
- [ ] **Step 3: 마이그레이션 작성** — 위 인터페이스대로 쓴다. KNN은 `left join lateral (select p.name, extensions.st_distance(p.location, c.location) d from public.pois p where p.category = '…' order by p.location OPERATOR(extensions.<->) c.location limit 1)`. `complexes.test.sql`이 새 반환 컬럼 때문에 깨지면 단언을 고친다(기존 의미는 바꾸지 않는다).
- [ ] **Step 4: 통과 확인** — Run: `supabase db reset && supabase test db` / Expected: 전체 PASS.
- [ ] **Step 5: 타입 재생성** — Run: `supabase gen types typescript --local > packages/db-types/database.types.ts && grep -c "complex_nearby_pois\|station_distance_max_m" packages/db-types/database.types.ts` / Expected: 2 이상. `pnpm --filter web typecheck`가 깨지면 새 필드 때문이니 Task 4에서 고친다고 report에 적는다(이 태스크에서 웹 코드는 고치지 않는다).
- [ ] **Step 6: Commit** — `git commit -m "feat(db): 단지 좌표 기반 역·초등학교 거리 조회와 주변 시설 RPC"`

---

### Task 2: collector — VWorld 지오코딩 job

**Files:** Create `collector/jobs/geocode.py`, `collector/tests/test_geocode.py`, `collector/tests/fixtures/vworld_ok.json`, `vworld_not_found.json`; Modify `collector/main.py`, `.env.example`

**Interfaces:**
- Consumes: RPC `complexes_missing_location(sgg)`, `set_complex_locations(ids, lons, lats)`(Task 1). `parse_sigungu`, `kst_today`, 시군구 목록 함수(`jobs.transactions` 또는 `jobs.complexes`에 있는 것을 import해 재사용).
- Produces: `run()`, `to_query(row: dict) -> list[tuple[str, str]]`(시도할 `(type, address)` 목록: `("parcel", jibun_address에서 "번지" 제거)`, 이어서 `road_address`가 있으면 `("road", road_address)`), `parse_point(resp: dict, region_code: str) -> tuple[float, float] | None`.
- `DATASET = "complexes:location"`, `SOURCE = "VWorld 지오코더 API 2.0 (getcoord)"`. env: `VWORLD_OPENAPI_KEY`, `GEOCODE_SGG`(쉼표로 구분한 5자리, 비우면 전체), `GEOCODE_MAX_CALLS`(기본 3000).

- [ ] **Step 1: 실제 응답 fixture 캡처** — 로컬 단지 주소 1개(정상)와 존재하지 않는 지번 1개로 지오코더를 호출해 `response`에서 `input` 키를 지운 JSON을 fixture로 저장한다(키가 들어 있지 않은지 `grep -c key=` 0으로 확인). NOT_FOUND의 실제 `status` 값과 오류 응답 형태(`status: "ERROR"`, `error.code`)도 기록한다. 정상 응답 형태는 위 "확인한 사실"과 같은지 대조한다.
- [ ] **Step 2: 실패하는 테스트** — `tests/test_geocode.py`.
  - `test_to_query_strips_beonji` — `"서울특별시 강남구 역삼동 653-4번지"` → 첫 항목 `("parcel", "서울특별시 강남구 역삼동 653-4")`. road_address가 있으면 둘째 항목은 `("road", …)`, 없으면 1개.
  - `test_parse_point_ok` — `vworld_ok.json`, region_code가 `level4LC[:10]`과 같으면 `(127.038…, 37.507…)` float.
  - `test_rejects_point_in_other_dong` — Review Focus 4: region_code가 다르면 None.
  - `test_rejects_out_of_korea` — x=0, y=0이면 None.
  - `test_not_found_returns_none` — `vworld_not_found.json` → None.
  - `test_stops_at_max_calls` — Review Focus 5: 대상 10개, `GEOCODE_MAX_CALLS=3` → 호출 3회, 정상 종료, 남은 개수를 출력.
  - `test_failure_rate_skips_freshness` — 요청 예외가 대상의 1%를 넘으면 `SystemExit`, `mark_freshness` 미호출, 예외 메시지에 키 문자열이 없다.
  - `test_batches_updates` — 성공 450건이면 `set_complex_locations`를 200·200·50으로 호출한다.
- [ ] **Step 3: 실패 확인** — Run: `cd collector && uv run pytest tests/test_geocode.py -v` / Expected: FAIL(`ModuleNotFoundError`).
- [ ] **Step 4: 구현** — `requests.get(..., timeout=10)`. 5xx·연결 오류는 1·2초 간격으로 2회 재시도한다(M3 complexes 패턴). 단지 하나에 `to_query` 항목을 순서대로 시도하고 첫 성공에서 멈춘다(호출 수는 시도마다 센다). 실패·미발견 건수를 출력하고 note에 넣는다. 끝까지 돌면 `mark_freshness(DATASET, note)`를 호출한다. 상한에 걸려 멈춘 경우에도 그때까지 적재한 좌표 기준으로 freshness를 갱신한다(이번 실행 결과는 유효하다). `main.py` JOBS에 `"geocode": "jobs.geocode"`를 추가하고, `.env.example`에 `VWORLD_OPENAPI_KEY=`를 추가한다.
- [ ] **Step 5: 통과 확인** — Run: `cd collector && uv run pytest -v` / Expected: 전체 PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(collector): VWorld 지오코더로 단지 좌표 증분 수집"`

---

### Task 3: collector — 역·학교 CSV와 pois job

**Files:** Create `collector/data/subway_stations.csv`, `collector/data/schools.csv`, `collector/data/README.md`, `collector/jobs/pois.py`, `collector/tests/test_pois.py`; Modify `collector/main.py`

**Interfaces:**
- CSV 컬럼(UTF-8, 헤더 고정):
  - `subway_stations.csv`: `station_id,name,line,operator,lat,lon,road_address,data_date`
  - `schools.csv`: `school_id,name,level,status,lat,lon,jibun_address,data_date` (`level`은 원본 학교급구분 값 그대로)
- Produces: `run()`, `station_rows(rows: list[dict]) -> list[dict]`, `school_rows(rows: list[dict]) -> list[dict]`. pois 행은 `{category, name, location: "SRID=4326;POINT(lon lat)", attrs, data_as_of, source, source_id}`이다. 역의 attrs는 `{"line": …, "operator": …}`, 학교의 attrs는 `{"level": …}`. `region_code`는 null로 둔다.
- 데이터셋: `pois:subway_station`, `pois:school`. freshness `as_of`는 CSV의 `data_date` 최댓값이다.

- [ ] **Step 1: 원본 파일 받기와 CSV 만들기** — 공공데이터포털 표준데이터 페이지(15013205 역사, 15021148 학교)에서 최신 파일을 내려받는다(로그인이 필요해 받지 못하면 멈추고 사용자에게 파일을 요청한다). 원본은 커밋하지 않는다. 원본의 실제 컬럼명·학교급구분 값·운영상태 값·좌표 형식을 확인하고, 일회성 스크립트(커밋하지 않음)로 다음과 같이 추린다.
  - 역: 운영기관이나 도로명주소가 서울·경기·인천인 행만, 위 컬럼만 남긴다.
  - 학교: 주소가 서울·경기·인천이고 학교급구분이 초·중·고인 행만 남긴다.
  `data/README.md`에 데이터 id, 기관, 원본 파일명, 데이터 기준일, 받은 날짜, 추린 규칙, 이용허락 범위(페이지 표기 그대로), 행 수를 적는다. 용량은 두 파일 합쳐 2MB 이하이고, 넘으면 멈추고 알린다.
- [ ] **Step 2: 실패하는 테스트** — `tests/test_pois.py`(작은 dict 리스트로).
  - `test_station_rows` — 정상 행 → `category = "subway_station"`, `source_id = station_id`, location EWKT가 `POINT(lon lat)` 순서.
  - `test_school_levels_mapped` — 원본 `level` 값(Step 1에서 확인한 실제 문자열)이 초·중·고면 각각 `elementary_school`·`middle_school`·`high_school`. 그 밖의 값은 버린다.
  - `test_closed_school_skipped` — 운영상태가 운영이 아니면(Step 1에서 확인한 값) 버린다.
  - `test_bad_coordinates_skipped` — 빈 좌표나 범위 밖 좌표는 버리고 건수를 센다.
  - `test_run_deletes_missing` — DB에는 있고 CSV에는 없는 `(category, source, source_id)`를 삭제한다(`regulated_areas.keys_to_delete` 패턴).
- [ ] **Step 3: 실패 확인** — Run: `cd collector && uv run pytest tests/test_pois.py -v` / Expected: FAIL.
- [ ] **Step 4: 구현** — `csv.DictReader`로 읽고 `upsert_rows("pois", rows, on_conflict="category,source,source_id")`(기존 `lib/db` 시그니처에 맞춤), 사라진 행을 삭제하고, 데이터셋별 `mark_freshness`를 호출한다. `main.py` JOBS에 `"pois": "jobs.pois"`를 추가한다. API 호출이 없으니 키도 필요 없다.
- [ ] **Step 5: 통과 확인** — Run: `cd collector && uv run pytest -v` / Expected: 전체 PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(collector): 수도권 지하철역·초중고 위치 적재"`

---

### Task 4: 계산·로더·툴 — 거리 조건 두 개

**Files:** Modify `apps/web/lib/calc/conditions.ts`, `fit.ts` (+ tests), `lib/agent/tools/condition-context.ts`, `search-complexes.ts`, `get-complex-detail.ts`, `test-fixtures.ts` (+ tests), `lib/agent/prompt.ts`

**Interfaces:**
- `ConditionKey`에 `"station_distance_max" | "elementary_distance_max"`를 추가하고, `KEYS`에도 넣는다.
- `Conditions`에 `station_distance_max_m: number | null; elementary_distance_max_m: number | null`을 추가한다.
- `ComplexRow`에 `nearest_station_name: string | null; nearest_station_m: number | null; nearest_elementary_m: number | null`을 추가한다.
- `isSet`: 두 키는 각각 `*_max_m !== null`일 때 켜진다. `meets`: `x.nearest_station_m !== null && x.nearest_station_m <= c.station_distance_max_m!`(초등학교도 같은 방식). `fit.ts` missing 판정 값: `station_distance_max → nearest_station_m`, `elementary_distance_max → nearest_elementary_m`.
- `Notice`에 `"location_partial" | "no_poi_data"`를 추가한다. `findConflicts`가 계산한다.
  - `no_poi_data`: 거리 조건이 하나라도 켜져 있고, 행이 있는데 모든 행에서 `nearest_station_m`와 `nearest_elementary_m`이 null인 경우.
  - `location_partial`: 거리 조건이 켜져 있고, 일부 행만 두 값이 모두 null인 경우.
- 로더는 `condition_sets`의 두 컬럼을 `Conditions`에 매핑하고, `stage3Empty`에도 넣는다. `as_of`에는 freshness `complexes:location`, `pois:subway_station`, `pois:school`을 추가한다(없는 데이터셋은 키를 생략).
- `search_complexes`: `PASSTHROUGH`에 `location_partial`·`no_poi_data`를 추가한다. 항상 붙이던 `no_location_data`는 **모든 행에 거리 값이 없을 때만** 붙인다.
- `get_complex_detail`: `data.nearby: { category, name, lines, distance_m }[]`(`complex_nearby_pois(id, 1000)`)를 추가한다. `complex`에는 `nearest_station_name`, `nearest_station_m`, `nearest_elementary_m`(같은 동 행에서)을 추가한다. `no_location_data` notice는 그 단지의 좌표가 없을 때만 붙인다(`nearby`가 비고 세 값이 모두 null).

- [ ] **Step 1: 실패하는 테스트**
  - `conditions.test.ts`: `distance musts filter and leave-one-out` — 역 600m 단지와 역 1,500m 단지에서 `station_distance_max_m 1000` must이면 600m 단지만 통과하고, 초등학교 must와 함께 0개가 되면 `blocking`에 두 키 중 원인 키가 들어간다.
  - `conditions.test.ts`: `location_partial notice when some rows lack location` — Review Focus 1.
  - `conditions.test.ts`: `no_poi_data when pois empty` — Review Focus 2. 이때 충돌(`no_match_for_musts`)은 만들지 않는다. 거리 must가 켜져 있으면 판정할 데이터가 없으므로, 그 키를 must 판정에서 뺀다.
  - `fit.test.ts`: `distance missing when no location` — 좌표 null 단지에서 `missing`에 `station_distance_max`가 들어간다.
  - `get-complex-detail.test.ts`: `returns nearby and drops no_location_data when located`.
  - `search-complexes.test.ts`: `no_location_data only when no row has distance`.
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test` / Expected: 새 테스트 FAIL.
- [ ] **Step 3: 구현** — 위 인터페이스대로. `no_poi_data`일 때는 거리 키를 `active`에서 빼는 처리를 `findConflicts`와 `rankComplexes`가 공유해야 한다. `activeKeys(c, rows?)`처럼 같은 함수를 쓰고, 두 곳에 같은 로직을 따로 두지 않는다. `prompt.ts` 규칙: "역·초등학교 거리는 직선거리(m)이며 실제 도보 거리는 더 깁니다. 도보 시간으로 바꿔 말하지 마세요. location_partial·no_poi_data notice가 있으면 거리 조건을 일부 또는 전부 판단하지 못했다고 말하세요." 기존 "교통·학교·생활 인프라 데이터는 아직 없습니다(no_location_data)" 줄은 "no_location_data가 있으면 그 단지의 좌표가 없어 교통·학교 정보를 제공하지 못한다고 말하세요"로 바꾼다.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test && pnpm --filter web typecheck` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(calc): 역·초등학교 직선거리 조건을 3·4단계 판정에 추가"`

---

### Task 5: 화면 — 3단계 입력, 4단계 표시, TIP

**Files:** Modify `app/plans/[planId]/stage/3/page.tsx`, `stage/3/actions.ts`, `stage/3/actions.test.ts`, `_components/ConditionCheckCard.tsx`, `stage/4/_components/CandidateList.tsx`, `stage/4/_components/ComplexDetail.tsx`; Create `supabase/migrations/20261112000100_m4b_seed_tips.sql`; Modify `supabase/tests/database/tips.test.sql`

- 3단계 "② 단지 조건" 아래에 "④ 교통·교육 조건(직선거리)" 묶음을 만든다. 입력은 `station_distance_max_m`("지하철역까지 직선거리 (m, 이내)")과 `elementary_distance_max_m`("초등학교까지 직선거리 (m, 이내)")이고, `min 100 max 5000 step 50`과 우선순위 라디오를 붙인다(키 `station_distance_max`, `elementary_distance_max`). zod: `z.coerce.number().int().min(100).max(5000).multipleOf(50)`, 빈 값은 null(기존 숫자 필드와 같은 전처리). `PRIORITY_KEYS`에 두 키를 추가한다.
- `CONDITION_LABELS`: `station_distance_max: "지하철역 거리"`, `elementary_distance_max: "초등학교 거리"`. `NOTICES`: `location_partial: "좌표가 없는 단지는 거리 조건을 판단하지 못했습니다."`, `no_poi_data: "역·학교 위치 데이터가 아직 없어 거리 조건을 점검하지 못했습니다."`. `DATASETS`: `complexes:location: "단지 좌표"`, `pois:subway_station: "지하철역 위치"`, `pois:school: "학교 위치"`.
- 4단계 목록 행: 기존 줄 아래에 `역 {nearest_station_name} 직선 {m}m · 초등학교 직선 {m}m`을 표시한다(값이 없으면 "위치 정보 없음").
- 4단계 상세: "교통·학교·생활 인프라: 데이터 준비 중" 줄을 "주변 시설 (직선거리 1km 이내)" 표로 바꾼다. 열은 구분(지하철역/초등학교/중학교/고등학교), 이름, 노선(역만), 직선거리이고, 표 아래에 "직선거리이며 실제 도보 거리는 더 깁니다."를 둔다. `nearby`가 비어 있으면 "좌표 정보가 없어 주변 시설을 표시하지 못했습니다." 정비사업 줄은 그대로 둔다.
- TIP 1개(`stage = 3`, slug `straight-line-distance`, field_key `station_distance_max_m`, title "직선거리와 실제 거리", body: 직선거리는 지도 위 두 점 사이의 최단 거리이고, 실제 걷는 길은 도로·횡단보도·출입구 위치 때문에 보통 더 길다는 내용. caution: 역 출입구와 단지 출입구 위치에 따라 체감 거리가 크게 다르니 지도 앱 도보 경로로 확인하라는 안내. source null). `elementary_distance_max_m` 입력 옆에도 같은 TIP을 보이게 `TipPanel`의 fieldKey를 맞추거나, 같은 내용으로 slug `straight-line-distance-school`을 하나 더 넣는다. 둘 중 더 단순한 쪽을 고르고, 단언 개수를 그에 맞춘다.

- [ ] **Step 1: 실패하는 테스트** — `stage/3/actions.test.ts`: `distance fields parse` — `"800"` → 800, `""` → null, `"75"`·`"6000"` → fieldErrors. `tips.test.sql`: 3단계 TIP 개수 +1(또는 +2) 단언. Run: `pnpm --filter web test stage/3 && supabase test db` / Expected: FAIL.
- [ ] **Step 2: 구현** — 위 구성대로.
- [ ] **Step 3: 통과와 정적 검사** — Run: `supabase db reset && supabase test db && pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint` / Expected: 전부 통과.
- [ ] **Step 4: Commit** — `git commit -m "feat(stage3·4): 역·초등학교 거리 조건 입력과 주변 시설 표시"`

---

### Task 6: 관리비 — 단지 상세에서 실시간 조회 + 캐시 (원칙 3 예외)

**Files:** Create `apps/web/lib/kapt/client.ts`, `apps/web/lib/kapt/mgmt-fee.ts`, `apps/web/lib/kapt/mgmt-fee.test.ts`, `apps/web/lib/kapt/fixtures/*.json`, `apps/web/lib/calc/mgmt-fee.ts`, `apps/web/lib/calc/mgmt-fee.test.ts`; Modify `apps/web/lib/agent/tools/get-complex-detail.ts` (+test), `app/plans/[planId]/stage/4/_components/ComplexDetail.tsx`, `apps/web/.env.example`, `claude.md`, `lib/agent/prompt.ts`

**Interfaces (Produces):**
- `lib/calc/mgmt-fee.ts`(순수): `summarizeMgmtFee(items: { group: "common" | "individual"; key: string; amount: number }[], chargeAreaM2: number | null): { common: number; individual: number; total: number; per_m2: number | null }`. `per_m2 = round(total / chargeAreaM2)`이고, 면적이 null이거나 0이면 null이다.
- `lib/kapt/mgmt-fee.ts`(server-only): `getMgmtFee(complex: { id: number; name: string; region_code: string; jibun_address: string | null }): Promise<MgmtFeeResult>`.
  - `MgmtFeeResult = { status: "ok"; kapt_code: string; kapt_name: string; month: string /*YYYY-MM*/; common: number; individual: number; total: number; per_m2: number | null; fetched_at: string } | { status: "not_found"; reason: "no_kapt_match" | "no_recent_fee" } | { status: "error" }`.
  - `getMgmtFee`는 캐시하지 않는 얇은 함수다. 오류를 캐시하지 않도록, 캐시는 성공·미발견 결과를 내는 아래 내부 함수에만 건다.
- `lib/kapt/client.ts`(server-only): `kaptGet(path: string, params: Record<string, string>): Promise<unknown>`. 베이스는 `https://apis.data.go.kr/1613000/`, 키는 `process.env.DATA_GO_KR_SERVICE_KEY`, timeout은 8초(AbortSignal). 실패하면 `KaptError(status: number | null, name: string)`를 던지고, 메시지에 URL·키를 넣지 않는다.
- 캐시 단위(`'use cache'` + `cacheLife` + `cacheTag`): `kaptListByDong(bjdCode)`와 `kaptBasis(kaptCode)`는 `'max'`, `kaptMonthlyFee(kaptCode, ym)`는 `'days'`. API 오류는 throw로 끝나므로 캐시에 남지 않는다.
- 매칭: 법정동(`region_code`) 단지 목록에서 이름을 정규화한다(공백·"아파트"·괄호 제거). 정확히 하나가 일치하면 그 단지를 쓴다. 0개나 여러 개면 후보(최대 5개)의 기본 정보에서 지번을 비교해 하나로 정한다. 그래도 못 정하면 `no_kapt_match`. 이미 `complexes.kapt_code`가 있으면 그 값을 쓴다(지금은 비어 있음, DB에 쓰지 않음).
- 월: 오늘(KST) 기준 전월을 먼저 조회하고, 부과 내역이 없으면 전전월을 조회한다. 둘 다 없으면 `no_recent_fee`.
- 관리비 합계: 공용관리비(`AptCmnuseManageCostServiceV3`) 17개 오퍼레이션과 개별사용료(`AptIndvdlzManageCostServiceV3`) 10개 오퍼레이션을 `Promise.all`로 병렬 호출해 금액 필드를 모은다. 정확한 오퍼레이션 경로와 금액 필드명은 Step 1 fixture로 확정한다.
- `get_complex_detail`: `data.mgmt_fee: MgmtFeeResult`를 추가한다. 툴과 화면이 같은 캐시를 공유하므로 같은 단지는 다시 호출하지 않는다.

- [ ] **Step 1: 실제 응답 fixture** — 로컬 강남구 단지 1개로 다음을 차례로 호출하고(키는 env로만 넘기고 출력하지 않는다), 키를 뺀 응답을 `lib/kapt/fixtures/`에 저장한다.
  1. 단지 목록 서비스(15057332 `AptListService4`)의 법정동 오퍼레이션 — 정확한 경로는 포털 상세나 실제 호출로 확인한다.
  2. 기본 정보(`AptBasisInfoServiceV5/getAphusDtlInfoV5`).
  3. 공용관리비 오퍼레이션 1개와 개별사용료 오퍼레이션 1개.
  확인할 것: 응답 형식(JSON 가능 여부, `_type=json`), 금액 필드명, 관리비 부과면적 필드가 기본 정보에 있는지, 부과 내역이 없는 달의 응답 모양, 27개 오퍼레이션의 실제 경로 목록(포털 상세 페이지에서). **활용신청이 반영되지 않아 403이나 `SERVICE_KEY_IS_NOT_REGISTERED`가 나면 멈추고 사용자에게 알린다.** 오퍼레이션 경로와 필드는 fixture로만 정하고, 추측해서 쓰지 않는다.
- [ ] **Step 2: 실패하는 테스트**
  - `lib/calc/mgmt-fee.test.ts`: `sums groups and per m2`(공용 3건 + 개별 2건의 합, 면적 100 → per_m2), `per_m2 null when area missing`.
  - `lib/kapt/mgmt-fee.test.ts`(`fetch`를 vi.stubGlobal로 fixture에 연결): `matches by normalized name`, `falls back to jibun via basis info`, `no_kapt_match`, `uses previous-previous month when last month empty`, `fee failure does not break detail`(fetch reject → `status: "error"`, throw하지 않음), `errors are not cached`(첫 호출 실패 후 두 번째 호출이 fetch를 다시 부른다 — 캐시 함수는 테스트에서 `'use cache'` 없이 실행되므로, 오류 경로가 캐시 함수 밖에서 잡히는지를 구조로 확인한다), `error message has no key`.
  - `get-complex-detail.test.ts`: `includes mgmt_fee` — `getMgmtFee`를 vi.mock해 ok 결과가 `data.mgmt_fee`에 그대로 들어간다.
- [ ] **Step 3: 실패 확인** — Run: `pnpm --filter web test kapt mgmt-fee get-complex-detail` / Expected: FAIL.
- [ ] **Step 4: 구현** — 위 인터페이스대로. 캐시 API 사용법은 `apps/web/node_modules/next/dist/docs/01-app/`의 `use cache`, `cacheLife`, `cacheTag` 문서를 먼저 읽고 따른다. `ComplexDetail`에는 "관리비 (K-apt, {YYYY-MM} 부과분)" 칸을 넣는다: 총액 `formatWon`, ㎡당(있으면), 공용·개별 합계, 단위 문구(단지 전체 부과 합계인지 세대 평균인지 Step 1 fixture로 확인해 정확히 표기), 조회 시각. `not_found`·`error`면 사유 문구로 대신한다. `prompt.ts` 규칙: "관리비는 get_complex_detail.data.mgmt_fee만 인용하고, 부과 월과 단위를 함께 말하세요. status가 ok가 아니면 관리비 정보를 찾지 못했다고 말하세요." `apps/web/.env.example`에 `# 서버 전용. 관리비(K-apt) 실시간 조회용` + `DATA_GO_KR_SERVICE_KEY=`를 추가한다. `claude.md` 원칙 3 끝에 "예외: 관리비(K-apt)는 단지 상세를 열 때 웹 서버가 실시간 조회하고 Next 캐시에 둔다(DB 미저장, 2026-11-12 결정)."를 덧붙인다.
- [ ] **Step 5: 통과와 정적 검사** — Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm --filter web lint` / Expected: PASS. `grep -rn "DATA_GO_KR_SERVICE_KEY" apps/web --include=*.tsx`가 클라이언트 컴포넌트에서 나오지 않아야 한다.
- [ ] **Step 6: Commit** — `git commit -m "feat(stage4): 단지 상세에서 K-apt 관리비 실시간 조회와 캐시"`

---

### Task 7: 수집 스케줄

**Files:** Modify `.github/workflows/collect.yml`

- [ ] **Step 1: 워크플로 수정**
  - `geocode` 단계는 `complexes` 단계 바로 뒤에 둔다. 조건은 complexes와 같다(예약 실행은 일요일만, 수동 실행은 새 입력 `run_geocode`(boolean, 기본 false)를 켰을 때만). `if: ${{ !cancelled() }}`.
  - env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VWORLD_OPENAPI_KEY: ${{ secrets.VWORLD_OPENAPI_KEY }}`, `GEOCODE_SGG: ${{ inputs.geocode_sgg }}`, `GEOCODE_MAX_CALLS: ${{ inputs.geocode_max_calls || '3000' }}`, `RUN_GEOCODE: ${{ inputs.run_geocode }}`.
  - 키가 비어 있으면 `::warning::`을 출력하고 건너뛴다(complexes 단계의 키 확인 패턴).
  - `pois` 단계는 수동 실행 전용이다(새 입력 `run_pois`, boolean, 기본 false). CSV를 바꾼 뒤에만 돌린다. env는 Supabase 두 개만 넣는다.
  - 새 외부 액션은 없다. 입력값은 env로만 넘긴다.
- [ ] **Step 2: 검증** — Run: `uvx --from actionlint-py actionlint .github/workflows/*.yml` / Expected: 출력 없음.
- [ ] **Step 3: Commit** — `git commit -m "ci(collect): 단지 좌표 주 1회 증분 수집, 역·학교 적재 수동 실행"`

---

### Task 8: 로컬 확인, 용량, 문서

- [ ] **Step 1: 로컬 적재** — 로컬 Supabase에서 진행한다. `regions`·강남구 실거래·단지는 M4a 방식으로 적재하고, 이미 있으면 그대로 쓴다. 이어서 `uv run python main.py pois`, `GEOCODE_SGG=11680 uv run python main.py geocode`를 실행한다(env는 명령에 직접). Expected: pois 행 수, 지오코딩 성공·실패·미발견 건수, freshness 3개.
- [ ] **Step 2: 실측** — `docker exec … psql`로 다음을 확인한다.
  - 강남구 단지 좌표 성공률. **90% 미만이면** 실패 단지 20개의 주소와 실패 사유를 PR 본문에 적는다.
  - 표본 단지 3개의 가장 가까운 역 이름과 거리를 지도 앱과 대조한다(오차 100m 이내인지).
  - `pg_total_relation_size('public.pois')`와 complexes 증가량. 용량 추정(5MB)의 2배를 넘으면 멈추고 알린다.
  - `explain analyze select * from public.complexes_for_conditions(array['1168000000'], 80, 90, 12)`. 1초를 넘으면 M4b-D5에 따라 멈추고 알린다.
- [ ] **Step 3: 화면 확인** — 개발 서버(`DATA_GO_KR_SERVICE_KEY`를 명령 env로 넘김, `.env.local`은 수정하지 않음)에서 3단계에 역 800m must와 초등학교 500m 선호를 저장한다. 4단계 목록에 거리가 보이는지, 상세 주변 시설 표(환승역 노선 합침), 좌표 없는 단지의 "위치 정보 없음", `location_partial` 안내를 확인한다. 상세 관리비 칸에 부과 월·총액·㎡당이 보이는지, 같은 단지를 다시 열 때 빨리 뜨는지(캐시), 강남구 단지 10개 중 관리비를 찾은 개수를 확인한다(7개 미만이면 실패 사유를 PR 본문에 적는다). 스크린샷을 `docs/screenshots/m4b/`에 저장한다.
- [ ] **Step 4: 로드맵** — `2026-11-03-roadmap.md`의 M4b 항목을 이 계획 링크와 결정(D1 관리비는 상세에서 실시간 조회 + 캐시, D2 파일 기반 POI, D5 조회 시 KNN)으로 바꾼다. M4c는 만들지 않는다.
- [ ] **Step 5: Commit** — `git commit -m "docs: M4b 스크린샷, 로드맵 M4b 반영"`. 그다음은 push·PR·원격 `supabase db push`·Actions 수동 실행(`run_pois`, `run_geocode`)인데, 모두 사용자 확인 후에 한다. Vercel 배포 시 `DATA_GO_KR_SERVICE_KEY`를 서버 env로 넣어야 관리비가 보인다는 점을 PR 본문에 적는다. 원격 지오코딩은 수도권 약 1만 5천 단지라, 상한 3,000이면 5회 이상 실행해야 한다. 일일 한도를 확인한 뒤 상한을 정한다.
