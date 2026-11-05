import type { Tool } from "../tool";
import { getBudget } from "./get-budget";
import { getTip } from "./get-tip";
import { resolveRegionTool } from "./resolve-region";

// M1은 단계와 무관하게 세 툴 전부
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function toolsForStage(_stage: number): Tool[] {
  return [resolveRegionTool, getBudget, getTip];
}
