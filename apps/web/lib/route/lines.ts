// 수도권 전철 노선 공식 색상(운영사 노선도 기준)과 서울버스 유형 색상. 화면 강조용
const SUBWAY: [RegExp, string][] = [
  [/^1호선/, "#0052A4"], [/^2호선/, "#00A84D"], [/^3호선/, "#EF7C1C"], [/^4호선/, "#00A5DE"],
  [/^5호선/, "#996CAC"], [/^6호선/, "#CD7C2F"], [/^7호선/, "#747F00"], [/^8호선/, "#E6186C"], [/^9호선/, "#BDB092"],
  [/경의|중앙/, "#77C4A3"], [/수인|분당/, "#F5A200"], [/신분당/, "#D4003B"], [/공항/, "#0090D2"],
  [/경춘/, "#0C8E72"], [/우이신설/, "#B0CE18"], [/신림/, "#6789CA"], [/서해/, "#8FC31F"],
  [/김포/, "#A17800"], [/의정부/, "#FDA600"], [/에버라인|용인/, "#509F22"], [/경강/, "#003DA5"],
  [/인천\s*1/, "#7CA8D5"], [/인천\s*2/, "#ED8B00"], [/GTX/i, "#9A6292"],
];
const GRAY = "#6B7280";

// "수도권 2호선"·"서울 9호선"·"2호선" 모두 같은 색. 신분당이 분당보다 먼저 맞도록 순서를 둔다
export function lineColor(line: string): string {
  const n = line.replace(/^(수도권|서울|인천)\s+(?=\d)/, "").trim();
  if (/신분당/.test(n)) return "#D4003B";
  return SUBWAY.find(([re]) => re.test(n))?.[1] ?? GRAY;
}

// 화면에 보일 짧은 노선명: "수도권 2호선" → "2호선"
export const lineLabel = (line: string) => line.replace(/^(수도권|서울)\s+/, "").trim();

// ODsay 버스 type 코드 → 서울버스 색상(간선 파랑, 지선·마을 초록, 순환 노랑, 광역·직행 빨강, 공항 하늘)
export function busColor(type: number | null): string {
  switch (type) {
    case 11: case 26: return "#3D5BAB";
    case 12: case 3: return "#5BB025";
    case 13: return "#F99D1C";
    case 14: case 4: case 15: return "#E60012";
    case 5: return "#00A0E9";
    default: return GRAY;
  }
}
