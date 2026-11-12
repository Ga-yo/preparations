# M4a: 4단계 후보 탐색(기존 데이터) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3단계까지 저장한 조건으로 후보 단지를 결정론적 적합도 순으로 보여주고, 단지를 고르면 실거래 사례·월별 추이·같은 동 단지와의 가격 비교를 기준일과 함께 보여주며, 관심 단지를 `candidates`에 저장한다. 에이전트는 같은 결과를 툴로 받아 설명한다.

**Architecture:** 새 수집·좌표 없이 M3 재료만 쓴다. 후보 목록은 기존 RPC `complexes_for_conditions` + 순수 함수 `rankComplexes`(`lib/calc/fit.ts`, `findConflicts`와 판정 함수 `meets`를 공유). 단지 상세는 새 RPC 2개(`complex_trades`, `complex_monthly_prices`)와 같은 동 단지 비교(`complexes_for_conditions`에 법정동 코드 하나를 넘겨 재사용 + `neighborStats`). 3단계 툴과 4단계 툴·화면이 같은 로더 `loadConditionContext`로 최신 조건·예산·단지 행을 읽는다.

**Tech Stack:** M3와 동일 — Next.js 16 App Router, zod v4, vitest, Supabase CLI(로컬)·pgTAP. collector·워크플로 변경 없음.

**Spec:** `CLAUDE.md`("4단계. 추천 주택 탐색 및 비교", 원칙 1~11), 로드맵 `2026-11-03-roadmap.md` M4 항목, 인계 메모(M4 범위). 브레인스토밍(2026-11-11)에서 M4를 **M4a(기존 데이터로 4단계 완성)**와 **M4b(좌표·역·학교 POI·관리비)**로 나누기로 함(방안 A).

**선행 조건:** `main`에서 `feat/m4a-candidates` 브랜치. 새 API 키 필요 없음.

## 결정 사항 (승인 필요)

| # | 결정 | 이유 |
|---|------|------|
| M4a-D1 | 로드맵의 `search_complexes` RPC는 만들지 않는다. 후보 목록은 `complexes_for_conditions` + TS `rankComplexes`. | 필요한 필터·중위가를 이미 돌려준다. 같은 판정을 SQL과 TS 두 곳에 두면 3단계와 4단계 결과가 어긋난다. |
| M4a-D2 | 적합도: 필수(must) 조건을 하나라도 못 맞추면 후보에서 뺀다. 남은 단지의 `score = round(100 × 충족 조건 수 ÷ 입력한 조건 수)`(조건이 없으면 100). 정렬은 score 내림차순 → 예산 안(`within_budget` true, null, false 순) → 중위가 오름차순 → id. | 설명 가능한 단순 규칙. 가중치는 근거가 없어 넣지 않는다. |
| M4a-D3 | 단지 값이 없어 판정할 수 없는 조건은 `unmet`과 따로 `missing`으로 돌려준다(점수에서는 미충족으로 셈, `meets`의 기존 규칙과 같음). | "조건 미충족"과 "데이터 없음"을 사용자에게 다르게 보여야 오해가 없다. |
| M4a-D4 | `candidates`에는 **관심 단지(별표)만** 저장한다. 목록을 볼 때마다 20행을 쓰지 않는다. 저장 시점의 `fit_score`, `pros = met`, `cons = unmet`. 관심 해제는 그 계획의 모든 조건 세트에서 같은 단지의 `is_favorite = false`. 관심 목록은 계획 단위(`condition_sets!inner(plan_id)`)로 조회한다. | `condition_sets`가 append-only라 조건을 다시 저장하면 새 id가 생긴다. 계획 단위로 읽어야 M5 비교에서 관심 단지가 사라지지 않는다. GET 렌더에서 DB에 쓰지 않는다. |
| M4a-D5 | "주변 단지 비교"는 좌표가 없으므로 **같은 법정동** 단지(같은 면적 범위)로 한다. 화면·툴에 "같은 동 기준(거리 기준 아님)"을 표시한다. | 좌표는 M4b. |
| M4a-D6 | 교통·교육·생활 인프라와 정비사업은 `notices: ["no_location_data", "no_redevelopment_data"]`로 "데이터 준비 중"을 명시한다. | M4b·M6. 원칙 3(추정 금지). |
| M4a-D7 | 4단계 모델은 `deepseek-v4-flash` 유지(`modelForStage` 변경 없음). 후보 간 비교 판단은 M5(`pro`). | 비용 상한. 4단계 숫자는 전부 툴 결과라 모델 차이가 작다. |
| M4a-D8 | `plans.current_stage`는 관심 단지를 처음 저장할 때 4로 올린다. 3단계 화면에 "4단계 후보 보기" 링크를 둔다. | 4단계에는 폼이 없고, 렌더 중 쓰기를 피한다. |

## 용량 추정 (원칙 11)

새 데이터셋 없음. `candidates`는 관심 단지만(사용자당 수십 행 × ~200B), TIP 6행, SQL 함수 2개 → 증가 **1MB 미만**. 현재 247MB 유지.

## Global Constraints

- 모델 ID: `deepseek-v4-flash`(4단계), `deepseek-chat`·`deepseek-reasoner` 금지.
- 적합도·중위가·순위·비교 통계는 `lib/calc` 또는 SQL 집계로만. LLM은 툴 숫자와 코드만 인용한다.
- 에이전트·웹은 공공 API를 호출하지 않는다. 툴 결과 `as_of`에 `complexes:building_ledger`, `transactions:apartment` 포함.
- 툴 인자 1단 스키마, zod 검증(`defineTool`이 강제). 지역 코드는 저장된 `condition_sets.region_codes`와 `complexes.region_code`에서만 나온다. `complex_id`는 양의 정수로 검증.
- 실거래 집계 규칙은 M2·M3와 같다: `cancel_date is null`, `deal_type is distinct from '직거래'`, 기간은 KST 기준.
- 새 RPC의 `region_code` 비교가 생기면 `::char(10)`. 새 함수는 `set search_path = ''`, anon·authenticated execute(참조 데이터 읽기 전용, security invoker).
- 스키마 변경은 `supabase/migrations/*.sql`. 새 사용자 테이블 없음(`candidates` RLS "owner all"은 M1에서 이미 켜짐).
- LLM에 소득·자산 원값을 보내지 않는다. 단지명·주소·실거래가는 공개 데이터라 보내도 된다.
- 단위: 면적 ㎡, 금액 원, 날짜 KST `YYYY-MM-DD`, 월 `YYYY-MM`.
- Next.js 16 코드를 쓰기 전 `apps/web/node_modules/next/dist/docs/01-app/`의 해당 문서(searchParams, Server Actions)를 읽는다.
- 로컬 실행·테스트는 메모리 규칙대로: `.env.local` 수정·출력 금지, 로컬 Supabase `http://[::1]:54321`, env는 명령에 직접.

## Review Focus

1. **필수 조건으로 후보 0개** — 빈 목록만 보여주면 막다른 길이다. 목록이 비면 `findConflicts`의 `no_match_for_musts.blocking`을 함께 돌려 "이 조건을 선호로 바꾸면 후보가 생김"을 보여준다. (Task 3 `search_complexes returns blocking when no candidates`)
2. **최근 거래 없는 단지**(`median_price` null) — 예산 판정·가격 정렬에서 맨 뒤로 가고 `within_budget`은 null, 가격 칸은 "최근 거래 없음". (Task 2 `ranks null median last`)
3. **다른 계획·다른 사용자의 단지 id로 관심 저장** — 단지는 공개라 막을 수 없지만 `condition_set_id`는 반드시 이 계획의 최신 세트여야 하고, 계획이 남의 것이면 RLS로 `not_found`. (Task 5 `rejects plan of another user`)
4. **3단계 저장 없이 4단계 진입** — `region_required`/`conditions_required` 안내와 2·3단계 링크, 500 아님. RPC 오류도 오류 카드(M3 미룬 항목: RPC 오류 시 500). (Task 4·6)
5. **면적만 입력한 3단계** — M3에서는 `conditions_required`로 막혔다(미룬 항목). 면적도 조건으로 인정한다. (Task 1 `area only is a condition`)

---

## File Structure

```
supabase/migrations/
  20261111000000_m4a_complex_detail.sql   complex_trades, complex_monthly_prices
  20261111000100_m4a_seed_tips.sql        4단계 TIP 6개
supabase/tests/database/complex_detail.test.sql
packages/db-types/database.types.ts        재생성
apps/web/
  lib/calc/conditions.ts                   meets·activeKeys export(동작 변경 없음)
  lib/calc/fit.ts (+ .test.ts)             fitScore, rankComplexes, neighborStats
  lib/agent/tools/condition-context.ts (+ .test.ts)  loadConditionContext (check-conditions에서 추출)
  lib/agent/tools/check-conditions.ts      로더 사용으로 축소
  lib/agent/tools/search-complexes.ts (+ .test.ts)
  lib/agent/tools/get-complex-detail.ts (+ .test.ts)
  lib/agent/tools/index.ts, lib/agent/prompt.ts
  app/plans/[planId]/stage/4/page.tsx, actions.ts, actions.test.ts
  app/plans/[planId]/_components/CandidateList.tsx, ComplexDetail.tsx
  app/plans/[planId]/stage/3/page.tsx      4단계 링크
docs/superpowers/plans/2026-11-03-roadmap.md   M4a/M4b 분리 반영
docs/screenshots/m4a/
```

---

### Task 1: 공유 로더 추출과 `meets` 공개

3단계 동작은 바꾸지 않는다(면적만 입력한 경우만 고침). 이후 Task 3·4·5가 이 로더를 쓴다.

**Files:**
- Create: `apps/web/lib/agent/tools/condition-context.ts`, `condition-context.test.ts`
- Modify: `apps/web/lib/agent/tools/check-conditions.ts`, `apps/web/lib/calc/conditions.ts`

**Interfaces:**
- `conditions.ts`에서 export: `meets(c: Conditions, k: ConditionKey, x: ComplexRow): boolean`, `activeKeys(c: Conditions): ConditionKey[]`(기존 `isSet` 필터), `priorityOf(c: Conditions, k: ConditionKey): Priority`(기본 `"prefer"`). `findConflicts`는 이것들을 쓴다.
- Produces:
```ts
export type ConditionContext = {
  conditions: Conditions; conditionSetId: string; regionCodes: string[];
  budgets: RegionBudget[]; rows: ComplexRow[]; truncated: boolean;
  as_of: Record<string, string>; stale?: string[]; notices?: string[];
};
export async function loadConditionContext(ctx: ToolContext):
  Promise<ConditionContext | { error: "region_required" | "conditions_required" }>;
export const MONTHS = 12;
```
  RPC 오류는 지금처럼 throw(화면이 잡는다, Task 6).

- [ ] **Step 1: 실패하는 테스트** — `condition-context.test.ts`(`check-conditions.test.ts`의 `fakeDb` 픽스처 재사용, 필요하면 `saved`/`complex`를 `test-fixtures.ts`로 옮김):
  - `area only is a condition` — `housing_types: []`, 가격·단지 조건 전부 null, `area_min: 80` → error 아님, `rows` 반환.
  - `returns latest condition set id` — 세트 2개 중 `created_at` 최신의 `id`.
  - `region_required` — `region_codes: []`.
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test condition-context` / Expected: FAIL(모듈 없음).
- [ ] **Step 3: 구현** — `check-conditions.ts`의 조회·예산·RPC·freshness 부분을 그대로 옮기고 `stage3Empty`에 `area_min`, `area_max`를 넣는다. `check_conditions.run`은 `loadConditionContext` → `findConflicts` → 기존과 같은 반환 모양.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test` / Expected: 기존 `check-conditions.test.ts` 포함 전체 PASS.
- [ ] **Step 5: Commit** — `git commit -m "refactor(agent): 조건 컨텍스트 로더 추출, 면적만 입력해도 조건 점검"`

---

### Task 2: `lib/calc/fit.ts` — 적합도·순위·같은 동 비교

**Files:** Create `apps/web/lib/calc/fit.ts`, `fit.test.ts`

**Interfaces:**
```ts
export interface Fit {
  score: number;                 // 0~100 정수 (M4a-D2)
  met: ConditionKey[]; unmet: ConditionKey[]; missing: ConditionKey[]; // missing ⊂ unmet (M4a-D3)
  within_budget: boolean | null; // median_price ≤ 그 시군구 max_budget. 둘 중 하나라도 null이면 null
}
export type RankedComplex = ComplexRow & { fit: Fit };
export function fitScore(c: Conditions, x: ComplexRow, maxBudget: number | null): Fit;
export function rankComplexes(c: Conditions, rows: ComplexRow[], budgets: RegionBudget[], limit: number): RankedComplex[];
export interface NeighborStats { count: number; dong_median: number | null; rank: number | null; } // rank: 중위가 낮은 순 1부터, 대상 거래 없으면 null
export function neighborStats(targetId: number, rows: ComplexRow[]): NeighborStats;
```
- `maxBudget` 매칭: `budgets.find(b => b.sigungu_code === x.region_code.slice(0, 5))?.max_budget ?? null`.
- `missing` 판정 값: `price_max→median_price`, `approval_year_min→approval_year`, `household_count_min→household_count`, `parking_per_household_min→parking_per_household`, `floor_area_ratio_max→floor_area_ratio`가 null. `area`는 missing 없음(거래 0건은 unmet).
- `dong_median`은 `median_price`가 있는 단지들의 중위값(짝수 개면 두 값 평균을 반올림).

- [ ] **Step 1: 실패하는 테스트** — `fit.test.ts`:
  - `score counts met over active` — 조건 4개 중 3개 충족 → `score 75`, `met`/`unmet` 내용.
  - `no conditions scores 100`.
  - `missing is separate from unmet` — `household_count: null`이고 세대수 조건 있음 → `unmet`과 `missing`에 모두 `household_count_min`.
  - `excludes must failures` — must 미충족 단지는 `rankComplexes` 결과에 없음.
  - `ranks by score then budget then price` — 같은 score에서 `within_budget` true가 false보다 앞, 같은 예산 상태면 중위가 낮은 쪽이 앞.
  - `ranks null median last` — Review Focus 2: `median_price: null` → `within_budget: null`, 같은 score의 가격 있는 단지보다 뒤.
  - `respects limit`.
  - `neighborStats ranks target` — 중위가 [3억, 5억, 4억, null] 중 대상 5억 → `{ count: 4, dong_median: 4억, rank: 3 }`; 대상 null → `rank: null`.
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test fit` / Expected: FAIL.
- [ ] **Step 3: 구현** — `meets`, `activeKeys`, `priorityOf`를 `conditions.ts`에서 import. 정렬 비교자에서 `within_budget`은 `true=0, null=1, false=2`.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test fit` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(calc): 결정론적 단지 적합도·순위·같은 동 가격 비교"`

---

### Task 3: `search_complexes` 툴

**Files:** Create `apps/web/lib/agent/tools/search-complexes.ts`, `.test.ts`; Modify `tools/index.ts`, `lib/agent/prompt.ts`

**Interfaces:**
- 스키마: `z.object({ limit: z.number().int().min(1).max(50).default(20) })`.
- 반환 `data`: `{ candidates: RankedComplex[], total: number /*must 통과 수*/, blocking?: ConditionKey[], criteria: { months } }` 또는 로더 error. `notices`: 로더 notices + `findConflicts`의 notices 중 `no_data_for_type`·`truncated`·`land_share_is_average` + 항상 `no_location_data`.
- `blocking`은 후보 0개일 때만 `findConflicts(...).conflicts`의 `no_match_for_musts.blocking`.
- Produces: `searchComplexes` (Task 6 화면도 같은 `run`을 호출).

- [ ] **Step 1: 실패하는 테스트** — `check-conditions.test.ts`와 같은 `fakeDb` 방식:
  - `returns ranked candidates with as_of` — 단지 3개, must 하나 → 통과 단지만, `fit.score` 순, `as_of["complexes:building_ledger"]` 존재.
  - `search_complexes returns blocking when no candidates` — Review Focus 1.
  - `includes no_location_data notice`.
  - `rejects limit 0` — `runTool(searchComplexes, '{"limit":0}', ctx)`가 `{ error }`.
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test search-complexes` / Expected: FAIL.
- [ ] **Step 3: 구현** — `loadConditionContext` → `rankComplexes(…, limit)`. `toolsForStage`에 추가. `prompt.ts`: 19행(교통 데이터는 4단계에서 제공)을 "교통·학교·생활 인프라 데이터는 아직 없습니다(no_location_data). 추정하지 마세요."로 바꾸고, 규칙 추가: "후보 추천은 search_complexes 결과만 인용하고 fit.met/unmet/missing을 근거로 추천 이유와 맞지 않는 조건을 말하세요. missing은 '데이터 없음'이라고 말하세요. within_budget은 참고값입니다. candidates가 비면 blocking 조건을 '선호'로 바꾸는 방법을 안내하세요."
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test` / Expected: 전체 PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(agent): search_complexes 툴 — 적합도 순 후보 단지"`

---

### Task 4: 단지 상세 RPC와 `get_complex_detail` 툴

**Files:**
- Create: `supabase/migrations/20261111000000_m4a_complex_detail.sql`, `supabase/tests/database/complex_detail.test.sql`, `apps/web/lib/agent/tools/get-complex-detail.ts`, `.test.ts`
- Modify: `packages/db-types/database.types.ts`, `tools/index.ts`, `prompt.ts`

**Interfaces:**
- `public.complex_trades(p_complex_id bigint, area_min numeric default null, area_max numeric default null, lim int default 20) returns table (deal_date date, deal_amount bigint, exclusive_area numeric, floor smallint)` — 실거래 집계 규칙(Global Constraints) 적용, `deal_date desc, id desc`, `lim` 1~50 밖이면 `22023`.
- `public.complex_monthly_prices(p_complex_id bigint, area_min numeric default null, area_max numeric default null, months int default 24) returns table (month text /*YYYY-MM*/, median_price bigint, deal_count int)` — 거래 있는 달만, 오름차순. `months` 1~36 밖이면 `22023`.
- 둘 다 `stable`, security invoker, `set search_path = ''`, anon·authenticated execute. 인덱스는 기존 `transactions_complex_date_idx` 사용.
- 툴 스키마: `z.object({ complex_id: z.number().int().positive() })`. 면적 범위는 최신 조건 세트의 `area_min/area_max`(로더에서).
- 반환 `data`: `{ complex: { id, name, region_code, jibun_address, road_address, approval_year, household_count, building_count, parking_per_household, floor_area_ratio, building_coverage_ratio, land_share_m2 }, fit: Fit | null, trades, monthly, neighbors: NeighborStats & { basis: "same_dong" }, criteria: { area_min, area_max, months: 24 } }` 또는 `{ error: "complex_not_found" }`. `notices`: `no_location_data`, `no_redevelopment_data`, `land_share_is_average`, 거래 0건이면 `no_recent_trades`.
- `fit`은 이 단지가 `ctx.rows`에 있으면 `fitScore`, 없으면(희망 지역 밖) null. `neighbors`는 `complexes_for_conditions([complex.region_code], area_min, area_max, 12)` + `neighborStats`.
- Produces: `getComplexDetail` (Task 6 화면도 호출).

- [ ] **Step 1: 실패하는 pgTAP** — `complex_detail.test.sql`(`complexes.test.sql` 시드 형식). 단지 A에 거래 5건(1건 해제, 1건 직거래, 1건 면적 범위 밖, 2건 정상·서로 다른 달):
  - `complex_trades(A)` 3건(해제·직거래 제외), 최신순; `area_max`로 2건.
  - `complex_monthly_prices(A)` 2행, `month` 형식 `YYYY-MM`.
  - `lim 0`·`months 37` → `throws_ok '22023'`.
  - `anon` 역할로 두 함수 실행 가능.
- [ ] **Step 2: 실패 확인** — Run: `supabase test db` / Expected: `complex_detail.test.sql` FAIL.
- [ ] **Step 3: 마이그레이션 작성 후 통과 확인** — Run: `supabase db reset && supabase test db` / Expected: 전체 PASS.
- [ ] **Step 4: 타입 재생성** — Run: `supabase gen types typescript --local > packages/db-types/database.types.ts && grep -c "complex_trades\|complex_monthly_prices" packages/db-types/database.types.ts` / Expected: 2 이상.
- [ ] **Step 5: 실패하는 툴 테스트** — `get-complex-detail.test.ts`:
  - `returns detail with neighbors and notices` — rpcs 목: `complex_trades`, `complex_monthly_prices`, `complexes_for_conditions`; `neighbors.basis === "same_dong"`, notices에 `no_location_data`·`no_redevelopment_data`.
  - `complex_not_found` — 없는 id.
  - `fit null outside desired region`.
  - `rejects non-integer id` — `runTool(..., '{"complex_id":1.5}')` → `{ error }`.
- [ ] **Step 6: 구현과 통과 확인** — `complexes`는 `from("complexes").select(...).eq("id", …).maybeSingle()`. 로더가 error를 주면(3단계 미저장) 면적 null로 진행하고 `fit: null`. `toolsForStage`에 추가. `prompt.ts` 규칙: "단지 상세는 get_complex_detail 결과만 인용하세요. 실거래가는 호가가 아니며, 면적과 층을 함께 비교하라고 말하세요. neighbors는 같은 법정동 기준이며 거리 기준이 아닙니다. no_redevelopment_data면 정비사업 진행 상황은 지자체에서 확인하라고 말하세요." Run: `pnpm --filter web test` / Expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat: 단지 실거래 사례·월별 추이 RPC와 get_complex_detail 툴"`

---

### Task 5: 관심 단지 저장 (server action)

**Files:** Create `apps/web/app/plans/[planId]/stage/4/actions.ts`, `actions.test.ts`

**Interfaces:**
```ts
export async function setFavorite(planId: string, complexId: number, favorite: boolean):
  Promise<{ ok: true } | { ok: false; error: "invalid" | "not_found" | "conditions_required" }>;
export async function favoriteComplexIds(planId: string): Promise<number[]>;
export async function searchForPlan(planId: string): Promise<ToolResult>;      // searchComplexes.run
export async function detailForPlan(planId: string, complexId: number): Promise<ToolResult>; // getComplexDetail.run
```
- `favorite=true`: `loadConditionContext` → 최신 `conditionSetId`; 그 단지가 `rows`에 있으면 `fitScore`(maxBudget은 Task 2의 시군구 매칭 규칙)로 `fit_score/pros/cons`, 없으면 null·`[]`. `candidates.upsert({...}, { onConflict: "condition_set_id,complex_id" })`. 이어서 `plans.update({ current_stage: 4 }).eq("id", planId).lt("current_stage", 4)`(M4a-D8).
- `favorite=false`: `candidates.update({ is_favorite: false }).eq("complex_id", id).in("condition_set_id", <이 계획의 세트 id들>)`.
- `favoriteComplexIds`: `candidates.select("complex_id, condition_sets!inner(plan_id)").eq("condition_sets.plan_id", planId).eq("is_favorite", true)` → 중복 제거.
- 입력 검증은 3단계 `actions.ts`처럼 zod(`z.uuid()`, `z.number().int().positive()`), `createClient`는 지연 import(테스트가 import할 수 있게).
- 오류 코드 `23503`·`42501` → `not_found`(3단계와 같은 매핑).

- [ ] **Step 1: 실패하는 테스트** — `actions.test.ts`(3단계 `actions.test.ts` 방식으로 `@/lib/supabase/server`를 vi.mock):
  - `rejects invalid ids` — planId `"x"`, complexId `0` → `invalid`, DB 호출 없음.
  - `upserts with fit from latest set` — upsert 인자에 최신 `condition_set_id`, `is_favorite: true`, `fit_score` 숫자, onConflict 문자열.
  - `rejects plan of another user` — Review Focus 3: insert가 `{ code: "42501" }` → `not_found`.
  - `unfavorite clears all sets of plan`.
- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter web test stage/4` / Expected: FAIL.
- [ ] **Step 3: 구현** — 위 인터페이스대로.
- [ ] **Step 4: 통과 확인** — Run: `pnpm --filter web test` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(stage4): 관심 단지 저장·해제 server action"`

---

### Task 6: 4단계 화면과 TIP 6종

**Files:**
- Create: `app/plans/[planId]/stage/4/page.tsx`, `_components/CandidateList.tsx`, `_components/ComplexDetail.tsx`, `supabase/migrations/20261111000100_m4a_seed_tips.sql`
- Modify: `app/plans/[planId]/stage/3/page.tsx`(4단계 링크), `supabase/tests/database/tips.test.sql`(4단계 6개 단언)

**화면 구성(한 페이지, `?complex=<id>`로 상세 선택):**
- 왼쪽 `CandidateList`: 순위, 단지명·법정동, 적합도 점수, 최근 12개월 중위가(`formatWon`, 없으면 "최근 거래 없음"), 거래 건수, 승인연도, 세대수, 예산 안/밖/판단 불가 배지, 충족 조건(초록)·맞지 않는 조건(회색)·데이터 없음(점선) 칩(`CONDITION_LABELS` 재사용), 별표 버튼(`setFavorite` form action), 행을 누르면 `?complex=id`. 관심 단지는 목록 위에 따로 묶는다. 후보 0개면 `blocking` 안내와 3단계 링크. 로더 error면 `ConditionCheckCard`의 `ERRORS` 문구와 2·3단계 링크. `searchForPlan`이 throw하면 try/catch로 "후보를 불러오지 못했습니다" 카드(Review Focus 4).
- 오른쪽 `ComplexDetail`(`complex`가 있을 때): 기본 정보, 적합도, 실거래 사례 표(계약일·금액·전용면적·층), 월별 추이 표(월·중위가·건수 — 차트는 넣지 않음), 같은 동 비교("같은 동 N개 단지 중 중위가 낮은 순 k위, 동 중위값 X — 거리 기준 아님"), "교통·학교·생활 인프라: 데이터 준비 중", "정비사업 진행 상황: 데이터 준비 중", 데이터 기준일. 그 아래 `ChatPanel`.
- TIP(`stage = 4`, `TipPanel`의 `fieldKey`): `deal-vs-asking`(field `trades`) 실거래가와 호가의 차이, `compare-area-floor`(`trades`) 면적·층을 함께 봐야 하는 이유, `price-gap-between-complexes`(`neighbors`) 단지별 가격 차이의 원인, `location-and-price`(`neighbors`) 입지와 주택 가격의 관계, `limits-of-deal-price`(`monthly`) 실거래가만으로 적정 가격을 판단하기 어려운 이유, `redevelopment-stages-4`(`redevelopment`) 재개발·재건축 사업 단계별 의미(3단계 `rebuild-stages`와 겹치지 않게 재개발 쪽 단계와 "단계별로 무엇이 확정되는지" 중심). 각 TIP은 body·caution을 쓰고, 법령 조문은 확인하지 않았으면 `source` null(M3와 같음). 투자 권유·단정 표현 금지.

- [ ] **Step 1: 문서 확인** — `apps/web/node_modules/next/dist/docs/01-app/`에서 page `searchParams`(Promise)와 Server Actions in forms 문서를 읽고, 3단계 `page.tsx`의 `connection()`·`instant = false`·`z.uuid()` 패턴을 따른다. `complex` 쿼리는 `z.coerce.number().int().positive()`로 검증하고 실패하면 상세 없이 렌더.
- [ ] **Step 2: TIP 시드 실패 테스트** — `tips.test.sql`에 `select is((select count(*)::int from public.tips where stage = 4), 6)` 추가. Run: `supabase test db` / Expected: FAIL.
- [ ] **Step 3: TIP 마이그레이션 작성 후 통과** — Run: `supabase db reset && supabase test db` / Expected: PASS.
- [ ] **Step 4: 화면 구현** — 위 구성대로. 3단계 페이지 오른쪽 카드 아래에 `→ 4단계 후보 단지 보기` 링크.
- [ ] **Step 5: 정적 검사** — Run: `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test` (스크립트 이름은 `apps/web/package.json` 기준) / Expected: 오류 없음.
- [ ] **Step 6: Commit** — `git commit -m "feat(stage4): 후보 단지 목록·상세 화면과 TIP 6종"`

---

### Task 7: 로컬 실행 확인, 문서, 원격 반영

- [ ] **Step 1: 로컬 실행** — 로컬 Supabase(실거래·단지 데이터가 있는 상태, 없으면 메모리 [[local-dev-environment]] 절차로 강남구 적재)에서 `pnpm --filter web dev`. 계획 생성 → 1~3단계 저장(강남구, 면적 80~90, 세대수 must) → 4단계: 후보 목록, 상세(`?complex=`), 별표 저장 후 새로고침해도 유지, 3단계 조건 재저장 후에도 관심 단지 유지(M4a-D4), 별표 해제. 채팅에서 "후보 추천해줘", "이 단지 자세히" → 툴 호출과 숫자가 화면과 같은지 확인. 스크린샷을 `docs/screenshots/m4a/`에 저장.
- [ ] **Step 2: 원격 성능 확인(읽기만)** — 원격에서 가장 큰 시군구 하나로 `explain analyze select * from public.complex_monthly_prices(<단지 id>)`와 `complexes_for_conditions(array['<법정동>'])`가 1초 이내인지 확인. 넘으면 멈추고 알린다(statement timeout 약 8초, M3 함정).
- [ ] **Step 3: 로드맵 수정** — `2026-11-03-roadmap.md` M4를 M4a(이 계획 링크, `search_complexes` RPC 대신 TS 순위 — M4a-D1)와 M4b(좌표 D6·역·학교 POI·`complex_nearby_pois`·K-apt 관리비, 키·활용신청·fixture 확인부터)로 나눈다.
- [ ] **Step 4: Commit·PR** — `git commit -m "docs: M4a 스크린샷, 로드맵 M4a/M4b 분리"` 후 PR. 본문에 결정 사항, 실행한 명령과 출력, 원격 마이그레이션 적용은 머지 후 사용자 확인을 받아 `supabase db push`로 한다는 점.
