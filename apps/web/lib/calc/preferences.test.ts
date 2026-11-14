import { describe, expect, it } from "vitest";
import type { ComplexRow, Conditions } from "./conditions";
import { applyParkingDefault, lifeNotices, profileNotices, tieBreakers, weightsFor, type LifePrefs } from "./preferences";

const P: LifePrefs = { uses_transit: null, school_importance: null, infra_importance: null, environment_prefs: [], parking_required: null };
const row = (o: Partial<ComplexRow>) => ({ nearest_park_m: null, shop_count_500m: null, ...o }) as ComplexRow;

describe("weightsFor", () => {
  it("transit doubles station weight", () => expect(weightsFor({ ...P, uses_transit: true })).toEqual({ station_distance_max: 2 }));
  it("school importance 4+ doubles elementary weight", () => {
    expect(weightsFor({ ...P, school_importance: 4 })).toEqual({ elementary_distance_max: 2 });
    expect(weightsFor({ ...P, school_importance: 3 })).toEqual({});
  });
});

describe("tieBreakers", () => {
  it("orders by stated preferences", () => {
    expect(tieBreakers({ ...P, uses_transit: true, school_importance: 5, infra_importance: 4, environment_prefs: ["near_park"] })).toEqual([
      { field: "nearest_station_m", dir: 1 }, { field: "nearest_elementary_m", dir: 1 },
      { field: "shop_count_500m", dir: -1 }, { field: "nearest_park_m", dir: 1 },
    ]);
  });
  it("near_commercial uses shop count once", () => {
    expect(tieBreakers({ ...P, infra_importance: 5, environment_prefs: ["near_commercial"] })).toEqual([{ field: "shop_count_500m", dir: -1 }]);
  });
  it("none when nothing important", () => expect(tieBreakers({ ...P, school_importance: 2 })).toEqual([]));
});

describe("applyParkingDefault", () => {
  const c = { parking_per_household_min: null, priorities: {} } as unknown as Conditions;
  it("parking required fills one per household", () => {
    expect(applyParkingDefault(c, { ...P, parking_required: true }).parking_per_household_min).toBe(1);
  });
  it("stage 3 value wins", () => {
    expect(applyParkingDefault({ ...c, parking_per_household_min: 1.5 }, { ...P, parking_required: true }).parking_per_household_min).toBe(1.5);
  });
  it("not required leaves null", () => expect(applyParkingDefault(c, P).parking_per_household_min).toBeNull());
});

describe("lifeNotices", () => {
  it("quiet has no data", () => expect(lifeNotices({ ...P, environment_prefs: ["quiet"] }, [])).toEqual(["quiet_no_data"]));
  it("park and shop data missing", () => {
    expect(lifeNotices({ ...P, infra_importance: 5, environment_prefs: ["near_park"] }, [row({})])).toEqual(["no_park_data", "no_shop_data"]);
    expect(lifeNotices({ ...P, environment_prefs: ["near_park"] }, [row({ nearest_park_m: 300 })])).toEqual([]);
  });
});

describe("profileNotices", () => {
  it("investment purpose is not analysed", () => {
    expect(profileNotices({ purpose: "invest", timeline: null })).toEqual(["invest_not_supported"]);
    expect(profileNotices({ purpose: "both", timeline: "6m" })).toEqual(["invest_not_supported"]);
  });
  it("long timeline needs recheck", () => {
    expect(profileNotices({ purpose: "live", timeline: "2_3y" })).toEqual(["recheck_regulation"]);
    expect(profileNotices({ purpose: null, timeline: "undecided" })).toEqual(["recheck_regulation"]);
    expect(profileNotices({ purpose: "live", timeline: "1y" })).toEqual([]);
  });
});
