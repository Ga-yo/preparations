import type { Tool } from "../tool";
import { getBudget } from "./get-budget";
import { getRegionPrices } from "./get-region-prices";
import { getTip } from "./get-tip";
import { resolveRegionTool } from "./resolve-region";

// 단계와 무관하게 전부 제공
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function toolsForStage(_stage: number): Tool[] {
  return [resolveRegionTool, getBudget, getRegionPrices, getTip];
}
