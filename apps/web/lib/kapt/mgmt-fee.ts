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
  | { status: "ok"; kapt_code: string; kapt_name: string; month: string; common: number; individual: number | null; total: number; per_m2: number | null; partial: boolean; fetched_at: string }
  | { status: "not_found"; reason: "no_kapt_match" | "no_recent_fee" }
  | { status: "error" };

const itemOf = (body: unknown) => (body as { response: { body: { item?: Item | null } } }).response.body.item ?? null;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const toItems = (group: FeeItem["group"], item: Item, fields: readonly string[]): FeeItem[] =>
  fields.map((key) => ({ group, key, amount: num(item[key]) }));

// 아래 캐시 함수는 성공·미발견 값만 돌려주고, API 오류는 throw로 빠져나가 캐시에 남지 않는다
async function kaptListByDong(bjdCode: string): Promise<{ kaptCode: string; kaptName: string }[]> {
  "use cache";
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
  "use cache";
  cacheLife("max");
  cacheTag(`kapt-basis-${kaptCode}`);
  const it = itemOf(await kaptGet("AptBasisInfoServiceV5/getAphusBassInfoV5", { kaptCode }));
  if (!it?.kaptCode) return null;
  return { kaptName: String(it.kaptName), kaptAddr: it.kaptAddr ? String(it.kaptAddr) : null, kaptMarea: Number(it.kaptMarea) || null };
}

// 부과 내역이 없는 달은 200에 모든 필드가 null로 온다
async function kaptMonthProbe(kaptCode: string, ym: string): Promise<Item | null> {
  "use cache";
  cacheLife("days");
  cacheTag(`kapt-fee-${kaptCode}`);
  const it = itemOf(await kaptGet(`${COMMON_SVC}/${PROBE_OP}`, { kaptCode, searchDate: ym }));
  return it?.kaptCode ? it : null;
}

async function kaptCommonFee(kaptCode: string, ym: string, probe: Item): Promise<{ items: FeeItem[]; fetched_at: string }> {
  "use cache";
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

// 하나라도 실패하면 throw — 호출부가 개별사용료 없음(partial)으로 바꾼다
async function kaptIndividualFee(kaptCode: string, ym: string): Promise<FeeItem[] | null> {
  "use cache";
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
  if (exact.length === 1) return exact[0];
  const jibun = jibunOf(c.jibun_address);
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

// 캐시하지 않는 진입점: 오류는 여기서 잡아 status: "error"로 바꾼다(캐시에 남지 않음)
export async function getMgmtFee(
  complex: { id: number; name: string; region_code: string; jibun_address: string | null; kapt_code?: string | null },
  today: string, // KST YYYY-MM-DD
): Promise<MgmtFeeResult> {
  try {
    const kaptCode = complex.kapt_code ?? (await matchKapt(complex))?.kaptCode;
    if (!kaptCode) return { status: "not_found", reason: "no_kapt_match" };
    let month = prevMonth(today.slice(0, 7));
    let probe = await kaptMonthProbe(kaptCode, month.replace("-", ""));
    if (!probe) {
      month = prevMonth(month);
      probe = await kaptMonthProbe(kaptCode, month.replace("-", ""));
    }
    if (!probe) return { status: "not_found", reason: "no_recent_fee" };
    const ym = month.replace("-", "");
    const [common, individual, basis] = await Promise.all([
      kaptCommonFee(kaptCode, ym, probe),
      kaptIndividualFee(kaptCode, ym).catch(() => null),
      kaptBasis(kaptCode),
    ]);
    const s = summarizeMgmtFee([...common.items, ...(individual ?? [])], basis?.kaptMarea ?? null);
    return {
      status: "ok", kapt_code: kaptCode, kapt_name: basis?.kaptName ?? String(probe.kaptName), month,
      common: s.common, individual: individual ? s.individual : null, total: s.total, per_m2: s.per_m2,
      partial: !individual, fetched_at: common.fetched_at,
    };
  } catch (e) {
    // 원본 메시지에 URL이 섞일 수 있어 단지 id·상태코드·예외 이름만 남긴다
    console.error("kapt mgmt_fee failed", { complex_id: complex.id, status: (e as { status?: unknown }).status ?? null, name: (e as Error)?.name });
    return { status: "error" };
  }
}
