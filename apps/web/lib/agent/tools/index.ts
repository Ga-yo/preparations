import type { Tool } from "../tool";
import { checkConditions } from "./check-conditions";
import { compareComplexesTool } from "./compare-complexes";
import { getBudget } from "./get-budget";
import { getComplexDetail } from "./get-complex-detail";
import { getRegionPrices } from "./get-region-prices";
import { getTip } from "./get-tip";
import { searchComplexes } from "./search-complexes";
import { resolveRegionTool } from "./resolve-region";

// 단계와 무관하게 전부 제공
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function toolsForStage(_stage: number): Tool[] {
  return [resolveRegionTool, getBudget, getRegionPrices, checkConditions, searchComplexes, getComplexDetail, compareComplexesTool, getTip];
}
