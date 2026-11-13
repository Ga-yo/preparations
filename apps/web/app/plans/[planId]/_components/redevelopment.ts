import type { RedevelopmentInfo } from "@/lib/agent/redevelopment";

// 4단계 상세·5단계 비교 표 공용 정비사업 표시 문구
export function redevelopmentText(r: RedevelopmentInfo | undefined): string {
  if (!r) return "정보 없음";
  switch (r.status) {
    case "in_zone": {
      const p = r.project;
      return `${p.project_type === "reconstruction" ? "재건축" : "재개발"} · ${p.stage}${p.stage_date ? ` (${p.stage_date})` : ""} · ${p.name}`;
    }
    case "near": return `이 단지는 매칭되지 않음 · 같은 동 정비구역 ${r.dong_zone_count}곳`;
    case "none": return "정비구역 아님(서울시 자료 기준)";
    case "not_covered": return "서울 외 지역은 정비사업 데이터 미제공";
  }
}
