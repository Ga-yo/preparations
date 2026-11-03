import * as R from "./tax-rates";

export type AcquisitionTaxParams = {
  price: number;
  exclusiveAreaM2: number;
  houseCountAfter: number;
  inAdjustmentArea: boolean;
  isFirstTime: boolean;
  date: string; // YYYY-MM-DD
};

export function acquisitionTax(p: AcquisitionTaxParams) {
  const heavyThreshold = p.inAdjustmentArea ? 2 : 3;
  const heavyPpm = p.houseCountAfter >= heavyThreshold + 1 ? R.HEAVY_12_PPM : p.houseCountAfter === heavyThreshold ? R.HEAVY_8_PPM : 0;
  const heavyTax = heavyPpm > 0;

  let ppm = heavyPpm;
  if (!heavyTax) {
    if (p.price <= R.STANDARD_LOW_LIMIT) ppm = R.STANDARD_LOW_PPM;
    else if (p.price > R.STANDARD_HIGH_LIMIT) ppm = R.STANDARD_HIGH_PPM;
    else ppm = Math.round((p.price / 100_000_000 * 2 / 3 - 3) * 10_000);
  }
  const of = (rate: number) => Math.floor((p.price * rate) / 1_000_000);

  const gross = of(ppm);
  const eduGross = heavyTax ? of(R.EDU_HEAVY_PPM) : Math.floor(gross * R.EDU_STANDARD_RATIO);
  const over85 = p.exclusiveAreaM2 > R.RURAL_AREA_LIMIT_M2;
  // shortcut: 생애최초 감면분의 농특세(감면세액 20%) 처리는 미반영, 필요 시 농특세법 제4조 확인 후 추가
  const rural = !over85 ? 0 : of(heavyPpm === R.HEAVY_12_PPM ? R.RURAL_PPM.heavy12 : heavyTax ? R.RURAL_PPM.heavy8 : R.RURAL_PPM.standard);

  const eligible = p.isFirstTime && !heavyTax && p.price <= R.FIRST_TIME_PRICE_LIMIT && p.date <= R.FIRST_TIME_SUNSET;
  const relief = eligible ? Math.min(R.FIRST_TIME_RELIEF_CAP, gross) : 0;
  // 제151조: 취득세 감면율만큼 지방교육세도 감면
  const edu = gross > 0 ? eduGross - Math.floor((eduGross * relief) / gross) : eduGross;

  return {
    acquisitionTax: gross, // 감면 전
    localEducationTax: edu, // 감면 후
    ruralSpecialTax: rural,
    firstTimeRelief: relief,
    total: gross - relief + edu + rural,
    heavyTax,
  };
}
