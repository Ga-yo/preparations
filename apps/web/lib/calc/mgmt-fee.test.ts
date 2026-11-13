import { expect, test } from "vitest";
import { summarizeMgmtFee } from "./mgmt-fee";

const items = [
  { group: "common" as const, key: "pay", amount: 1000 },
  { group: "common" as const, key: "cleanCost", amount: 2000 },
  { group: "common" as const, key: "guardCost", amount: 3000 },
  { group: "individual" as const, key: "heatP", amount: 400 },
  { group: "individual" as const, key: "electP", amount: 600 },
];

test("sums groups and per m2", () => {
  expect(summarizeMgmtFee(items, 100)).toEqual({ common: 6000, individual: 1000, total: 7000, per_m2: 70 });
});

test("per_m2 null when area missing", () => {
  expect(summarizeMgmtFee(items, null).per_m2).toBeNull();
  expect(summarizeMgmtFee(items, 0).per_m2).toBeNull();
});
