"use client";

import { useEffect, useState } from "react";
import { carCommute, commutePoints } from "../commute-actions";
import {
  cacheKey, commuteText, parseOdsay, readCache, straightMeters, writeCache,
  type CommuteResult, type CommuteTarget,
} from "@/lib/route/commute";
import { RouteLegs } from "./Transit";

const UNAVAILABLE: CommuteResult = { status: "unavailable" };

async function fetchTransit(planId: string, complexId: number): Promise<CommuteResult> {
  const key = process.env.NEXT_PUBLIC_ODSAY_API_KEY;
  if (!key) return UNAVAILABLE;
  const p = await commutePoints(planId, complexId);
  if (!p) return UNAVAILABLE;
  const res = await fetch(
    `https://api.odsay.com/v1/api/searchPubTransPathT?SX=${p.from_lon}&SY=${p.from_lat}&EX=${p.to_lon}&EY=${p.to_lat}&apiKey=${encodeURIComponent(key)}`,
  );
  if (!res.ok) return UNAVAILABLE;
  return parseOdsay(await res.json(), straightMeters(p));
}

// undefined: 아직 확인 전(sessionStorage는 클라이언트 전용이라 서버 렌더와 맞추려고 비워 둔다)
export function Commute({ planId, complexId, target }: { planId: string; complexId: number; target: CommuteTarget }) {
  const [state, setState] = useState<CommuteResult | "loading" | undefined>(undefined);
  const { key, mode } = target;
  useEffect(() => {
    let alive = true;
    const ck = cacheKey({ mode, key, label: "" }, complexId);
    const run = async (): Promise<CommuteResult> => {
      const hit = readCache(ck);
      if (hit) return hit;
      setState("loading");
      const r = await (mode === "transit" ? fetchTransit(planId, complexId) : carCommute(planId, complexId))
        .catch((): CommuteResult => UNAVAILABLE); // URL(키 포함)이 로그에 남지 않게 원본 오류는 버린다
      writeCache(ck, r);
      return r;
    };
    void run().then((r) => { if (alive) setState(r); });
    return () => { alive = false; };
  }, [planId, complexId, key, mode]);

  if (state === undefined) return null;
  if (state === "loading") return <p className="text-chb-muted">소요시간 확인 중…</p>;
  return (
    <div>
      <p className={state.status === "unavailable" ? "text-chb-muted" : "font-medium"}>{commuteText(target, state)}</p>
      {state.status === "ok" && state.legs && <RouteLegs legs={state.legs} />}
    </div>
  );
}
