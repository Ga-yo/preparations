// 세율 단위는 ppm(1% = 10,000). 정수 연산으로 부동소수 오차를 피한다.
// 근거는 2026-11-03에 확인한 2차 열람본(korea.legal 법령 미러). 원문 law.go.kr 대조는 확인 필요.
export const TAX_RATES_SOURCE = {
  effectiveDate: "2026-11-03",
  source:
    "지방세법 제11조·제13조의2·제151조, 농어촌특별세법 제5조, 지방세특례제한법 제36조의3 (https://korea.legal/wiki/지방세법-제13조의2, https://korea.legal/wiki/지방세특례제한법-제36조의3, https://korea.legal/wiki/지방세법-제151조)",
};

// 지방세법 제11조 제1항 제8호: 6억 이하 1%, 6~9억 (가액×2/3억 − 3)%(소수점 5째자리 반올림), 9억 초과 3%
export const STANDARD_LOW_PPM = 10_000;
export const STANDARD_HIGH_PPM = 30_000;
export const STANDARD_LOW_LIMIT = 600_000_000;
export const STANDARD_HIGH_LIMIT = 900_000_000;

// 지방세법 제13조의2: 조정 2주택·비조정 3주택 8%, 조정 3주택+·비조정 4주택+ 12%
export const HEAVY_8_PPM = 80_000;
export const HEAVY_12_PPM = 120_000;

// 제151조: 표준세율분 = 주택 취득세율의 10%(1%→0.1%, 3%→0.3%), 제13조의2 중과분 = (4% − 2%) × 20% = 0.4%
export const EDU_STANDARD_DIVISOR = 10;
export const EDU_HEAVY_PPM = 4_000;

// 농어촌특별세법: 전용 85㎡ 초과만 부과. 표준 0.2%, 8% 중과 0.6%, 12% 중과 1.0%
export const RURAL_AREA_LIMIT_M2 = 85;
export const RURAL_PPM = { standard: 2_000, heavy8: 6_000, heavy12: 10_000 };

// 지방세특례제한법 제36조의3: 12억 이하 유상취득, 200만원 한도, 2028-12-31까지 (2025-12-31 개정 반영, 확인 필요)
export const FIRST_TIME_PRICE_LIMIT = 1_200_000_000;
export const FIRST_TIME_RELIEF_CAP = 2_000_000;
export const FIRST_TIME_SUNSET = "2028-12-31";
