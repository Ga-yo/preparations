import type { Database } from "@repo/db-types";

type Tables = Database["public"]["Tables"];
export type LoanRule = Tables["loan_rules"]["Row"];
export type RegulatedArea = Tables["regulated_areas"]["Row"];
export type LoanProduct = Tables["loan_products"]["Row"];

export type BuyerType = "first_time" | "homeless" | "one_house" | "multi_house";
export type AreaType =
  | "speculative_overheated"
  | "adjustment_target"
  | "speculation_zone"
  | "land_transaction_permit";
