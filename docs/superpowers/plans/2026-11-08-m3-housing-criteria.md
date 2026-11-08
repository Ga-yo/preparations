# M3: 3단계 주택 선택 기준 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 3단계(주택 기본 조건·단지 조건·가치 조건·우선순위)를 저장하면, 결정론적 코드가 예산·지역 시세·**실제 단지 데이터**와 대조해 조건 충돌과 "조건을 만족하는 단지 수"를 계산하고, 에이전트(`deepseek-v4-pro`)가 그 결과를 기준일·TIP과 함께 설명한다.

**Architecture:** collector `jobs/complexes.py`가 PublicDataReader `BuildingLedger`로 **실거래가 있는 법정동만**(M3-D9) 건축물대장 **총괄표제부**(동이 하나뿐인 단지는 **표제부**)를 받아 아파트만 `complexes`에 `bldrgst_pk`로 upsert하고, SQL 함수 `link_transactions_to_complexes()`가 (법정동코드, 지번)으로 `transactions.complex_id`를 채운다. RPC `complexes_for_conditions`가 희망 지역의 단지 속성과 단지별 최근 중위 실거래가를 돌려주고, 순수 함수 `findConflicts`(`lib/calc/conditions.ts`)가 must 조건 필터링·하나씩 빼 보기(leave-one-out)로 충돌을 만든다. 툴 `check_conditions`가 이를 묶어 `as_of`와 함께 돌려준다. 3단계 폼은 `condition_sets`에 새 행을 넣는다(append-only, M2와 같음).

**Tech Stack:** M2와 동일 — Next.js 16 App Router, zod v4, vitest, Supabase CLI(로컬)·pgTAP, Python 3.13 + uv + PublicDataReader 1.1.1.post2 + supabase-py + pytest, GitHub Actions.

**Spec:** `CLAUDE.md`("3단계. 주택 선택 기준 구체화", TIP 영역 ex1·ex2, 원칙 1~11), 로드맵 `2026-11-03-roadmap.md`의 M3 항목. 로드맵 M4의 "건축물대장 표제부(용적률·건폐율)"와 "실거래 ↔ 단지 연결"을 이번 마일스톤으로 당긴다(브레인스토밍 2026-11-08, 범위 C 선택).

**선행 조건:** `main`에서 `feat/m3-housing-criteria` 브랜치. `DATA_GO_KR_SERVICE_KEY`에 공공데이터포털 **"국토교통부_건축HUB_건축물대장정보 서비스"** 활용신청이 추가돼 있어야 한다(실거래가와 같은 키, 서비스별 신청). 없으면 Task 2 Step 1에서 멈추고 요청한다 — 그동안 Task 1(DB)과 Task 4(순수 함수)를 먼저 진행할 수 있다.

## 결정 사항 (승인 필요)

| # | 결정 | 이유 |
|---|------|------|
| M3-D1 | 단지 데이터의 기준은 **건축물대장 총괄표제부**(+ 총괄표제부가 없는 대지의 표제부). K-apt(공동주택 단지정보·관리비)는 쓰지 않는다. | PublicDataReader에 있고 기존 키로 받으며 필드가 라이브러리 소스로 확인됨(`vlRat`, `bcRat`, `hhldCnt`, `useAprDay`, `totPkngCnt`, `platArea`, `mainPurpsCdNm`). K-apt는 라이브러리에 없고 명세 미확인. |
| M3-D2 | **관리비 조건(`mgmt_fee_per_m2_max`)은 입력·저장만** 하고 충돌 점검은 `data_unavailable` notice로 돌려준다. K-apt 관리비는 M4 시작 시 다시 결정한다. | M3-D1. 컬럼은 이미 있어 스키마 변경 없음. |
| M3-D3 | **대지지분은 평균 근사치** `대지면적(platArea) ÷ 세대수(hhldCnt)`(㎡/세대)로만 보여주고 "평균값, 세대별 실제 대지권과 다름"을 항상 함께 표시한다. 필터 조건으로 쓰지 않는다. | 세대별 대지권은 등기부에만 있다. 원칙 1: 근사치임을 숨기지 않는다. |
| M3-D4 | 아파트 판별: `mainPurpsCdNm = '공동주택'` 이고 `etcPurps`에 '아파트'가 들어간 행. 값 형식은 Task 2 Step 1 fixture로 확정한다. | 공동주택에는 연립·다세대·기숙사도 섞인다. 실거래가가 아파트만 있으므로 맞춘다. |
| M3-D5 | 실거래 ↔ 단지 연결 키는 **(법정동코드 10자리, 지번 `본번-부번` 정규화)**. 한 지번에 단지가 둘 이상이면 연결하지 않고(null 유지) 건수를 note에 남긴다. 단지명은 연결 키로 쓰지 않는다. | 대장 단지명(`bldNm`)과 실거래 단지명(`aptNm`)은 표기가 자주 다르다. 지번은 두 출처 모두 있다. |
| M3-D6 | 우선순위 의미: `must` = 필터(충족 못 하면 후보에서 제외), `prefer` = 충족 단지 수만 보여줌, `ignore`/미지정 = 계산하지 않음. 기본값은 입력한 조건이면 `prefer`. | 충돌은 must끼리만 생긴다는 로드맵 정의와 맞춘다. |
| M3-D7 | 오피스텔·연립·다세대를 고르면 `no_data_for_type` notice. 저장은 허용한다. | 실거래가·단지 데이터가 아파트만 있다(원격 확인: transactions 497,585행 전부 apartment). |
| M3-D9 | 수집 대상 법정동은 **`transactions`에 거래가 있는 법정동**(`distinct region_code`)만. 수도권 전체 2,907개가 아니라 1,035개(원격 조회, 2026-11-08). 준공연도 조건은 실거래 `build_year`로도 보이지만 단지 단위 값은 대장 `useAprDay`로 통일한다. | 거래 없는 단지는 시세 비교·연결이 안 돼 3단계 점검에 쓸 수 없다. 호출 수·용량 약 1/3. |
| M3-D8 | 방·욕실 수, 층, 향은 저장만 하고 단지 단위 점검을 하지 않는다(`unit_level_condition` notice). | 세대 단위 정보라 단지 대장에 없다. 층은 실거래 `floor`로 4단계에서 쓴다. |

## 용량 추정 (원칙 11)

- 호출 수: 실거래가 있는 법정동 **1,035개**(원격 `select count(distinct region_code) from transactions`, 2026-11-08; 수도권 전체는 2,907개) × 총괄표제부 1회 ≈ 1,035회. 표제부 보충까지 하면 최대 ≈ 2,070회. Task 2 Step 1에서 일일 트래픽 한도를 확인하고, 한도가 넘으면 시군구를 나눠 백필한다(`complexes_sgg` 입력, M2 `transactions_sgg`와 같은 방식).
- 행 수: 실거래 단지 지번 **15,791개**(원격 조회). 아파트로 걸러진 대장 행은 이 근처, 상한 **2만 행**으로 잡는다.
- 행 크기: 힙 ~300B(단지명·주소 한글 포함) + 인덱스 ~120B(pkey, `bldrgst_pk` 유니크, `(region_code, jibun)`, `region_code`) ≈ **~420B/행** → **~8MB**.
- `transactions.complex_id` 채우기: 부분 인덱스(`where complex_id is not null`)가 커진다. 50만 행 × ~40B ≈ **~20MB**.
- 합계 증가 ≈ 30MB. 현재 191MB → **~220MB < 400MB**.
- 저장 컬럼은 `complexes` 기존 컬럼 + 아래 Task 1의 추가 컬럼만. 원본 응답, 에너지등급·승강기·구조 등은 저장하지 않는다.
- 검증: Task 3 Step 4에서 실제 행 수·`bytes_per_row`로 다시 계산한다. **50MB 증가를 넘으면 원격 백필 전에 멈추고 알린다.**

## Global Constraints

- 모델 ID: 3단계는 `deepseek-v4-pro`(`modelForStage` 변경 없음, 이미 3→pro). `deepseek-chat`, `deepseek-reasoner` 금지.
- 금액·개수·비율은 `lib/calc` 또는 SQL 집계로만. LLM은 충돌 코드와 툴 숫자만 인용한다.
- 대출 규제는 DB에서만. 예산은 M1 `computeBudget`/M2 `get_region_prices` 결과를 그대로 쓴다.
- 에이전트·웹은 공공 API를 호출하지 않는다. 툴 결과 `as_of`에 `complexes:building_ledger`, `transactions:apartment` 포함.
- 툴 인자 1단 스키마, zod 검증. 지역 코드는 저장된 `condition_sets.region_codes`에서만 나온다.
- 스키마 변경은 `supabase/migrations/*.sql`. 새 사용자 테이블 없음(`condition_sets` RLS 유지). `complexes`는 참조 테이블: anon·authenticated select만, 쓰기는 service role.
- 비밀값: 건축물대장도 `serviceKey=` 쿼리를 쓴다. PublicDataReader `BuildingLedger.get_data`는 실패 시 `resultMsg`를 그대로 예외로 올리고 `requests.get`에 timeout이 없다 → M2 `transactions.py`처럼 timeout 프록시를 씌우고, 예외는 `raise ... from None`으로 법정동코드·예외 클래스 이름만 남긴다. 키는 `unquote(key)`로 넘긴다(이중 인코딩 함정, M2 메모).
- 워크플로 secrets는 해당 run 단계 env에만. 새 외부 액션 없음.
- LLM에 소득·자산 원값을 보내지 않는다(M2와 같음). 단지명·주소는 공개 데이터라 보내도 된다.
- 단위: 면적 ㎡, 비율 %, 금액 원, 날짜 KST `YYYY-MM-DD`. 대장 `useAprDay`는 `YYYYMMDD` 문자열(빈 값 가능) — fixture로 확정.
- 대장 필드는 PublicDataReader 1.1.1.post2 `PublicDataPortal/molit.py` `BuildingLedger.meta_dict`의 영문 컬럼명(`translate=False`) 기준. 값 형식은 Task 2 Step 1 fixture로 확정하고 추측해서 매핑하지 않는다.
- Next.js 16 코드를 쓰기 전 `apps/web/node_modules/next/dist/docs/01-app/`의 해당 문서를 읽는다(폴더 이동 후 `node_modules`가 없으면 `pnpm install` 먼저).
- 로컬 실행·테스트는 메모리 규칙대로: `.env.local`/`collector/.env`를 수정·출력하지 않고, 로컬 Supabase는 `http://[::1]:54321`, env를 명령에 직접 넘긴다.

## Review Focus

1. **한 대지에 총괄표제부와 표제부가 모두 있음** — 같은 단지가 두 번 들어가면 안 된다. 총괄표제부가 있는 대지(`sigunguCd+bjdongCd+platGbCd+bun+ji`)의 표제부 행은 버린다. (Task 2 `test_title_rows_skipped_when_recap_exists`)
2. **같은 지번에 단지 2개**(재건축 후 분할 등) — 실거래를 엉뚱한 단지에 붙이지 않는다. 연결하지 않고 건수를 센다. (Task 1 pgTAP `ambiguous jibun`)
3. **산 지번·블록 지번**(`platGbCd` 1·2) — 실거래 지번 표기와 다르다. `platGbCd = '0'`(대지)만 연결하고 나머지는 단지로 저장하되 연결하지 않는다. (Task 2 `test_jibun_normalized`)
4. **세대수 0·빈 값, 용적률 0** — 대지지분 0으로 나누기, "용적률 0%" 오표시를 막는다. 0과 빈 값은 null로 저장. (Task 2 `test_zero_values_to_null`)
5. **must 조건만으로 후보 0개** — 어느 조건 때문인지 leave-one-out으로 지목한다. 지역 자체에 단지 데이터가 없으면 충돌이 아니라 `no_complex_data`. (Task 4 테스트)
6. **일부 법정동 API 실패** — 나머지는 적재, 끝에 실패 목록으로 비정상 종료, `data_freshness` 미갱신(M2와 같음). (Task 2 `test_run_continues_and_skips_freshness_on_failure`)

---

## File Structure

```
supabase/migrations/
  20261108000000_m3_complexes.sql        complexes 컬럼 추가, 연결 함수, complexes_for_conditions RPC
  20261108000100_m3_seed_tips.sql        3단계 TIP 6개
supabase/tests/database/complexes.test.sql
packages/db-types/database.types.ts      재생성
collector/
  jobs/complexes.py                      건축물대장 → complexes, 실거래 연결 호출
  tests/test_complexes.py
  tests/fixtures/bldrgst_recap_sample.csv, bldrgst_title_sample.csv   실제 응답 일부(키 없음)
  main.py                                JOBS에 complexes 추가
.github/workflows/collect.yml            complexes 단계(주 1회), dispatch 입력 complexes_sgg
apps/web/
  lib/calc/conditions.ts                 findConflicts + .test.ts
  lib/agent/tools/check-conditions.ts    + .test.ts
  lib/agent/tools/index.ts, prompt.ts
  app/plans/[planId]/stage/3/page.tsx, actions.ts, actions.test.ts
  app/plans/[planId]/_components/ConditionCheckCard.tsx
  app/plans/[planId]/stage/2/page.tsx    3단계 링크
```

---

### Task 1: DB — complexes 컬럼, 실거래 연결, 조건 조회 RPC

Task 2(수집)가 이 컬럼과 함수를 쓴다.

**Files:**
- Create: `supabase/migrations/20261108000000_m3_complexes.sql`, `supabase/tests/database/complexes.test.sql`
- Modify: `packages/db-types/database.types.ts`

**Interfaces:**
- `complexes` 추가 컬럼: `bldrgst_pk text unique`, `jibun text`(정규화 `본번-부번`, 대지만). 인덱스 `(region_code, jibun) where jibun is not null`. RLS: 기존 참조 테이블 정책과 같게(anon·authenticated select).
- `public.transaction_dongs() returns setof text` — 거래가 있는 법정동코드 목록, `security definer`, execute는 `service_role`만(Task 2 수집 대상).
- `public.link_transactions_to_complexes() returns table (linked int, ambiguous int)` — `security definer`, `set search_path = ''`, execute는 `service_role`만. `transactions.complex_id is null`이고 `(region_code, jibun)`이 정확히 한 단지와 맞는 행만 update.
- `public.complexes_for_conditions(region_codes text[], area_min numeric default null, area_max numeric default null, months int default 12) returns table (complex_id bigint, name text, region_code text, approval_year smallint, household_count int, parking_per_household numeric, floor_area_ratio numeric, building_coverage_ratio numeric, land_share_m2 numeric, median_price bigint, deal_count int)` — `stable`, security invoker, anon·authenticated execute. `region_codes`는 10자리; `XXXXX00000`이면 시군구 전체, 아니면 그 법정동. 배열 길이 1~15 아니면 `22023`. `median_price`는 연결된 실거래 중 해제·직거래 제외, 기간·면적 필터 적용(M2 `region_price_stats`와 같은 규칙), 거래 없으면 null. `land_share_m2 = site_area_m2 / household_count`(세대수 null이면 null). 최대 3,000행(`limit`), 넘으면 마지막에 잘렸다는 사실을 툴이 알 수 있게 3,001행까지 반환.

- [ ] **Step 1: 실패하는 pgTAP 테스트** — `complexes.test.sql`, M2 `region_prices.test.sql` 형식. 시드: 개포동에 단지 A(지번 `12-3`, 1983 승인, 1,000세대, 용적률 180), B(`45`, 2015 승인, 300세대), C·D(같은 지번 `77`), 실거래 A 지번 3건·B 2건·`77` 1건·지번 불일치 1건. 단언:
  - `link_transactions_to_complexes()` → `linked = 5`, `ambiguous = 1`, 불일치 1건은 null.
  - 두 번째 호출 → `linked = 0`(멱등).
  - `complexes_for_conditions(array['1168000000'])` → A·B·C·D 4행, A의 `median_price`·`deal_count = 3`, A의 `land_share_m2 = site_area_m2/1000`.
  - 면적 필터로 A의 `deal_count` 감소.
  - 빈 배열·16개 → `throws_ok '22023'`.
  - `anon`으로 `link_transactions_to_complexes` 실행 → 권한 오류.

- [ ] **Step 2: 실패 확인** — Run: `supabase test db` / Expected: `complexes.test.sql` FAIL.

- [ ] **Step 3: 마이그레이션 작성** — 위 인터페이스대로. 주석은 이유만 한 줄씩.

- [ ] **Step 4: 통과 확인** — Run: `supabase db reset && supabase test db` / Expected: 모든 파일 PASS.

- [ ] **Step 5: 타입 재생성** — Run: `supabase gen types typescript --local > packages/db-types/database.types.ts && grep -c "complexes_for_conditions\|bldrgst_pk" packages/db-types/database.types.ts` / Expected: 2 이상.

- [ ] **Step 6: Commit** — `git add supabase packages/db-types && git commit -m "feat(db): 단지 대장 키·지번, 실거래 단지 연결, 조건별 단지 조회 RPC"`

---

### Task 2: collector — 건축물대장 단지 job

**Files:**
- Create: `collector/jobs/complexes.py`, `collector/tests/test_complexes.py`, fixture 2개
- Modify: `collector/main.py`

**Interfaces:**
- Produces: `run()`; `transform(recap: pd.DataFrame, title: pd.DataFrame, valid_codes: set[str]) -> tuple[list[dict], dict[str, int]]` — `complexes` upsert 행(키 `bldrgst_pk`)과 건너뛴 사유별 건수. `parse_sigungu(raw)`는 `jobs.transactions`의 것을 import해 재사용.
- `DATASET = "complexes:building_ledger"`, `SOURCE = "국토교통부 건축물대장 총괄표제부·표제부 (PublicDataReader BuildingLedger)"`.

- [ ] **Step 1: 실제 응답 fixture 캡처와 한도 확인** — 강남구 개포동(`11680`, `10300`)과 동 하나짜리 아파트가 있는 법정동 하나(예: 수원시 장안구 동 하나)에 대해 `BuildingLedger(key).get_data("총괄표제부", sgg, bdong, translate=False)`와 `"표제부"`를 호출한다. 확인할 것: `mainPurpsCdNm`·`etcPurps` 실제 값, `useAprDay` 형식, `bun`/`ji` 자리수(0 채움 여부), `platGbCd` 값, 숫자 필드가 문자열인지, `mgmBldrgstPk` 유일성. 서비스키·`rnum` 외 불필요 컬럼을 뺀 20행 이내를 CSV로 저장한다. 공공데이터포털 마이페이지에서 건축물대장 서비스의 일일 트래픽 한도를 확인해 PR 본문용으로 적는다. 키가 활용신청 안 돼 있으면(`SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 등) 멈추고 사용자에게 요청한다.

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/test_complexes.py`. fixture는 `pd.read_csv(..., dtype=str)`.
  - `test_only_apartments_kept` — 공동주택 중 아파트만(M3-D4), 근린생활시설·다세대 제외.
  - `test_title_rows_skipped_when_recap_exists` — Review Focus 1.
  - `test_jibun_normalized` — `bun='0012'`, `ji='0003'` → `jibun='12-3'`, `ji='0000'` → `'12'`. `platGbCd`가 0이 아니면 `jibun`은 null(Review Focus 3).
  - `test_zero_values_to_null` — 세대수·용적률·건폐율·대지면적 `'0'`/빈 값 → None.
  - `test_unknown_region_skipped` — `sigunguCd+bjdongCd`가 `regions`에 없으면 건너뛰고 `skipped['unknown_region']` 증가.
  - `test_approval_date_parsed` — `useAprDay` `'19830512'` → `'1983-05-12'`, 빈 값 → None.
  - `test_run_continues_and_skips_freshness_on_failure` — fetch가 한 법정동에서 예외 → 나머지 upsert, 마지막에 `SystemExit`, `mark_freshness` 미호출, 예외 메시지에 서비스키 문자열 없음.
  - 매핑: `bldrgst_pk ← mgmBldrgstPk`, `name ← bldNm`(빈 값이면 `newPlatPlc`), `region_code ← sigunguCd+bjdongCd`, `jibun_address ← platPlc`, `road_address ← newPlatPlc`, `approval_date ← useAprDay`, `household_count ← hhldCnt`, `building_count ← mainBldCnt`(표제부는 1), `parking_count ← totPkngCnt`(표제부는 옥내외 자주식·기계식 대수 합), `site_area_m2 ← platArea`, `total_floor_area_m2 ← totArea`, `floor_area_ratio ← vlRat`, `building_coverage_ratio ← bcRat`, `housing_type = 'apartment'`, `data_as_of = kst_today()`, `source = SOURCE`.

- [ ] **Step 3: 실패 확인** — Run: `cd collector && uv run pytest tests/test_complexes.py -v` / Expected: FAIL (`ModuleNotFoundError: jobs.complexes`).

- [ ] **Step 4: 구현** — `jobs/complexes.py`. 모듈 docstring에 API 이름, 호출 형태, Step 1에서 확인한 값 형식. M2 `transactions.py`의 timeout 프록시·`kst_today`·`parse_sigungu`·실패 누적 패턴을 재사용한다(필요한 것만 import). 법정동 목록은 `transactions`의 `distinct region_code`(M3-D9; `complexes_sgg`가 있으면 그 시군구로 좁힘). 목록은 Task 1의 `rpc("transaction_dongs")`로 받는다(50만 행을 내려받지 않기 위해). 끝에서 `client().rpc("link_transactions_to_complexes")`를 호출하고 반환 건수(linked, ambiguous)를 출력·note에 넣은 뒤 `mark_freshness`. 바뀌지 않은 단지는 upsert로 덮어쓰고, 이번 실행 대상 시군구에서 응답에 없는 `bldrgst_pk`는 지우지 않는다(멸실 처리는 범위 밖, 마무리에 적음). `main.py` JOBS에 `"complexes": "jobs.complexes"`.

- [ ] **Step 5: 통과 확인** — Run: `cd collector && uv run pytest -v` / Expected: 전체 PASS.

- [ ] **Step 6: Commit** — `git add collector && git commit -m "feat(collector): 건축물대장 총괄표제부로 수도권 아파트 단지 수집"`

---

### Task 3: 수집 스케줄과 로컬 적재·용량 검증

**Files:** Modify `.github/workflows/collect.yml`

- [ ] **Step 1: 워크플로 수정** — 단지 대장은 자주 안 바뀌므로 기존 `regions` 단계와 같은 조건으로 **주 1회(일요일 KST)** 돈다: `if [ "$RUN_COMPLEXES" = "true" ] || { [ "${{ github.event_name }}" = "schedule" ] && [ "$(date -u +%u)" = "6" ]; }`, 아니면 `::notice::complexes skipped (weekly, Sundays KST)`. 입력 `workflow_dispatch.inputs.run_complexes`(type boolean, default false — 수동 실행이 매번 1,000회 호출하지 않게), `complexes_sgg`(쉼표 5자리 코드, 비우면 전체). env는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATA_GO_KR_SERVICE_KEY`, `COMPLEXES_SGG: ${{ inputs.complexes_sgg }}`, `RUN_COMPLEXES: ${{ inputs.run_complexes }}` — 입력은 env로만 넘긴다. `if: ${{ !cancelled() }}`. `transactions` 단계 뒤에 둔다(연결 함수가 새 실거래도 연결). `transactions` job 끝에서도 `link_transactions_to_complexes`를 호출해 매일 새 거래를 연결한다(`jobs/transactions.py` 마지막 한 줄, 실패해도 실거래 적재는 성공 처리하고 경고만).

- [ ] **Step 2: 워크플로 검증** — Run: `uvx --from actionlint-py actionlint .github/workflows/*.yml` / Expected: 출력 없음.

- [ ] **Step 3: 로컬 적재** — 로컬 Supabase에 regions·1개월 실거래가 있는 상태에서 강남구·수원시 장안구만: `COMPLEXES_SGG=11680,41111 uv run python main.py complexes` (env는 명령에 직접). Expected: upsert 건수, linked/ambiguous 출력, freshness 갱신.

- [ ] **Step 4: 용량·연결률 재계산** — Run: `docker exec $(docker ps -qf name=supabase_db) psql -U postgres -c "select count(*) rows, pg_total_relation_size('public.complexes')/greatest(count(*),1) bytes_per_row from public.complexes; select count(*) filter (where complex_id is not null)::float/count(*) link_rate from public.transactions where left(region_code,5) in ('11680','41111');"` / Expected: `bytes_per_row × 20,000` + 연결 인덱스 증가가 50MB 이하. **연결률이 70% 미만이면** 미연결 거래 지번 표본 20개를 뽑아 원인(지번 표기, 산 지번, 대장 누락)을 PR 본문에 적고, 키 규칙 변경이 필요하면 멈추고 묻는다.

- [ ] **Step 5: Commit** — `git add .github/workflows/collect.yml collector/jobs/transactions.py && git commit -m "ci(collect): 단지 대장 주 1회 수집, 매일 새 실거래 단지 연결"`

---

### Task 4: `lib/calc/conditions.ts` — 결정론적 충돌 분석

**Files:** Create `apps/web/lib/calc/conditions.ts`, `conditions.test.ts`

**Interfaces:**
```ts
export type Priority = "must" | "prefer" | "ignore";
export type ConditionKey = "price_max" | "area" | "approval_year_min" | "household_count_min"
  | "parking_per_household_min" | "floor_area_ratio_max";
export interface Conditions {
  housing_types: string[]; price_min: number | null; price_max: number | null;
  area_min: number | null; area_max: number | null; approval_year_min: number | null;
  household_count_min: number | null; parking_per_household_min: number | null;
  floor_area_ratio_max: number | null; mgmt_fee_per_m2_max: number | null;
  rooms_min: number | null; baths_min: number | null; floor_pref: string | null; direction_pref: string | null;
  priorities: Partial<Record<string, Priority>>;
}
export interface ComplexRow {  // complexes_for_conditions 반환 행 그대로(Task 1)
  complex_id: number; name: string; region_code: string; approval_year: number | null;
  household_count: number | null; parking_per_household: number | null; floor_area_ratio: number | null;
  building_coverage_ratio: number | null; land_share_m2: number | null; median_price: number | null; deal_count: number;
}
// get_region_prices data.regions 행에서 가져온다. max_budget은 1단계 미저장이면 null
export interface RegionBudget { sigungu_code: string; max_budget: number | null; median_price: number }
export type Conflict =
  | { code: "price_min_over_budget"; budget_max: number }
  | { code: "price_max_over_budget"; budget_max: number }
  | { code: "area_price_mismatch"; sigungu_codes: string[] }   // 희망 면적 중위가 > price_max
  | { code: "no_match_for_musts"; blocking: ConditionKey[] }   // 빼면 후보가 생기는 must 조건들
  | { code: "few_matches_for_musts"; count: number };          // 1~4개
export type Notice = "no_data_for_type" | "data_unavailable:mgmt_fee" | "unit_level_condition"
  | "no_complex_data" | "truncated" | "land_share_is_average";
export function findConflicts(c: Conditions, budgets: RegionBudget[], complexes: ComplexRow[], truncated: boolean): {
  conflicts: Conflict[]; notices: Notice[];
  counts: { total: number; must: number; prefer: Record<string, number> };
  matches: ComplexRow[]; // must 충족 단지, median_price 오름차순, 최대 20개
};
```
- must 충족 판정: 조건값이 null이면 통과. `price_max`는 `median_price <= price_max`(거래 없으면 미충족 — "가격 확인 불가"로 셈). `approval_year_min`은 `approval_year >= 값`, `floor_area_ratio_max`는 `<=`, 나머지 `>=`. `area`는 RPC에서 이미 면적 필터가 적용된 `deal_count > 0`.
- 예산 상한은 지역별 `max_budget` 중 **최댓값**으로 판정(가장 유리한 지역에서도 넘으면 충돌), 메시지용으로 그 값을 담는다. 모두 null이면 예산 충돌은 계산하지 않는다.
- `area_price_mismatch`: `price_max`가 있고 지역 `median_price`(희망 면적 범위로 계산된 값) > `price_max`인 시군구 목록, **모든** 희망 시군구가 해당할 때만 충돌.
- `few_matches_for_musts`: must 충족 1~4개. must 조건이 하나도 없으면 must 관련 충돌 없음.
- `no_complex_data`이면 단지 기반 충돌(`no_match_for_musts`, `few_matches_for_musts`)은 만들지 않는다. `land_share_is_average`는 `matches`가 비어 있지 않으면 항상 붙인다.
- `counts.prefer`: prefer 조건 키별로, must 충족 단지 중 그 조건까지 충족하는 수.

- [ ] **Step 1: 실패하는 테스트** — 최소 다음을 고정값으로:
  - price_min > 모든 지역 예산 → `price_min_over_budget`.
  - price_max > 예산이지만 price_min은 예산 안 → `price_max_over_budget`만.
  - 준공 2015 이후 must + 1,000세대 이상 must → 0개, 하나씩 빼면 각각 >0 → `blocking: ["approval_year_min","household_count_min"]`.
  - 한 조건만 빼도 여전히 0 → 그 조건은 blocking에 없음.
  - prefer 조건은 must 수에 영향 없고 `counts.prefer`에만.
  - `complexes` 빈 배열 → 충돌 없이 `no_complex_data`.
  - `housing_types: ["officetel"]` → `no_data_for_type`; 관리비 입력 → `data_unavailable:mgmt_fee`; 방·층·향 입력 → `unit_level_condition`.
  - 희망 시군구 2곳 모두 면적 중위가 > price_max → `area_price_mismatch`, 한 곳만 → 없음.
  - must 충족 3개 → `few_matches_for_musts { count: 3 }`, `matches`는 `median_price` 오름차순(null은 뒤).
  - `truncated: true` → `truncated` notice; 1단계 미저장(`max_budget` 모두 null) → 예산 충돌 없음.
  - 같은 입력 두 번 → 같은 출력(순서 포함).

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- conditions` / Expected: FAIL(모듈 없음).
- [ ] **Step 3: 구현** — 순수 함수, I/O 없음.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test -- conditions && pnpm typecheck` / Expected: PASS.
- [ ] **Step 5: Commit** — `git add apps/web/lib/calc && git commit -m "feat(calc): 3단계 조건 충돌과 단지 수 결정론적 분석"`

---

### Task 5: 툴 `check_conditions`

**Files:** Create `apps/web/lib/agent/tools/check-conditions.ts`, `.test.ts`; Modify `tools/index.ts`, `prompt.ts`

**Interfaces:** `defineTool` 계약, 인자 `{}`(빈 1단 스키마 — 저장된 최신 `condition_sets`를 읽는다). 결과 `{ data: { conflicts, notices, counts, matches, criteria: { months: 12 } }, as_of: { "complexes:building_ledger", "transactions:apartment" } }`. 오류: 지역 미저장 → `region_required`, 3단계 미저장(`housing_types` 비었고 `price_min`·`price_max`·`approval_year_min`·`household_count_min`·`parking_per_household_min`·`floor_area_ratio_max`가 모두 null) → `conditions_required`. `stale`·`notices`는 `get_region_prices` 결과를 이어받는다.

- [ ] **Step 1: 실패하는 테스트** — `get-region-prices.test.ts`의 fake·픽스처 재사용. 최신 행 사용, RPC 인자(`region_codes`, 면적) 기록 검증, 지역별 예산은 `getRegionPrices` 결과에서 가져옴, 3,001행이면 `truncated`이고 `findConflicts`에는 3,000행만 넘김, `complexes:building_ledger` freshness 행이 없으면 as_of에서 그 키를 뺀다(`get-budget.ts`의 기존 관례), 지역 미저장·3단계 미저장 오류 각각.
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- check-conditions` / Expected: FAIL.
- [ ] **Step 3: 구현** — `getRegionPrices.run` 재사용(예산·지역 중위가), `complexes_for_conditions` 호출, `findConflicts`. `toolsForStage`에 추가. `prompt.ts`에 3단계 지침 2~3줄: 충돌 코드별로 원인과 조정 방향을 설명, 숫자는 툴 값만, 대지지분은 평균 근사치라고 말함, 데이터 없는 조건은 "4단계 이후/데이터 없음"이라고 말함.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test && pnpm typecheck && pnpm lint` / Expected: PASS.
- [ ] **Step 5: Commit** — `git add apps/web/lib && git commit -m "feat(agent): 3단계 조건 점검 툴"`

---

### Task 6: 3단계 화면, 우선순위, TIP 6종

**Files:** Create `stage/3/page.tsx`, `actions.ts`, `actions.test.ts`, `_components/ConditionCheckCard.tsx`, `20261108000100_m3_seed_tips.sql`; Modify `stage/2/page.tsx`(다음 링크)

**Interfaces:** `stage3Schema`(M2 `num`/`check`/`text` 헬퍼 형식, 같은 파일 패턴), `saveStage3Conditions(planId, form)`, `checkConditionsForPlan(planId)`.

- [ ] **Step 1: 실패하는 테스트** — `actions.test.ts`(M2 형식, `fakeDb`): 
  - 최신 행의 2단계 값 보존하고 3단계 값만 덮어 insert.
  - `price_min > price_max` → `price_max` 오류; `housing_types`에 허용 외 값 → 오류.
  - `priorities`는 폼 `priority.<key>` 라디오에서 만들고, 허용 키·값(`must|prefer|ignore`) 외는 거부, 값이 빈 조건의 우선순위는 저장하지 않음.
  - `plans.current_stage`를 3으로(`.lt("current_stage", 3)`).
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test -- stage/3` / Expected: FAIL.
- [ ] **Step 3: actions 구현** — M2 `saveStage2Conditions`와 같은 흐름, 오류 코드 매핑 동일.
- [ ] **Step 4: TIP 시드** — M2 시드 형식(stage 3, `body` 첫 줄 정의 + `- ` 항목, `caution` = "알아두기"). **ex1·ex2는 CLAUDE.md 원문 그대로** 넣는다. 법령 출처는 법제처에서 조문을 확인한 경우에만 `source`, 아니면 null. 수치는 확인한 것만.

| slug | field_key | title | 담을 내용 |
|---|---|---|---|
| `approval-year-and-rebuild` | `approval_year_min` | 준공 연도와 사용승인일의 의미 | 사용승인일 = 건축물 사용을 허가받은 날로 대장 기준 준공일, 실거래가의 '건축년도'와 같은 뜻. 이어서 **ex1 원문**(준공 연도와 재건축의 관계) |
| `household-count-and-scale` | `household_count_min` | 세대수와 단지 규모 | 관리비 분담·커뮤니티 시설·거래량에 미치는 영향. 이어서 **ex2 원문**(단지 규모와 재건축 사업성) |
| `far-vs-bcr` | `floor_area_ratio_max` | 용적률과 건폐율의 차이 | 용적률 = 지상층 연면적 ÷ 대지면적, 건폐율 = 건축면적 ÷ 대지면적, 낮은 용적률이 재건축 여지로 언급되는 이유. 알아두기: 허용 용적률은 용도지역·조례로 정해지며 기존 용적률만으로 사업성을 판단할 수 없음 |
| `land-share` | `land_share` (화면 표시용, 입력 없음) | 대지지분의 의미 | 세대가 소유한 대지 몫, 재건축 시 권리가액과 관련. 알아두기: 이 서비스의 값은 대지면적 ÷ 세대수 평균이며 실제 값은 등기부 대지권으로 확인 |
| `redevelopment-vs-rebuild` | `redevelopment_interest` | 재개발과 재건축의 차이 | 재개발 = 기반시설이 열악한 지역 전체 정비, 재건축 = 기반시설은 양호하나 노후 공동주택 정비. 근거 법률(도시 및 주거환경정비법)은 조문 확인 후 출처 기재 |
| `rebuild-stages` | `redevelopment_interest` | 재건축 사업 단계와 사업성 판단 기준 | 안전진단 → 정비구역 지정 → 조합설립 → 사업시행인가 → 관리처분인가 → 이주·철거·착공 → 준공. 사업성 지표: 용적률 여유, 대지지분, 일반분양 물량, 공사비·분담금. 알아두기: 단계마다 수년이 걸리고 중단될 수 있음 |

- [ ] **Step 5: 화면 구현** — M2 `stage/2/page.tsx` 구조를 따른다. 섹션: ①주택 기본 조건(유형 체크박스, 가격 범위, 면적, 방·욕실, 층, 향) ②단지 조건(준공 연도, 세대수, 세대당 주차, 관리비 — 관리비 옆에 "현재 점검 데이터 없음") ③가치 조건(용적률 상한, 재건축·재개발 관심) ④우선순위(입력한 조건마다 must/prefer/ignore 라디오). 면적·방 기본값은 2단계에서 저장된 같은 컬럼(M2-D4). `ConditionCheckCard`(서버 컴포넌트): 충돌 목록(코드별 한국어 문구, 예: `no_match_for_musts` → "필수 조건을 모두 만족하는 단지가 없습니다. 다음 조건 중 하나를 '선호'로 바꾸면 후보가 생깁니다: …"), 단지 수(must/prefer), must 충족 단지 상위 20개 표(단지명, 승인연도, 세대수, 용적률, 평균 대지지분 "약 n㎡(평균)", 최근 중위가, 거래 건수), notices 문구, as_of. 페이지 오른쪽은 카드 + `ChatPanel`.
- [ ] **Step 6: 테스트·정적 검사** — Run: `supabase db reset && pnpm --filter web test && pnpm typecheck && pnpm lint && pnpm build` / Expected: 모두 PASS.
- [ ] **Step 7: 로컬 실행 확인** — 로컬 Supabase + Task 3 Step 3 데이터로 `pnpm dev`: 1·2단계(강남구·수원시 장안구) → 3단계에서 ① 예산 넘는 가격 범위 저장 → `price_max_over_budget` ② 준공 2015 이후·1,000세대 이상 둘 다 must → `no_match_for_musts`와 blocking 표시(데이터에 따라 조건값 조정) ③ 하나를 prefer로 바꿔 후보 표 확인 ④ TIP ⓘ 6개 펼침. 스크린샷 `docs/screenshots/m3/`. DeepSeek 키가 무효면 채팅은 검증 불가로 보고.
- [ ] **Step 8: Commit** — `git add supabase apps/web docs/screenshots/m3 && git commit -m "feat(stage3): 주택 조건·우선순위 폼, 조건 점검 카드, TIP 6종"`

---

## 마무리

- 전체 검증: `pnpm lint && pnpm typecheck && pnpm test && (cd collector && uv run pytest) && supabase test db` — 출력과 함께 보고.
- PR 본문: 결정 M3-D1~D9, 일일 트래픽 한도와 백필 호출 수(Task 2 Step 1), 용량·연결률 실측(Task 3 Step 4), 원격 사용자 할 일(건축물대장 활용신청, `db push`, `complexes` 수동 전체 실행, 필요하면 시군구 분할 백필), 미반영 범위(관리비 → M4 K-apt 재검토, 단지 멸실·재건축 후 옛 대장 행 정리, 세대 단위 조건, 오피스텔·연립).
- 로드맵 수정: M3 항목에 단지 수집·연결을 적고, M4 항목에서 "건축물대장 표제부(용적률·건폐율)"와 "실거래 ↔ 단지 연결"을 지우고 좌표·POI·K-apt만 남긴다.
