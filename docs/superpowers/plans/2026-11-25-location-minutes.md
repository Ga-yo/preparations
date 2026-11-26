# 입지 소요시간(분) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4단계 상세와 5단계 비교표의 입지 정보를 직선 m에서 "출근 n분"과 "약 도보 n분"으로 바꾸고, 공원 이름을 보여준다.

**Architecture:**
- 도보 분은 `lib/calc/walk.ts`의 순수 함수로 직선거리에서 계산한다.
- 출퇴근 시간은 단지 하나를 볼 때 클라이언트 훅 `useCommute`가 구한다.
  - 대중교통이면 ODsay를 브라우저에서 직접 호출한다.
  - 자차이면 서버 액션을 거쳐 카카오모빌리티 미래 경로 API를 호출한다.
  - 결과는 `sessionStorage`에만 저장한다.
- 좌표(단지, 출퇴근지)는 새 RPC `route_points`가 준다. 출퇴근지 좌표 규칙은 기존 `complexes_for_conditions`와 같은 SQL 함수 `commute_point_of`로 묶는다.

**Tech Stack:** Next.js 16 App Router, TypeScript, zod 4, vitest 5, Supabase(PostGIS, pgTAP)

**Spec:** `docs/superpowers/specs/2026-11-25-location-minutes-design.md`

## Global Constraints

- `KAKAO_MOBILITY_REST_KEY`는 서버 전용이다. `"use server"` 파일과 `lib/route/kakao.ts`에서만 읽는다. NEXT_PUBLIC 금지.
- `NEXT_PUBLIC_ODSAY_API_KEY`는 Web 키다. 등록 도메인은 `https://preparations-cyan.vercel.app`, `http://localhost:3000`이다.
- 키는 URL 쿼리에 들어간다(ODsay `apiKey=`). 예외나 로그에 URL을 남기지 않는다. 실패 시 상태코드와 오류 코드만 쓴다.
- 경로 결과는 원격 DB에 저장하지 않고, LLM에 보내지 않는다. 외부로 보내는 것은 좌표 두 개뿐이다.
- 자차는 "평일 오전 8시 출발 기준"이다. KST로 계산한다(Vercel 서버는 UTC).
- 실패 시 문구는 "소요시간을 확인하지 못했어요"다. 숫자를 지어내지 않는다.
- 도보 표기는 "약 도보 n분"이다. 각주는 "직선거리 기반 추정"이다.
- 출퇴근 정렬은 기존 `commute_m`(직선)을 그대로 쓴다. 화면에서 직선 m 표기만 없앤다.
- 원격 DB 반영은 머지 후 사용자가 `supabase db push`로 한다. Vercel 환경변수 등록도 사용자가 한다.

## Review Focus

1. **출발지와 도착지가 700m 안쪽인 경우:** ODsay는 경로 대신 오류(code `-98`)를 준다. "가까워서 걸어갈 수 있는 거리예요 (약 도보 n분)"으로 보여준다. 카카오의 `result_code 104`(5m 이내)도 같다. → Task 3 테스트
2. **sessionStorage를 쓸 수 없는 경우(사파리 개인 정보 보호 모드 등):** 접근이 throw해도 화면은 정상이고, 매번 호출만 한다. → Task 3 테스트
3. **출근 시간 계산이 KST 기준이어야 한다.** 금요일 KST 09:00이면 다음 주 월요일 08:00이다. UTC로 계산하면 날짜가 밀린다. → Task 3 테스트
4. **좌표가 없는 단지, 또는 단지가 없어 중심점이 null인 출퇴근 지역:** 호출하지 않고 "소요시간을 확인하지 못했어요"를 보여준다. → Task 4 테스트
5. **남의 plan id나 잘못된 complexId로 서버 액션을 호출하는 경우:** RLS로 행이 안 보이면 카카오를 호출하지 않고 `unavailable`을 돌려준다. → Task 4 테스트

---

### Task 1: 도보 분 계산 함수

**Files:**
- Create: `apps/web/lib/calc/walk.ts`
- Test: `apps/web/lib/calc/walk.test.ts`

**Interfaces:**
- Produces: `walkMinutes(straightM: number): number`, `WALK_DETOUR: number`, `WALK_M_PER_MIN: number`, `WALK_SOURCE: string`

- [ ] **Step 1: 계수 출처 확정**
  - 우회 계수와 분당 보행 거리의 공식 출처(국토부·서울시 지침, 도로용량편람, 학술 논문 등)를 찾아 `WALK_SOURCE`에 문서명과 조항(쪽)을 적는다.
  - 출처를 못 찾으면 **여기서 멈추고 사용자에게 알린다.** 흔히 쓰는 1.3, 67m/분을 출처 없이 쓰지 않는다.
- [ ] **Step 2: 실패하는 테스트 작성**

```ts
test("walkMinutes: 확정한 계수로 올림", () => {
  expect(walkMinutes(400)).toBe(Math.ceil((400 * WALK_DETOUR) / WALK_M_PER_MIN));
});
test("walkMinutes: 0m도 최소 1분", () => expect(walkMinutes(0)).toBe(1));
test("walkMinutes: 거리가 늘면 분도 줄지 않는다", () => expect(walkMinutes(1000)).toBeGreaterThanOrEqual(walkMinutes(999)));
test("WALK_SOURCE가 비어 있지 않다", () => expect(WALK_SOURCE.length).toBeGreaterThan(5));
```

  - Step 1에서 확정한 값으로 계산한 기대값 하나를 숫자로 하드코딩한 테스트도 추가한다(예: 계수 1.3, 67m/분이면 `walkMinutes(400) === 8`).
- [ ] **Step 3:** `pnpm --filter web test walk` → FAIL (모듈 없음)
- [ ] **Step 4: 구현**
  - `walkMinutes = max(1, ceil(m × WALK_DETOUR ÷ WALK_M_PER_MIN))`
  - 상수 위에 출처 한 줄 주석을 단다.
- [ ] **Step 5:** `pnpm --filter web test walk` → PASS
- [ ] **Step 6: 커밋** `feat(calc): 직선거리 → 약 도보 n분 환산`

### Task 2: DB — 공원 이름, 경로 좌표 RPC

**Files:**
- Create: `supabase/migrations/20261125000000_route_points.sql`
- Create: `supabase/tests/database/route_points.test.sql`
- Modify: `packages/db-types/database.types.ts` (재생성)
- Modify: `apps/web/lib/calc/conditions.ts:23-29` (`ComplexRow`에 `nearest_park_name: string | null`)
- Modify: `ComplexRow`를 만드는 테스트 픽스처 전부 (`grep -rln "nearest_park_m" apps/web/lib apps/web/app | grep test`)

**Interfaces:**
- Produces (SQL):
  - `public.commute_point_of(commute_code text, commute_station text) returns extensions.geography`
    - 둘 다 null이면 null
    - 역이 있으면 역 기준(기존 우선순위와 같다)
    - 규칙은 `20261124000000_commute_station.sql:52-63`을 그대로 옮긴다.
  - `public.complexes_for_conditions(...)`: 인자는 그대로, 반환 컬럼 끝에 `nearest_park_name text`를 추가한다.
    - 반환 타입이 바뀌므로 drop 후 create한다. 본문은 최신 정의를 복사하고 commute_point만 `commute_point_of`로 바꾼다.
    - 공원 lateral에서 `q.name`도 꺼낸다.
    - 끝의 revoke/grant는 같게 둔다.
  - `public.route_points(p_complex_id bigint, commute_code text default null, commute_station text default null) returns table (from_lon float8, from_lat float8, to_lon float8, to_lat float8)`
    - 단지 좌표나 출퇴근 좌표가 null이면 **0행**을 돌려준다.
    - 인자 검증은 `complexes_for_conditions`와 같은 22023 규칙을 따른다.
    - `security invoker`, `set search_path = ''`, `grant execute to anon, authenticated`

- [ ] **Step 1: 실패하는 pgTAP 테스트 작성** (`route_points.test.sql`, 기존 `region_prices.test.sql`처럼 fixture insert)
  - 공원 하나와 단지 하나: `complexes_for_conditions`의 `nearest_park_name` = 그 공원 이름
  - 역 이름으로 `route_points` → 1행. `to_lon`/`to_lat` = 역 좌표, `from_*` = 단지 좌표(소수 5자리 비교)
  - 지역 코드로 `route_points` → 그 지역 단지 중심
  - location이 null인 단지 → 0행
  - `commute_code = 'abc'` → `throws_ok(..., '22023')`
- [ ] **Step 2:** `supabase migration up --local && supabase test db` → 새 테스트 FAIL (함수 없음). **`db reset` 금지.**
- [ ] **Step 3: 마이그레이션 작성** (위 Interfaces 대로)
- [ ] **Step 4:** `supabase migration up --local && supabase test db` → 전부 PASS (기존 테스트 포함)
- [ ] **Step 5: 타입 재생성과 ComplexRow 추가**
  - `supabase gen types typescript --local > packages/db-types/database.types.ts`
  - `ComplexRow`와 픽스처에 `nearest_park_name`을 넣는다.
  - `pnpm typecheck && pnpm test` → PASS
- [ ] **Step 6: 커밋** `feat(db): 가까운 공원 이름, 경로 좌표 route_points`

### Task 3: 경로 응답 파싱, 캐시, 출발 시각 (순수 함수)

**Files:**
- Create: `apps/web/lib/route/commute.ts`
- Test: `apps/web/lib/route/commute.test.ts`

**Interfaces:**
- Consumes: `walkMinutes` (Task 1)
- Produces:

```ts
export type CommuteMode = "transit" | "car";
export type CommuteTarget = { mode: CommuteMode; key: string; label: string };
export type RoutePoints = { from_lon: number; from_lat: number; to_lon: number; to_lat: number };
export type CommuteResult =
  | { status: "ok"; mode: CommuteMode; minutes: number; transfers: number | null }
  | { status: "near"; walkMinutes: number }
  | { status: "unavailable" };
export function commuteTarget(c: { uses_transit: boolean | null; commute_station: string | null; commute_region_code: string | null }): CommuteTarget | null;
export function parseOdsay(json: unknown, straightM: number): CommuteResult;
export function parseKakao(json: unknown, straightM: number): CommuteResult;
export function nextWeekday0800Kst(now: Date): string; // "YYYYMMDDHHmm"
export function straightMeters(p: RoutePoints): number; // 하버사인
export function cacheKey(t: CommuteTarget, complexId: number): string;
export function readCache(key: string): CommuteResult | null;  // 실패하면 null, throw 안 함
export function writeCache(key: string, v: CommuteResult): void; // 실패하면 무시
```

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
test("commuteTarget: 대중교통 체크면 transit, 아니면(null 포함) car, 출퇴근지 없으면 null", () => {
  expect(commuteTarget({ uses_transit: true, commute_station: "강남", commute_region_code: null })).toEqual({ mode: "transit", key: "station:강남", label: "강남역" });
  expect(commuteTarget({ uses_transit: null, commute_station: null, commute_region_code: "1168010100" })?.mode).toBe("car");
  expect(commuteTarget({ uses_transit: true, commute_station: null, commute_region_code: null })).toBeNull();
});
test("parseOdsay: totalTime, 환승 = 버스+지하철 탑승 − 1", () => {
  const ok = { result: { path: [{ info: { totalTime: 28, busTransitCount: 0, subwayTransitCount: 3 } }] } };
  expect(parseOdsay(ok, 12000)).toEqual({ status: "ok", mode: "transit", minutes: 28, transfers: 2 });
});
test("parseOdsay: -98(700m 이내)은 near", () => {
  expect(parseOdsay({ error: { code: "-98", msg: "x" } }, 400)).toEqual({ status: "near", walkMinutes: walkMinutes(400) });
});
test("parseOdsay: 다른 오류나 이상한 모양은 unavailable", () => {
  expect(parseOdsay({ error: [{ code: "500", message: "[ApiKeyAuthFailed]" }] }, 5000).status).toBe("unavailable");
  expect(parseOdsay(null, 5000).status).toBe("unavailable");
});
test("parseKakao: duration 초 → 분 반올림, 104는 near, 그 외 result_code는 unavailable", () => {
  expect(parseKakao({ routes: [{ result_code: 0, summary: { duration: 1527 } }] }, 12000)).toEqual({ status: "ok", mode: "car", minutes: 25, transfers: null });
  expect(parseKakao({ routes: [{ result_code: 104 }] }, 3).status).toBe("near");
  expect(parseKakao({ routes: [{ result_code: 103 }] }, 9000).status).toBe("unavailable");
});
test("nextWeekday0800Kst: KST 기준 다음 평일 08:00", () => {
  expect(nextWeekday0800Kst(new Date("2026-11-25T03:00:00Z"))).toBe("202611260800"); // 수 12시 KST → 목
  expect(nextWeekday0800Kst(new Date("2026-11-27T00:00:00Z"))).toBe("202611300800"); // 금 09시 KST → 월
  expect(nextWeekday0800Kst(new Date("2026-11-26T22:30:00Z"))).toBe("202611300800"); // 금 07:30 KST → 월 (당일 8시 전이라도 '다음' 평일)
});
test("readCache/writeCache: sessionStorage가 throw해도 null·무시", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } });
  expect(readCache("k")).toBeNull();
  expect(() => writeCache("k", { status: "unavailable" })).not.toThrow();
});
test("unavailable은 캐시하지 않는다", () => { /* Map 기반 stub로 writeCache 후 getItem 호출 0회 */ });
```

  - "다음 평일"은 항상 내일 이후로 한다. 오늘 8시 이전이라도 그렇게 해서 경계를 단순하게 둔다.
  - `unavailable`은 일시적일 수 있어 저장하지 않는다. 다시 열면 재시도한다.
- [ ] **Step 2:** `pnpm --filter web test route/commute` → FAIL
- [ ] **Step 3: 구현** (위 시그니처)
  - ODsay의 오류 모양은 `error: {code,msg}`와 `error: [{code,message}]` 두 가지 다 처리한다.
  - `label`은 역이면 `${이름}역`, 지역이면 `"출퇴근 지역"`이다. 지역명 변환은 이번 범위 밖이다.
- [ ] **Step 4:** `pnpm --filter web test route/commute` → PASS
- [ ] **Step 5: 커밋** `feat(route): 길찾기 응답 파싱·세션 캐시·평일 8시 출발 시각`

### Task 4: 서버 액션 (좌표, 자차) + 키 문서화

**Files:**
- Create: `apps/web/app/plans/[planId]/commute-actions.ts` (`"use server"`)
- Test: `apps/web/app/plans/[planId]/commute-actions.test.ts` (기존 `stage/4/actions.test.ts`의 fakeDb·mock 방식)
- Modify: `apps/web/.env.example`
  - `NEXT_PUBLIC_ODSAY_API_KEY=` 주석: "Web 키, 등록 도메인에서만 동작, 공개돼도 됨"
  - `KAKAO_MOBILITY_REST_KEY=` 주석: "서버 전용, NEXT_PUBLIC 금지"
- Modify: `claude.md` (리포 루트, git상 소문자)
  - 원칙 3: "단지 상세·비교에서 출퇴근 소요시간만 ODsay·카카오모빌리티를 실시간 호출한다. 결과는 브라우저 sessionStorage에만 두고 DB·LLM에 보내지 않는다(2026-11-25)."
  - 원칙 8: "ODsay Web 키는 도메인 제한 공개 키라 NEXT_PUBLIC 예외."
  - 2단계 '희망 출퇴근 시간'의 "환산 계수 출처 확인 후" 줄에 Task 1의 출처를 적는다.

**Interfaces:**
- Consumes: `route_points` RPC (Task 2), `commuteTarget`, `parseKakao`, `nextWeekday0800Kst`, `straightMeters`, `RoutePoints`, `CommuteResult` (Task 3)
- Produces:
  - `commutePoints(planId: string, complexId: number): Promise<RoutePoints | null>`: 브라우저의 ODsay 호출용
  - `carCommute(planId: string, complexId: number): Promise<CommuteResult>`

- [ ] **Step 1: 실패하는 테스트 작성** (`fetch`는 `vi.stubGlobal`로 대체)
  - 잘못된 planId(uuid 아님)나 complexId(0, 1.5) → `commutePoints`는 null, `carCommute`는 `{status:"unavailable"}`, fetch 0회
  - 최신 condition_sets에 출퇴근지가 없거나, 남의 plan이라 행이 없음 → null / unavailable, fetch 0회
  - `route_points`가 0행(좌표 없음) → null / unavailable, fetch 0회
  - 정상: fetch URL이 `https://apis-navi.kakaomobility.com/v1/future/directions`로 시작하고, `origin=from_lon,from_lat`, `destination=to_lon,to_lat`, `departure_time=nextWeekday0800Kst(now)`, `summary=true`를 담고, 헤더가 `Authorization: KakaoAK <env 값>`이다. 응답 `duration 1527` → `{status:"ok",mode:"car",minutes:25,transfers:null}`
  - fetch가 reject하거나 `res.ok=false` → unavailable. 이때 `console.error`에 URL이 찍히지 않는다(spy로 인자 검사).
  - 서버에서 `KAKAO_MOBILITY_REST_KEY`가 없으면 → unavailable
- [ ] **Step 2:** `pnpm --filter web test commute-actions` → FAIL
- [ ] **Step 3: 구현**
  - zod로 `z.uuid()`, `z.number().int().positive()`를 검증한다.
  - condition_sets 최신 행에서 `commute_station, commute_region_code`만 읽는다. `loadConditionContext`는 단지 전체를 읽어 무거우니 쓰지 않는다.
  - `route_points`를 호출한다.
  - 카카오 fetch에 `AbortSignal.timeout(5000)`을 건다.
  - 사용자별 하루 상한은 두지 않는다. 대신 주석을 단다: `// shortcut: 사용자별 하루 호출 상한 없음, 무료 쿼터 소진이 보이면 chat_usage처럼 카운터 테이블 추가`
- [ ] **Step 4:** `pnpm --filter web test commute-actions && pnpm typecheck` → PASS
- [ ] **Step 5: 커밋** `feat(route): 출퇴근 좌표·자차 소요시간 서버 액션, 원칙 3 예외 문서화`

### Task 5: 클라이언트 훅과 표시 컴포넌트

**Files:**
- Create: `apps/web/app/plans/[planId]/_components/Commute.tsx` (`"use client"`)
- Modify: `apps/web/lib/agent/tools/condition-context.ts`: `ConditionContext`에 `commuteTarget: CommuteTarget | null`을 추가한다. 이미 읽은 `c`로 `commuteTarget(c)`를 계산한다.

**Interfaces:**
- Consumes: Task 3 전부, `commutePoints`, `carCommute` (Task 4)
- Produces: `<Commute planId={string} complexId={number} target={CommuteTarget} />`. 한 줄 텍스트를 렌더한다.
  - ok·transit: `"강남역까지 대중교통 28분 · 환승 2회"` (환승 0이면 `"환승 없음"`)
  - ok·car: `"출퇴근 지역까지 자차 25분 (평일 오전 8시 출발 기준)"`
  - near: `"가까워서 걸어갈 수 있는 거리예요 (약 도보 n분)"`
  - unavailable: `"소요시간을 확인하지 못했어요"`
  - 조회 중: `"소요시간 확인 중…"`. 캐시가 있으면 이 단계 없이 바로 결과를 보여준다.

- [ ] **Step 1: 구현**
  - `useEffect`에서 `readCache(cacheKey(target, complexId))`를 먼저 본다.
  - 캐시가 없으면:
    - transit: `commutePoints` → 브라우저에서 `fetch("https://api.odsay.com/v1/api/searchPubTransPathT?SX&SY&EX&EY&apiKey=" + encodeURIComponent(key))` → `parseOdsay(json, straightMeters(points))`
    - car: `carCommute`
  - 결과를 `writeCache`한다.
  - 컴포넌트가 사라지면 늦게 온 응답은 버린다(`let alive = true` 패턴).
  - `NEXT_PUBLIC_ODSAY_API_KEY`가 없으면 unavailable이다.
  - 훅 로직은 Task 3의 순수 함수로 이미 테스트되었으므로 이 컴포넌트는 따로 테스트하지 않는다.
- [ ] **Step 2: 실제 확인**
  - `pnpm dev`를 띄우고, 출퇴근역을 입력한 계획의 4단계 상세를 연다(Task 6 이후 연결되면 그때 확인해도 된다).
- [ ] **Step 3:** `pnpm typecheck && pnpm test` → PASS
- [ ] **Step 4: 커밋** `feat(route): 출퇴근 소요시간 클라이언트 컴포넌트(세션 캐시)`

### Task 6: 화면 연결 (4단계 목록·상세, 5단계 비교표)

**Files:**
- Modify: `apps/web/app/plans/[planId]/_components/format.ts:12-22`
  - `livingText(r: { nearest_park_name: string | null; nearest_park_m: number | null; shop_count_500m: number | null })`
  - 출퇴근을 빼고 `"${공원명} 약 도보 n분 · 반경 500m 생활 상가 n곳"`으로 만든다. 공원 이름이 null이면 `"공원 약 도보 n분"`이다.
- Modify: `apps/web/app/plans/[planId]/_components/format.test.ts:9-14`
- Modify: `apps/web/app/plans/[planId]/stage/4/_components/CandidateList.tsx:30`
  - `"역 ${이름} 약 도보 n분 · 초등학교 약 도보 n분"`
- Modify: `apps/web/lib/agent/tools/get-complex-detail.ts`
  - `near`에 `nearest_park_name`을 추가한다.
  - `data.commute = ok ? l.commuteTarget : null`
- Modify: `apps/web/app/plans/[planId]/stage/4/_components/ComplexDetail.tsx:70-84`
  - 제목 `"주변 시설 (1km 이내)"`
  - 표 열 "직선거리" → "도보", 셀 `약 ${walkMinutes(d)}분`
  - 각주 `"도보 시간은 직선거리 기반 추정입니다."`
  - 표 위에 `data.commute`가 있으면 `<Commute …/>`를 둔다.
  - `livingText` 줄은 그대로 둔다.
- Modify: 5단계 데이터
  - `CompareData`에 `commute: CommuteTarget | null`을 추가하고, 5단계 page/actions에서 `loadConditionContext`의 `commuteTarget`을 넣는다.
- Modify: `apps/web/app/plans/[planId]/stage/5/_components/CompareTable.tsx:40-43,97`
  - group `"입지"`
  - `station` → `"가까운 역"`, `${이름} 약 도보 n분` (metric은 그대로 `nearest_station_m`. 유리 판정은 거리 기준이라 같다)
  - `school` → `"가까운 초등학교"`, 약 도보 n분
  - `commute` → `"출퇴근"`
    - `data.commute`가 있으면 `<Commute planId complexId={r.complex_id} target={data.commute} />`
    - 없으면 줄을 숨긴다(`lines`에서 뺀다).
  - `park` → `"가까운 공원"`, `${공원명} 약 도보 n분`
  - 하단 문구 `"거리는 직선거리입니다."` → `"도보 시간은 직선거리 기반 추정입니다."`

- [ ] **Step 1: 테스트 수정**

```ts
expect(livingText({ nearest_park_name: "도곡공원", nearest_park_m: 210, shop_count_500m: 42 }))
  .toBe(`도곡공원 약 도보 ${walkMinutes(210)}분 · 반경 500m 생활 상가 42곳`);
expect(livingText({ nearest_park_name: null, nearest_park_m: 210, shop_count_500m: null })).toBe(`공원 약 도보 ${walkMinutes(210)}분`);
expect(livingText({ nearest_park_name: null, nearest_park_m: null, shop_count_500m: null })).toBeNull();
```

  - `get-complex-detail.test.ts`에 다음을 추가한다: 출퇴근지가 있는 픽스처 → `data.commute.mode`, 출퇴근지가 없으면 `data.commute === null`
- [ ] **Step 2:** `pnpm --filter web test format get-complex-detail` → FAIL
- [ ] **Step 3: 위 파일 수정**
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm test` → PASS
- [ ] **Step 5: 실제 확인**
  - `pnpm dev`를 띄우고 다음을 확인한다. 스크린샷 방법은 메모리 [[condition-check-popup-pr30]]를 따른다.
  - 대중교통 체크한 계획 → 4단계 상세 '주변·교통'에 "○○역까지 대중교통 n분 · 환승 n회"
  - 탭을 다시 열거나 새로고침 → "확인 중…" 없이 바로 표시
  - 대중교통 체크를 해제한 계획 → "자차 n분 (평일 오전 8시 출발 기준)"
  - 5단계 비교표 입지 묶음 → 분 표시, 공원 이름
  - 출퇴근지를 비운 계획 → 출퇴근 줄 없음
- [ ] **Step 6: 커밋** `feat(stage4,5): 입지를 소요시간·도보 분으로, 공원 이름 표시`

---

## 머지 후 사용자 할 일
1. `supabase db push` (Task 2 마이그레이션). 그 전에는 원격에서 `nearest_park_name`과 `route_points`가 없어 4·5단계가 깨진다. **배포보다 먼저 한다.**
2. Vercel 환경변수(Production·Preview)에 `NEXT_PUBLIC_ODSAY_API_KEY`, `KAKAO_MOBILITY_REST_KEY` 추가
3. Preview 도메인에서 ODsay를 쓰려면 ODsay 콘솔에 그 도메인도 등록해야 한다. 지금은 production과 localhost만 등록되어 있다.
