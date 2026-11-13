import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { summarizeMgmtFee, type FeeItem } from "@/lib/calc/mgmt-fee";
import { kaptGet } from "./client";

// 오퍼레이션 경로와 금액 필드. 공용관리비는 2026-11-12 실제 호출로 확인, 개별사용료는 포털 명세(V3) 기준이며 활용신청 반영 후 확인 필요
const COMMON_SVC = "AptCmnuseManageCostServiceV3";
const INDIVIDUAL_SVC = "AptIndvdlzManageCostServiceV3";
const PROBE_OP = "getHsmpLaborCostInfoV3";
export const COMMON_OPS = {
  getHsmpLaborCostInfoV3: ["pay", "sundryCost", "bonus", "pension", "accidentPremium", "employPremium", "nationalPension", "healthPremium", "welfareBenefit"],
  getHsmpOfcrkCostInfoV3: ["transportCost", "officeSupply", "bookSupply"],
  getHsmpTaxdueInfoV3: ["taxrestCost", "electCost", "telCost", "postageCost"],
  getHsmpClothingCostInfoV3: ["clothesCost"],
  getHsmpEduTraingCostInfoV3: ["eduCost"],
  getHsmpVhcleMntncCostInfoV3: ["carEtc", "fuelCost", "refairCost", "carInsurance"],
  getHsmpEtcCostInfoV3: ["hiddenCost", "careItemCost", "accountingCost"],
  getHsmpCleaningCostInfoV3: ["cleanCost"],
  getHsmpGuardCostInfoV3: ["guardCost"],
  getHsmpDisinfectionCostInfoV3: ["disinfCost"],
  getHsmpElevatorMntncCostInfoV3: ["elevCost"],
  getHsmpHomeNetworkMntncCostInfoV3: ["hnetwCost"],
  getHsmpRepairsCostInfoV3: ["lrefCost1"],
  getHsmpFacilityMntncCostInfoV3: ["lrefCost2"],
  getHsmpSafetyCheckUpCostInfoV3: ["lrefCost3"],
  getHsmpDisasterPreventionCostInfoV3: ["lrefCost4"],
  getHsmpConsignManageFeeInfoV3: ["manageCost"],
} as const;
export const INDIVIDUAL_OPS = {
  getHsmpHeatCostInfoV3: ["heatP", "heatC"],
  getHsmpHotWaterCostInfoV3: ["waterHotP", "waterHotC"],
  getHsmpGasRentalFeeInfoV3: ["gasP", "gasC"],
  getHsmpElectricityCostInfoV3: ["electP", "electC"],
  getHsmpWaterCostInfoV3: ["waterCoolP", "waterCoolC"],
  getHsmpDomesticWasteFeeInfoV3: ["scrap"],
  getHsmpMovingInRepresentationMtgInfoV3: ["preMeet"],
  getHsmpBuildingInsuranceFeeInfoV3: ["buildInsu"],
  getHsmpElectionOrpnsInfoV3: ["electionMng"],
  getHsmpWaterPurifierTankFeeInfoV3: ["purifi"],
} as const;

type Item = Record<string, unknown>;
type Basis = { kaptName: string; kaptAddr: string | null; kaptMarea: number | null };
export type MgmtFeeResult =
  | {
      status: "ok"; kapt_code: string; kapt_name: string; month: string; common: number; individual: number | null; total: number; per_m2: number | null;
      partial: boolean; individual_status: "disabled" | "unavailable" | "empty" | "ok"; fetched_at: string;
    }
  | { status: "not_found"; reason: "no_kapt_match" | "no_recent_fee" }
  | { status: "error" };

const itemOf = (body: unknown) => (body as { response: { body: { item?: Item | null } } }).response.body.item ?? null;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toItems = (group: FeeItem["group"], item: Item, fields: readonly string[]): FeeItem[] =>
  fields.map((key) => ({ group, key, amount: num(item[key]) }));

// 서버리스 인스턴스 간에 공유되도록 remote 핸들러를 쓴다(로컬은 기본 in-memory). 아래 캐시 함수는 성공·미발견 값만 돌려주고, API 오류는 throw로 빠져나가 캐시에 남지 않는다
async function kaptListByDong(bjdCode: string): Promise<{ kaptCode: string; kaptName: string }[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(`kapt-list-${bjdCode}`);
  const out: { kaptCode: string; kaptName: string }[] = [];
  for (let page = 1; ; page++) {
    const body = (await kaptGet("AptListService4/getLegaldongAptList4", { bjdCode, numOfRows: "100", pageNo: String(page) })) as {
      response: { body: { items?: { kaptCode: string; kaptName: string }[] | null; totalCount: number | string } };
    };
    const items = body.response.body.items ?? [];
    out.push(...items.map(({ kaptCode, kaptName }) => ({ kaptCode, kaptName })));
    if (!items.length || out.length >= Number(body.response.body.totalCount)) return out;
  }
}

async function kaptBasis(kaptCode: string): Promise<Basis | null> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(`kapt-basis-${kaptCode}`);
  const it = itemOf(await kaptGet("AptBasisInfoServiceV5/getAphusBassInfoV5", { kaptCode }));
  if (!it?.kaptCode) return null;
  return { kaptName: String(it.kaptName), kaptAddr: it.kaptAddr ? String(it.kaptAddr) : null, kaptMarea: Number(it.kaptMarea) || null };
}

// 부과 내역이 없는 달은 200에 모든 필드가 null로 온다
async function kaptMonthProbe(kaptCode: string, ym: string): Promise<Item | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(`kapt-fee-${kaptCode}`);
  const it = itemOf(await kaptGet(`${COMMON_SVC}/${PROBE_OP}`, { kaptCode, searchDate: ym }));
  return it?.kaptCode ? it : null;
}

async function kaptCommonFee(kaptCode: string, ym: string, probe: Item): Promise<{ items: FeeItem[]; fetched_at: string }> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(`kapt-fee-${kaptCode}`);
  const rest = Object.entries(COMMON_OPS).filter(([op]) => op !== PROBE_OP);
  const bodies = await Promise.all(rest.map(([op]) => kaptGet(`${COMMON_SVC}/${op}`, { kaptCode, searchDate: ym })));
  const items = [
    ...toItems("common", probe, COMMON_OPS[PROBE_OP]),
    ...rest.flatMap(([, fields], i) => toItems("common", itemOf(bodies[i]) ?? {}, fields)),
  ];
  return { items, fetched_at: new Date().toISOString() };
}

// 하나라도 실패하면 throw — 호출부가 unavailable로 바꾼다. 모두 비어 있으면 null(이 달 부과 내역 없음)
async function kaptIndividualFee(kaptCode: string, ym: string): Promise<FeeItem[] | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(`kapt-fee-${kaptCode}`);
  const ops = Object.entries(INDIVIDUAL_OPS);
  const its = (await Promise.all(ops.map(([op]) => kaptGet(`${INDIVIDUAL_SVC}/${op}`, { kaptCode, searchDate: ym })))).map(itemOf);
  if (its.every((it) => !it?.kaptCode)) return null;
  return ops.flatMap(([, fields], i) => toItems("individual", its[i] ?? {}, fields));
}

const normName = (s: string) => s.replace(/\([^)]*\)/g, "").replace(/아파트/g, "").replace(/\s+/g, "");
// "서울특별시 강남구 개포동 1282 단지명", "… 역삼동 653-4번지"에서 본번-부번을 뽑는다
const jibunOf = (s: string | null) => {
  const m = s?.match(/(?:^|\s)(산?\d+(?:-\d+)?)(?:번지)?(?=\s|$)/);
  return m ? m[1].replace(/-0+$/, "") : null;
};

async function matchKapt(c: { name: string; region_code: string; jibun_address: string | null }) {
  const list = await kaptListByDong(c.region_code);
  const name = normName(c.name);
  const exact = list.filter((k) => normName(k.kaptName) === name);
  const jibun = jibunOf(c.jibun_address);
  if (exact.length === 1) {
    // 대장 단지가 K-apt에 없고 같은 동에 같은 이름이 있으면 남의 관리비를 보여주게 된다. 지번이 둘 다 있으면 대조한다
    const kj = jibun && jibunOf((await kaptBasis(exact[0].kaptCode))?.kaptAddr ?? null);
    return !kj || kj === jibun ? exact[0] : null;
  }
  if (!jibun) return null;
  const candidates = (exact.length ? exact : list.filter((k) => { const n = normName(k.kaptName); return n.includes(name) || name.includes(n); })).slice(0, 5);
  const bases = await Promise.all(candidates.map((k) => kaptBasis(k.kaptCode)));
  const hits = candidates.filter((_, i) => jibunOf(bases[i]?.kaptAddr ?? null) === jibun);
  return hits.length === 1 ? hits[0] : null;
}

const prevMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

const logFail = (msg: string, complex_id: number, e: unknown) =>
  console.error(msg, { complex_id, status: (e as { status?: unknown }).status ?? null, name: (e as Error)?.name });

// 개별사용료: 활용신청 승인 전에는 env로 끄고, 실패는 캐시하지 않고 unavailable로 바꾼다
async function individualFee(complex_id: number, kaptCode: string, ym: string) {
  if (process.env.KAPT_INDIVIDUAL_FEES !== "1") return { individual_status: "disabled" as const, items: null };
  try {
    const items = await kaptIndividualFee(kaptCode, ym);
    return items ? { individual_status: "ok" as const, items } : { individual_status: "empty" as const, items: null };
  } catch (e) {
    logFail("kapt individual fee failed", complex_id, e);
    return { individual_status: "unavailable" as const, items: null };
  }
}

// 캐시하지 않는 진입점: 오류는 여기서 잡아 status: "error"로 바꾼다(캐시에 남지 않음)
export async function getMgmtFee(
  complex: { id: number; name: string; region_code: string; jibun_address: string | null; kapt_code?: string | null },
  today: string, // KST YYYY-MM-DD
): Promise<MgmtFeeResult> {
  try {
    const kaptCode = complex.kapt_code ?? (await matchKapt(complex))?.kaptCode;
    if (!kaptCode) return { status: "not_found", reason: "no_kapt_match" };
    let month = today.slice(0, 7);
    let probe: Item | null = null;
    for (let i = 0; i < 3 && !probe; i++) { // 최근 3개월 중 먼저 부과 내역이 있는 달
      month = prevMonth(month);
      probe = await kaptMonthProbe(kaptCode, month.replace("-", ""));
    }
    if (!probe) return { status: "not_found", reason: "no_recent_fee" };
    const ym = month.replace("-", "");
    const [common, individual, basis] = await Promise.all([
      kaptCommonFee(kaptCode, ym, probe),
      individualFee(complex.id, kaptCode, ym),
      kaptBasis(kaptCode),
    ]);
    const s = summarizeMgmtFee([...common.items, ...(individual.items ?? [])], basis?.kaptMarea ?? null);
    return {
      status: "ok", kapt_code: kaptCode, kapt_name: basis?.kaptName ?? String(probe.kaptName), month,
      common: s.common, individual: individual.items ? s.individual : null, total: s.total, per_m2: s.per_m2,
      partial: !individual.items, individual_status: individual.individual_status, fetched_at: common.fetched_at,
    };
  } catch (e) {
    // 원본 메시지에 URL이 섞일 수 있어 단지 id·상태코드·예외 이름만 남긴다
    logFail("kapt mgmt_fee failed", complex.id, e);
    return { status: "error" };
  }
}
